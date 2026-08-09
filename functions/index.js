const functions = require("firebase-functions/v1");
// firebase-admin v13 removed the namespaced `admin.apps` and `admin.database()`.
// These are the modular equivalents; nothing else in this file used the old shape.
const { getApps, initializeApp } = require("firebase-admin/app");
const { getDatabase } = require("firebase-admin/database");
const nodemailer = require("nodemailer");

if (!getApps().length) {
  initializeApp();
}

const db = getDatabase();

function firstNonEmpty(...values) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
    if (typeof value === "boolean") return String(value);
  }
  return "";
}

const SUPPORT_EMAIL = firstNonEmpty(
  process.env.SUPPORT_EMAIL,
  process.env.REACT_APP_SUPPORT_EMAIL,
  "support@pointpoker.app",
);
const OWNER_NOTIFICATION_EMAIL = firstNonEmpty(
  process.env.OWNER_NOTIFICATION_EMAIL,
  SUPPORT_EMAIL,
);
const SMTP_HOST = firstNonEmpty(
  process.env.ZOHO_SMTP_HOST,
  process.env.SMTP_HOST,
  "smtp.zoho.eu",
);
const SMTP_PORT = Number(
  firstNonEmpty(
    process.env.ZOHO_SMTP_PORT,
    process.env.SMTP_PORT,
    "465",
  ),
);
const SMTP_SECURE = firstNonEmpty(
  process.env.ZOHO_SMTP_SECURE,
  process.env.SMTP_SECURE,
  "true",
) !== "false";
const SMTP_USER = firstNonEmpty(
  process.env.ZOHO_SMTP_USER,
  process.env.SMTP_USER,
  SUPPORT_EMAIL,
);
const SMTP_PASS = firstNonEmpty(
  process.env.ZOHO_SMTP_PASS,
  process.env.SMTP_PASS,
);
const MAIL_FROM_NAME = firstNonEmpty(
  process.env.MAIL_FROM_NAME,
  "Point Poker",
);
const FUNCTION_SERVICE_ACCOUNT = firstNonEmpty(
  process.env.FUNCTION_SERVICE_ACCOUNT,
  "planning-poker-b6ac1@appspot.gserviceaccount.com",
);

let cachedTransporter = null;

function getTransporter() {
  if (!SMTP_USER || !SMTP_PASS) return null;
  if (!cachedTransporter) {
    cachedTransporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: SMTP_SECURE,
      auth: {
        user: SMTP_USER,
        pass: SMTP_PASS,
      },
    });
  }
  return cachedTransporter;
}

function escapeHtml(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}


function formatTimestamp(timestamp = Date.now()) {
  return new Date(timestamp).toISOString();
}


function notificationPath(uid, key) {
  return `/ops/notifications/${uid}/${key}`;
}

async function beginNotification(uid, key, payload = {}) {
  const ref = db.ref(notificationPath(uid, key));
  const claimedAt = Date.now();
  const claim = {
    ...payload,
    claimedAt,
    processing: true,
    updatedAt: claimedAt,
  };
  const result = await ref.transaction((current) => {
    if (current?.sentAt || current?.processing) return;
    return { ...(current || {}), ...claim };
  });
  const currentValue = result.snapshot.val() || {};
  return result.committed && currentValue.claimedAt === claimedAt;
}

async function markNotificationSent(uid, key, meta = {}) {
  await db.ref(notificationPath(uid, key)).update({
    ...meta,
    processing: false,
    sentAt: Date.now(),
    updatedAt: Date.now(),
    lastError: null,
  });
}

async function markNotificationFailed(uid, key, error) {
  await db.ref(notificationPath(uid, key)).update({
    processing: false,
    failedAt: Date.now(),
    updatedAt: Date.now(),
    lastError: String(error?.message || error || "Unknown email error").slice(0, 500),
  });
}

async function sendEmail(message) {
  const transporter = getTransporter();
  if (!transporter) {
    throw new Error("Notification mail transport is not configured.");
  }
  return transporter.sendMail({
    from: `"${MAIL_FROM_NAME}" <${SUPPORT_EMAIL}>`,
    replyTo: SUPPORT_EMAIL,
    ...message,
  });
}

function ownerSignupEmail(profile, uid) {
  const subject = `New Point Poker account: ${profile.email || uid}`;
  const text = [
    "A new Point Poker account has been created.",
    "",
    `Name: ${profile.displayName || "Not set yet"}`,
    `Email: ${profile.email || "Unavailable"}`,
    `UID: ${uid}`,
    `Plan: ${profile.plan || "free"}`,
    `Created at: ${formatTimestamp(profile.createdAt || Date.now())}`,
  ].join("\n");
  const html = `
    <h2>New Point Poker account</h2>
    <p>A new Point Poker account has been created.</p>
    <ul>
      <li><strong>Name:</strong> ${escapeHtml(profile.displayName || "Not set yet")}</li>
      <li><strong>Email:</strong> ${escapeHtml(profile.email || "Unavailable")}</li>
      <li><strong>UID:</strong> ${escapeHtml(uid)}</li>
      <li><strong>Plan:</strong> ${escapeHtml(profile.plan || "free")}</li>
      <li><strong>Created at:</strong> ${escapeHtml(formatTimestamp(profile.createdAt || Date.now()))}</li>
    </ul>
  `;
  return { subject, text, html };
}


exports.notifyOwnerOnSignup = functions
  .runWith({ serviceAccount: FUNCTION_SERVICE_ACCOUNT })
  .database.ref("/users/{uid}")
  .onCreate(async (snapshot, context) => {
  const uid = context.params.uid;
  const profile = snapshot.val() || {};

  if (!profile.email) {
    functions.logger.warn("Skipping signup owner notification because email is missing.", { uid });
    return null;
  }

  const claimed = await beginNotification(uid, "signupOwner", {
    type: "signupOwner",
    email: profile.email,
  });
  if (!claimed) return null;

  try {
    const message = ownerSignupEmail(profile, uid);
    await sendEmail({
      to: OWNER_NOTIFICATION_EMAIL,
      subject: message.subject,
      text: message.text,
      html: message.html,
    });
    await markNotificationSent(uid, "signupOwner", {
      to: OWNER_NOTIFICATION_EMAIL,
      subject: message.subject,
    });
    functions.logger.info("Sent signup owner notification.", { uid, email: profile.email });
    return null;
  } catch (error) {
    await markNotificationFailed(uid, "signupOwner", error);
    functions.logger.error("Failed to send signup owner notification.", { uid, error });
    throw error;
  }
  });


/* ═══════════════════ STALE ROOM REAPER ═══════════════════
   Rooms whose occupants all closed the tab before the five-hour in-app expiry
   are never cleaned by anyone, because nothing in a browser can find them.
   Reaping needs to list /rooms, and no client may read /rooms — the room code
   is the only thing protecting a live session, so an enumerable room list
   would hand every session on the site to anyone who asked for it.

   That makes this an admin-SDK job. It used to be attempted from the client
   (sweepStaleRooms in src/App.js), where the read was denied every time and a
   bare catch hid it, so rooms have been accumulating since launch.

   Deploy with:  npx firebase-tools deploy --only functions:reapStaleRooms
═════════════════════════════════════════════════════════════ */

const SESSION_MAX_MS = 5 * 60 * 60 * 1000; // matches SESSION_MAX_MS in src/App.js
const DEFAULT_TIMER_DURATION = 30;

// A team room is a permanent address, so it is reset rather than deleted:
// the same URL has to keep working for the next sprint.
function freshTeamRoomState(roomId, room, now) {
  const duration =
    Number(room && room.timer && room.timer.duration) || DEFAULT_TIMER_DURATION;
  return {
    createdAt: now,
    revealed: false,
    round: 1,
    storiesDone: 0,
    streak: 0,
    consensusCount: 0,
    deck: (room && room.deck) || "fibonacci",
    plan: "free", // every room is free; writing "pro" here is rejected by the rules
    teamName: (room && room.teamName) || roomId,
    founderRoom: !!(room && room.founderRoom),
    timer: { running: false, duration, remaining: duration, startedBy: null },
    players: {},
  };
}

exports.reapStaleRooms = functions
  .runWith({ timeoutSeconds: 300, memory: "512MB" })
  .pubsub.schedule("every 6 hours")
  .timeZone("Europe/London")
  .onRun(async () => {
    const now = Date.now();
    const cutoff = now - SESSION_MAX_MS;

    // Only expired rooms come back, not the whole table. Needs
    // ".indexOn": ["createdAt"] on rooms, which database.rules.json declares.
    const snap = await db
      .ref("rooms")
      .orderByChild("createdAt")
      .endAt(cutoff)
      .once("value");

    if (!snap.exists()) {
      functions.logger.info("reapStaleRooms: nothing to reap.");
      return null;
    }

    const rooms = snap.val() || {};
    const updates = {};
    let deleted = 0;
    let reset = 0;

    Object.keys(rooms).forEach((roomId) => {
      const room = rooms[roomId];
      const createdAt = Number(room && room.createdAt) || 0;
      // endAt also returns rooms with no createdAt at all, since null sorts
      // first. Leave those alone rather than guessing their age.
      if (!createdAt || now - createdAt < SESSION_MAX_MS) return;

      // Room-level paths only. A multi-path update may not contain both a path
      // and its own descendant, and mixing the two is what broke the client
      // sweeper this replaces.
      if (room && (room.teamName || room.founderRoom)) {
        updates["rooms/" + roomId] = freshTeamRoomState(roomId, room, now);
        reset += 1;
      } else {
        updates["rooms/" + roomId] = null;
        deleted += 1;
      }
    });

    if (!deleted && !reset) {
      functions.logger.info("reapStaleRooms: no rooms past the cutoff.");
      return null;
    }

    await db.ref().update(updates);
    functions.logger.info("reapStaleRooms: done.", { deleted, reset });
    return null;
  });
