const functions = require("firebase-functions/v1");
const admin = require("firebase-admin");
const nodemailer = require("nodemailer");

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.database();

function firstNonEmpty(...values) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
    if (typeof value === "boolean") return String(value);
  }
  return "";
}

const APP_BASE_URL = firstNonEmpty(
  process.env.APP_BASE_URL,
  "https://www.pointpoker.app",
);
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

function teamCode(name = "") {
  return (
    String(name || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, "")
      .replace(/\s+/g, "-")
      .replace(/-{2,}/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 24) || "team"
  );
}

function escapeHtml(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function deriveDisplayNameFallback(email = "") {
  const local = String(email || "").split("@")[0]?.trim();
  if (!local) return "Alex Johnson";
  return local
    .replace(/[._-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function deriveTeamRoomName(displayName = "", email = "") {
  const base = String(displayName || deriveDisplayNameFallback(email) || "Team").trim();
  if (!base) return "My Team";
  return /team$/i.test(base) ? base : `${base} Team`;
}

function clampTeamRoomLabel(name = "", fallback = "My Team") {
  const cleaned = String(name || "").replace(/\s+/g, " ").trim();
  const nextValue = cleaned || fallback;
  return nextValue.length <= 60 ? nextValue : nextValue.slice(0, 60).trim();
}

function deriveSecondaryTeamRoomName(primaryName = "", displayName = "", email = "") {
  const fallbackPrimary = deriveTeamRoomName(displayName, email);
  const primary = clampTeamRoomLabel(primaryName || fallbackPrimary, fallbackPrimary);
  const suffix = " 2";
  const base = primary.replace(/\s+2$/i, "");
  const trimmedBase =
    base.length + suffix.length <= 60 ? base : base.slice(0, 60 - suffix.length).trim();
  return clampTeamRoomLabel(`${trimmedBase}${suffix}`, "My Team 2");
}

function resolveDedicatedTeamRooms(profile = {}) {
  const displayName = profile.displayName || "";
  const email = profile.email || "";
  const primaryFallback = deriveTeamRoomName(displayName, email);
  const primary = clampTeamRoomLabel(
    profile?.teamRooms?.primary || profile.teamRoomName || primaryFallback,
    primaryFallback,
  );
  let secondary = clampTeamRoomLabel(
    profile?.teamRooms?.secondary || deriveSecondaryTeamRoomName(primary, displayName, email),
    deriveSecondaryTeamRoomName(primary, displayName, email),
  );
  if (secondary === primary) secondary = deriveSecondaryTeamRoomName(primary, displayName, email);
  return { primary, secondary };
}

function formatTimestamp(timestamp = Date.now()) {
  return new Date(timestamp).toISOString();
}

function roomUrl(name = "") {
  return `${APP_BASE_URL}/t/${teamCode(name)}`;
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

function ownerProEmail(profile, uid) {
  const teamRooms = resolveDedicatedTeamRooms(profile);
  const subject = `Point Poker Pro activated: ${profile.email || uid}`;
  const text = [
    "A Point Poker account is now active on Pro.",
    "",
    `Name: ${profile.displayName || "Not set yet"}`,
    `Email: ${profile.email || "Unavailable"}`,
    `UID: ${uid}`,
    `Activated at: ${formatTimestamp(profile.proActivatedAt || Date.now())}`,
    `Primary Team Room: ${roomUrl(teamRooms.primary)}`,
    `Secondary Team Room: ${roomUrl(teamRooms.secondary)}`,
    profile.proKey ? `Activation key: ${profile.proKey}` : null,
  ].filter(Boolean).join("\n");
  const html = `
    <h2>Point Poker Pro activated</h2>
    <p>A Point Poker account is now active on Pro.</p>
    <ul>
      <li><strong>Name:</strong> ${escapeHtml(profile.displayName || "Not set yet")}</li>
      <li><strong>Email:</strong> ${escapeHtml(profile.email || "Unavailable")}</li>
      <li><strong>UID:</strong> ${escapeHtml(uid)}</li>
      <li><strong>Activated at:</strong> ${escapeHtml(formatTimestamp(profile.proActivatedAt || Date.now()))}</li>
      <li><strong>Primary Team Room:</strong> <a href="${escapeHtml(roomUrl(teamRooms.primary))}">${escapeHtml(roomUrl(teamRooms.primary))}</a></li>
      <li><strong>Secondary Team Room:</strong> <a href="${escapeHtml(roomUrl(teamRooms.secondary))}">${escapeHtml(roomUrl(teamRooms.secondary))}</a></li>
      ${
        profile.proKey
          ? `<li><strong>Activation key:</strong> ${escapeHtml(profile.proKey)}</li>`
          : ""
      }
    </ul>
  `;
  return { subject, text, html };
}

function userProEmail(profile) {
  const teamRooms = resolveDedicatedTeamRooms(profile);
  const displayName = profile.displayName || deriveDisplayNameFallback(profile.email);
  const primaryUrl = roomUrl(teamRooms.primary);
  const secondaryUrl = roomUrl(teamRooms.secondary);
  const subject = "Your Point Poker Pro access is active";
  const text = [
    `Hi ${displayName},`,
    "",
    "Your Point Poker Pro access is now active.",
    "",
    "You can now use:",
    "- up to 20 participants",
    "- Sprint History",
    "- 2 dedicated Team Room URLs",
    "",
    `Primary Team Room: ${primaryUrl}`,
    `Secondary Team Room: ${secondaryUrl}`,
    "",
    `Need help? Reply to ${SUPPORT_EMAIL}`,
  ].join("\n");
  const html = `
    <p>Hi ${escapeHtml(displayName)},</p>
    <p>Your Point Poker Pro access is now active.</p>
    <p>You can now use:</p>
    <ul>
      <li>up to 20 participants</li>
      <li>Sprint History</li>
      <li>2 dedicated Team Room URLs</li>
    </ul>
    <p><strong>Primary Team Room:</strong> <a href="${escapeHtml(primaryUrl)}">${escapeHtml(primaryUrl)}</a></p>
    <p><strong>Secondary Team Room:</strong> <a href="${escapeHtml(secondaryUrl)}">${escapeHtml(secondaryUrl)}</a></p>
    <p>Need help? Reply to <a href="mailto:${escapeHtml(SUPPORT_EMAIL)}">${escapeHtml(SUPPORT_EMAIL)}</a>.</p>
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

exports.notifyOnProActivation = functions
  .runWith({ serviceAccount: FUNCTION_SERVICE_ACCOUNT })
  .database.ref("/users/{uid}")
  .onWrite(async (change, context) => {
  if (!change.after.exists()) return null;

  const uid = context.params.uid;
  const before = change.before.val() || {};
  const after = change.after.val() || {};
  const wasActivePro = before.plan === "pro" && before.billingStatus === "active";
  const isActivePro = after.plan === "pro" && after.billingStatus === "active";

  if (!isActivePro || wasActivePro) return null;

  const failures = [];
  const ownerMessage = ownerProEmail(after, uid);
  const userMessage = userProEmail(after);

  if (await beginNotification(uid, "proOwner", { type: "proOwner", email: after.email || "" })) {
    try {
      await sendEmail({
        to: OWNER_NOTIFICATION_EMAIL,
        subject: ownerMessage.subject,
        text: ownerMessage.text,
        html: ownerMessage.html,
      });
      await markNotificationSent(uid, "proOwner", {
        to: OWNER_NOTIFICATION_EMAIL,
        subject: ownerMessage.subject,
      });
      functions.logger.info("Sent Pro owner notification.", { uid, email: after.email || "" });
    } catch (error) {
      await markNotificationFailed(uid, "proOwner", error);
      functions.logger.error("Failed to send Pro owner notification.", { uid, error });
      failures.push(error);
    }
  }

  if (after.email && await beginNotification(uid, "proUser", { type: "proUser", email: after.email })) {
    try {
      await sendEmail({
        to: after.email,
        subject: userMessage.subject,
        text: userMessage.text,
        html: userMessage.html,
      });
      await markNotificationSent(uid, "proUser", {
        to: after.email,
        subject: userMessage.subject,
      });
      functions.logger.info("Sent Pro user notification.", { uid, email: after.email });
    } catch (error) {
      await markNotificationFailed(uid, "proUser", error);
      functions.logger.error("Failed to send Pro user notification.", { uid, error });
      failures.push(error);
    }
  }

  if (failures.length) throw failures[0];
  return null;
  });
