import { useState, useEffect, useCallback } from "react";
import { db } from "./firebase";
import {
  ref,
  set,
  onValue,
  update,
  remove,
  push,
  serverTimestamp,
} from "firebase/database";

// ── Fibonacci cards + wildcard ──────────────────────────────
const CARDS = [
  { val: "1", suit: "♠", red: false },
  { val: "2", suit: "♣", red: false },
  { val: "3", suit: "♠", red: false },
  { val: "5", suit: "♥", red: true },
  { val: "8", suit: "♦", red: true },
  { val: "13", suit: "♣", red: false },
  { val: "?", suit: "★", red: false },
];

// ── Tiny helpers ────────────────────────────────────────────
const initials = (n = "") =>
  n
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0] || "")
    .join("")
    .toUpperCase();

const uid = () => Math.random().toString(36).slice(2, 10);

const generateRoomCode = () =>
  Math.random().toString(36).slice(2, 7).toUpperCase();

// ── Styles (all inline so zero config needed) ───────────────
const S = {
  body: {
    fontFamily: "'DM Sans', 'Segoe UI', sans-serif",
    background: "linear-gradient(135deg, #183d2c 0%, #0f2a1e 100%)",
    minHeight: "100vh",
    color: "#f4edd8",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    padding: "0 16px 60px",
  },
  card: (selected, locked, red) => ({
    width: 72,
    height: 100,
    background: selected ? "#fffbe8" : "#fffdf5",
    borderRadius: 10,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    cursor: locked ? "default" : "pointer",
    border: `2px solid ${selected ? "#c8a44a" : "transparent"}`,
    boxShadow: selected
      ? "0 0 0 2px #c8a44a, 0 12px 28px rgba(0,0,0,0.45)"
      : "0 5px 16px rgba(0,0,0,0.45)",
    transform: selected
      ? "translateY(-10px) scale(1.07)"
      : "translateY(0) scale(1)",
    transition:
      "transform 0.18s cubic-bezier(.34,1.56,.64,1), box-shadow 0.18s, border-color 0.18s",
    userSelect: "none",
    position: "relative",
  }),
  panel: {
    background: "rgba(0,0,0,0.22)",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 18,
    padding: "22px 22px",
  },
  input: {
    width: "100%",
    padding: "13px 16px",
    border: "2px solid #d8cead",
    borderRadius: 12,
    fontFamily: "inherit",
    fontSize: "0.98rem",
    color: "#1a1a14",
    background: "#fafaf3",
    outline: "none",
    marginBottom: 14,
  },
  btnGold: {
    padding: "12px 28px",
    background: "#c8a44a",
    color: "#183d2c",
    border: "none",
    borderRadius: 100,
    fontFamily: "inherit",
    fontSize: "0.9rem",
    fontWeight: 700,
    cursor: "pointer",
    letterSpacing: "0.3px",
    transition: "background 0.2s",
  },
  btnGhost: {
    padding: "11px 24px",
    background: "transparent",
    color: "#f4edd8",
    border: "2px solid rgba(255,255,255,0.22)",
    borderRadius: 100,
    fontFamily: "inherit",
    fontSize: "0.9rem",
    fontWeight: 500,
    cursor: "pointer",
    transition: "all 0.2s",
  },
  btnDanger: {
    padding: "8px 18px",
    background: "transparent",
    color: "rgba(220,80,80,0.7)",
    border: "1px solid rgba(220,80,80,0.3)",
    borderRadius: 8,
    fontFamily: "inherit",
    fontSize: "0.78rem",
    cursor: "pointer",
    transition: "all 0.2s",
  },
  secLabel: {
    fontSize: "0.7rem",
    fontWeight: 600,
    letterSpacing: "2px",
    textTransform: "uppercase",
    color: "rgba(244,237,216,0.38)",
    marginBottom: 12,
    display: "block",
  },
};

// ═══════════════════════════════════════════════════════════
// COMPONENT: JoinScreen
// ═══════════════════════════════════════════════════════════
function JoinScreen({ onJoin, onCreateRoom, initialRoom }) {
  const [name, setName] = useState("");
  const [role, setRole] = useState("voter");
  const [roomCode, setRoom] = useState(initialRoom || "");
  const [tab, setTab] = useState(initialRoom ? "join" : "create");
  const [err, setErr] = useState("");

  const handleCreate = () => {
    if (!name.trim()) {
      setErr("Please enter your name");
      return;
    }
    onCreateRoom(name.trim(), role);
  };

  const handleJoin = () => {
    if (!name.trim()) {
      setErr("Please enter your name");
      return;
    }
    if (!roomCode.trim()) {
      setErr("Please enter a room code");
      return;
    }
    onJoin(name.trim(), role, roomCode.trim().toUpperCase());
  };

  return (
    <div style={{ maxWidth: 460, margin: "0 auto", width: "100%" }}>
      <div
        style={{
          marginTop: 70,
          background: "#fffdf5",
          color: "#1a1a14",
          borderRadius: 24,
          padding: "48px 40px 44px",
          boxShadow:
            "0 30px 80px rgba(0,0,0,0.5), 0 0 0 1px rgba(200,164,74,0.3)",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* gold top bar */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: 4,
            background: "linear-gradient(90deg,#c8a44a,#debb6a,#c8a44a)",
          }}
        />

        {/* suits */}
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            gap: 14,
            marginBottom: 24,
            fontSize: "1.4rem",
          }}
        >
          {["♠", "♥", "♣", "♦", "♠"].map((s, i) => (
            <span
              key={i}
              style={{
                opacity: 0.15,
                color: i % 2 === 1 ? "#b83232" : "#1a1a14",
              }}
            >
              {s}
            </span>
          ))}
        </div>

        <h1
          style={{
            fontFamily: "Georgia,serif",
            fontSize: "2rem",
            color: "#183d2c",
            marginBottom: 6,
          }}
        >
          Planning Poker
        </h1>
        <p
          style={{
            color: "#999",
            fontSize: "0.87rem",
            marginBottom: 28,
            fontWeight: 300,
          }}
        >
          Real-time estimates for your scrum team
        </p>

        {/* Tab switcher */}
        <div
          style={{
            display: "flex",
            gap: 6,
            marginBottom: 24,
            background: "#f0ebe0",
            borderRadius: 12,
            padding: 4,
          }}
        >
          {["create", "join"].map((t) => (
            <button
              key={t}
              onClick={() => {
                setTab(t);
                setErr("");
              }}
              style={{
                flex: 1,
                padding: "9px 0",
                border: "none",
                borderRadius: 9,
                fontFamily: "inherit",
                fontSize: "0.88rem",
                fontWeight: 600,
                cursor: "pointer",
                transition: "all .2s",
                background: tab === t ? "#183d2c" : "transparent",
                color: tab === t ? "#f4edd8" : "#888",
              }}
            >
              {t === "create" ? "✦ Create Room" : "→ Join Room"}
            </button>
          ))}
        </div>

        {/* Name */}
        <label
          style={{
            display: "block",
            fontSize: "0.7rem",
            fontWeight: 600,
            letterSpacing: "1.4px",
            textTransform: "uppercase",
            color: "#666",
            marginBottom: 6,
          }}
        >
          Your Name
        </label>
        <input
          style={S.input}
          placeholder="e.g. Alex Chen"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setErr("");
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter")
              tab === "create" ? handleCreate() : handleJoin();
          }}
        />

        {/* Room code (join only) */}
        {tab === "join" && (
          <>
            <label
              style={{
                display: "block",
                fontSize: "0.7rem",
                fontWeight: 600,
                letterSpacing: "1.4px",
                textTransform: "uppercase",
                color: "#666",
                marginBottom: 6,
              }}
            >
              Room Code
            </label>
            <input
              style={S.input}
              placeholder="e.g. AB12C"
              value={roomCode}
              onChange={(e) => {
                setRoom(e.target.value.toUpperCase());
                setErr("");
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleJoin();
              }}
              maxLength={6}
            />
          </>
        )}

        {/* Role */}
        <label
          style={{
            display: "block",
            fontSize: "0.7rem",
            fontWeight: 600,
            letterSpacing: "1.4px",
            textTransform: "uppercase",
            color: "#666",
            marginBottom: 8,
          }}
        >
          Your Role
        </label>
        <div style={{ display: "flex", gap: 8, marginBottom: 22 }}>
          {[
            {
              r: "voter",
              icon: "🃏",
              label: "Voter",
              sub: "Dev · QA · Designer",
            },
            {
              r: "observer",
              icon: "👁",
              label: "Observer",
              sub: "SM · PO · BA · Coach",
            },
          ].map(({ r, icon, label, sub }) => (
            <button
              key={r}
              onClick={() => setRole(r)}
              style={{
                flex: 1,
                padding: "10px 8px",
                borderRadius: 10,
                border: `2px solid ${role === r ? (r === "voter" ? "#183d2c" : "#6a8fa8") : "#d8cead"}`,
                background:
                  role === r
                    ? r === "voter"
                      ? "rgba(24,61,44,0.08)"
                      : "rgba(106,143,168,0.12)"
                    : "transparent",
                color:
                  role === r ? (r === "voter" ? "#183d2c" : "#6a8fa8") : "#888",
                fontFamily: "inherit",
                fontSize: "0.84rem",
                fontWeight: 500,
                cursor: "pointer",
                transition: "all .2s",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 3,
              }}
            >
              <span style={{ fontSize: "1.2rem" }}>{icon}</span>
              <span style={{ fontWeight: 600 }}>{label}</span>
              <span
                style={{ fontSize: "0.66rem", fontWeight: 300, opacity: 0.65 }}
              >
                {sub}
              </span>
            </button>
          ))}
        </div>

        {err && (
          <p
            style={{ color: "#b83232", fontSize: "0.82rem", marginBottom: 10 }}
          >
            {err}
          </p>
        )}

        <button
          onClick={tab === "create" ? handleCreate : handleJoin}
          style={{ ...S.btnGold, width: "100%", padding: 14, fontSize: "1rem" }}
        >
          {tab === "create" ? "Create Room →" : "Join Room →"}
        </button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// COMPONENT: Timer
// ═══════════════════════════════════════════════════════════
const CIRC = 201.1; // 2π × 32

function TimerPanel({ isObserver, timerState, onStart, onStop }) {
  const [selected, setSelected] = useState(30);
  const { running, remaining, duration } = timerState;
  const progress = running ? remaining / duration : 1;
  const offset = CIRC * (1 - progress);
  const isUrgent = remaining <= 5;
  const isWarn = remaining <= 10 && !isUrgent;

  return (
    <div style={S.panel}>
      <span style={S.secLabel}>Estimation Timer</span>
      {/* Controls — only observers see start/stop */}
      {isObserver && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            marginBottom: running ? 14 : 0,
          }}
        >
          {/* Dropdown */}
          <div style={{ position: "relative" }}>
            <select
              value={selected}
              onChange={(e) => setSelected(+e.target.value)}
              disabled={running}
              style={{
                appearance: "none",
                padding: "9px 32px 9px 13px",
                background: "rgba(200,164,74,0.12)",
                border: "1.5px solid rgba(200,164,74,0.35)",
                color: "#debb6a",
                borderRadius: 10,
                fontFamily: "inherit",
                fontSize: "0.87rem",
                fontWeight: 500,
                cursor: running ? "not-allowed" : "pointer",
                outline: "none",
                opacity: running ? 0.5 : 1,
              }}
            >
              <option value={30}>30 seconds</option>
              <option value={45}>45 seconds</option>
            </select>
            <span
              style={{
                position: "absolute",
                right: 11,
                top: "50%",
                transform: "translateY(-50%)",
                color: "#c8a44a",
                fontSize: "0.75rem",
                pointerEvents: "none",
              }}
            >
              ▾
            </span>
          </div>
          {!running ? (
            <button style={S.btnGold} onClick={() => onStart(selected)}>
              ▶ Start
            </button>
          ) : (
            <button
              style={{
                ...S.btnGhost,
                padding: "9px 18px",
                fontSize: "0.85rem",
              }}
              onClick={onStop}
            >
              ✕ Stop
            </button>
          )}
        </div>
      )}

      {/* Ring — visible to everyone when running */}
      {running && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 16,
            ...(isObserver
              ? {
                  paddingTop: 14,
                  borderTop: "1px solid rgba(255,255,255,0.07)",
                }
              : {}),
          }}
        >
          <div style={{ position: "relative", flexShrink: 0 }}>
            <svg
              width={76}
              height={76}
              viewBox="0 0 76 76"
              style={{ transform: "rotate(-90deg)" }}
            >
              <circle
                className="ring-bg"
                cx={38}
                cy={38}
                r={32}
                fill="none"
                stroke="rgba(255,255,255,0.08)"
                strokeWidth={5}
              />
              <circle
                cx={38}
                cy={38}
                r={32}
                fill="none"
                stroke={isUrgent ? "#e84040" : isWarn ? "#e8a030" : "#c8a44a"}
                strokeWidth={5}
                strokeLinecap="round"
                strokeDasharray={CIRC}
                strokeDashoffset={offset}
                style={{
                  transition: "stroke-dashoffset 1s linear, stroke 0.3s",
                }}
              />
            </svg>
            <div
              style={{
                position: "absolute",
                inset: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontFamily: "Georgia,serif",
                fontSize: "1.65rem",
                color: isUrgent ? "#e84040" : "#f4edd8",
              }}
            >
              {remaining}
            </div>
          </div>
          <div>
            <div
              style={{
                fontSize: "0.77rem",
                letterSpacing: "1.3px",
                textTransform: "uppercase",
                color: isUrgent
                  ? "#e84040"
                  : isWarn
                    ? "#e8a030"
                    : "rgba(244,237,216,0.4)",
                marginBottom: 3,
              }}
            >
              {isUrgent
                ? "Time's almost up!"
                : isWarn
                  ? "Wrapping up…"
                  : "Estimating…"}
            </div>
            <div
              style={{ fontSize: "0.74rem", color: "rgba(244,237,216,0.27)" }}
            >
              {isObserver ? "Cards lock when timer ends" : "Pick your card!"}
            </div>
          </div>
        </div>
      )}

      {/* Non-observer sees timer info only when not running */}
      {!isObserver && !running && (
        <div
          style={{
            fontSize: "0.82rem",
            color: "rgba(244,237,216,0.3)",
            fontStyle: "italic",
            marginTop: 4,
          }}
        >
          Waiting for facilitator to start the timer…
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// COMPONENT: PlayerList
// ═══════════════════════════════════════════════════════════
function PlayerList({ players, revealed, myId }) {
  const voters = players.filter((p) => p.role === "voter");
  const observers = players.filter((p) => p.role === "observer");

  const votedCount = voters.filter((p) => p.voted).length;

  return (
    <div style={S.panel}>
      <span style={S.secLabel}>At the Table</span>

      {/* Vote progress */}
      {voters.length > 0 && !revealed && (
        <div style={{ marginBottom: 14 }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              fontSize: "0.75rem",
              color: "rgba(244,237,216,0.4)",
              marginBottom: 6,
            }}
          >
            <span>Votes in</span>
            <span>
              {votedCount} / {voters.length}
            </span>
          </div>
          <div
            style={{
              background: "rgba(255,255,255,0.08)",
              borderRadius: 100,
              height: 5,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                height: "100%",
                borderRadius: 100,
                background: "linear-gradient(90deg,#c8a44a,#debb6a)",
                width: `${voters.length ? (votedCount / voters.length) * 100 : 0}%`,
                transition: "width 0.4s ease",
              }}
            />
          </div>
        </div>
      )}

      {/* Voters */}
      {voters.length === 0 && observers.length === 0 && (
        <div
          style={{
            color: "rgba(244,237,216,0.25)",
            fontSize: "0.82rem",
            fontStyle: "italic",
            padding: "12px 0",
          }}
        >
          Nobody here yet
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
        {voters.map((p) => (
          <PlayerRow
            key={p.id}
            p={p}
            revealed={revealed}
            isMe={p.id === myId}
          />
        ))}
        {observers.length > 0 && voters.length > 0 && (
          <div
            style={{
              borderTop: "1px solid rgba(255,255,255,0.06)",
              margin: "6px 0",
            }}
          />
        )}
        {observers.map((p) => (
          <PlayerRow
            key={p.id}
            p={p}
            revealed={revealed}
            isMe={p.id === myId}
          />
        ))}
      </div>
    </div>
  );
}

function PlayerRow({ p, revealed, isMe }) {
  const isObs = p.role === "observer";
  const bgColor = isObs
    ? "rgba(106,143,168,0.12)"
    : p.voted
      ? "rgba(200,164,74,0.1)"
      : "rgba(255,255,255,0.04)";
  const borderColor = isObs
    ? "rgba(106,143,168,0.2)"
    : p.voted
      ? "rgba(200,164,74,0.25)"
      : "rgba(255,255,255,0.07)";

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "9px 12px",
        borderRadius: 12,
        background: bgColor,
        border: `1px solid ${borderColor}`,
        transition: "background 0.3s",
      }}
    >
      {/* Avatar */}
      <div
        style={{
          width: 30,
          height: 30,
          borderRadius: 8,
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontWeight: 700,
          fontSize: "0.74rem",
          background: isObs
            ? "rgba(106,143,168,0.4)"
            : p.voted
              ? "#c8a44a"
              : "#2e8055",
          color: p.voted && !isObs ? "#183d2c" : "#f4edd8",
        }}
      >
        {initials(p.name)}
      </div>

      {/* Name + role */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: "0.85rem",
            fontWeight: 500,
            color: "#e8dfc5",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {p.name}
          {isMe ? " (you)" : ""}
        </div>
        <div
          style={{
            fontSize: "0.68rem",
            color: isObs ? "rgba(106,143,168,0.7)" : "rgba(244,237,216,0.33)",
            marginTop: 1,
          }}
        >
          {isObs ? "Observer · Facilitator" : "Voter"}
        </div>
      </div>

      {/* Indicator */}
      {isObs ? (
        <div
          style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: "rgba(106,143,168,0.5)",
            flexShrink: 0,
          }}
        />
      ) : revealed && p.voted ? (
        <div
          style={{
            background: "#fffdf5",
            color: "#1a1a14",
            fontFamily: "Georgia,serif",
            fontWeight: 700,
            fontSize: "0.9rem",
            borderRadius: 6,
            padding: "2px 10px",
            border: "1px solid #c8a44a",
            minWidth: 32,
            textAlign: "center",
            flexShrink: 0,
            animation: "flipIn 0.3s ease both",
          }}
        >
          {p.vote}
        </div>
      ) : (
        <div
          style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            flexShrink: 0,
            background: p.voted ? "#c8a44a" : "rgba(255,255,255,0.18)",
            animation: !p.voted ? "pulse 1.6s ease infinite" : "none",
          }}
        />
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// COMPONENT: Results
// ═══════════════════════════════════════════════════════════
function Results({ players }) {
  const voters = players.filter((p) => p.role === "voter" && p.voted);
  if (!voters.length) return null;

  const nums = voters
    .map((p) => p.vote)
    .filter((v) => v !== "?")
    .map(Number);
  const allSame = new Set(voters.map((p) => p.vote)).size === 1;
  const avg = nums.length
    ? (nums.reduce((a, b) => a + b, 0) / nums.length).toFixed(1)
    : null;
  const min = nums.length ? Math.min(...nums) : null;
  const max = nums.length ? Math.max(...nums) : null;

  return (
    <div
      style={{
        ...S.panel,
        border: "1px solid rgba(200,164,74,0.35)",
        animation: "fadeUp 0.35s ease",
      }}
    >
      <div
        style={{
          fontFamily: "Georgia,serif",
          fontSize: "0.95rem",
          color: "#c8a44a",
          letterSpacing: "0.5px",
          marginBottom: 14,
          textAlign: "center",
        }}
      >
        ✦ &nbsp; Votes Revealed &nbsp; ✦
      </div>

      {/* Vote cards */}
      <div
        style={{
          display: "flex",
          gap: 8,
          justifyContent: "center",
          flexWrap: "wrap",
          marginBottom: 14,
        }}
      >
        {voters.map((p, i) => (
          <div
            key={p.id}
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 5,
              animation: `flipIn 0.35s ease ${i * 0.07}s both`,
            }}
          >
            <div
              style={{
                background: "#fffdf5",
                color: "#1a1a14",
                fontFamily: "Georgia,serif",
                fontWeight: 700,
                fontSize: "1.1rem",
                borderRadius: 8,
                padding: "7px 16px",
                border: "1px solid #d8cead",
                minWidth: 42,
                textAlign: "center",
                boxShadow: "0 3px 10px rgba(0,0,0,0.3)",
              }}
            >
              {p.vote}
            </div>
            <div
              style={{
                fontSize: "0.68rem",
                color: "rgba(244,237,216,0.35)",
                maxWidth: 64,
                textAlign: "center",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {p.name}
            </div>
          </div>
        ))}
      </div>

      {/* Stats */}
      <div
        style={{
          textAlign: "center",
          fontSize: "0.83rem",
          color: "rgba(244,237,216,0.5)",
        }}
      >
        {allSame ? (
          <span style={{ color: "#debb6a", fontWeight: 500 }}>
            🎉 Perfect consensus! Everyone picked {voters[0].vote}
          </span>
        ) : avg !== null ? (
          <>
            Average: <strong style={{ color: "#f4edd8" }}>{avg}</strong>{" "}
            &nbsp;·&nbsp; Range: {min}–{max}
          </>
        ) : (
          "Votes recorded"
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// MAIN APP
// ═══════════════════════════════════════════════════════════
export default function App() {
  const [screen, setScreen] = useState("join"); // join | game
  const [myId] = useState(uid);
  const [myName, setMyName] = useState("");
  const [myRole, setMyRole] = useState("voter");
  const [roomCode, setRoomCode] = useState("");
  const [roomData, setRoomData] = useState(null);
  const [toast, setToast] = useState("");
  const [timerInterval, setTimerInterval] = useState(null);

  // Parse ?room=CODE from URL
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const r = params.get("room");
    if (r) setRoomCode(r.toUpperCase());
  }, []);

  // ── Listen to room in Firebase ──────────────────────────
  useEffect(() => {
    if (!roomCode || screen !== "game") return;
    const roomRef = ref(db, `rooms/${roomCode}`);
    const unsub = onValue(roomRef, (snap) => {
      if (snap.exists()) {
        setRoomData(snap.val());
      } else {
        showToast("Room not found or was deleted.");
        setScreen("join");
      }
    });
    return () => unsub();
  }, [roomCode, screen]);

  // ── Timer: observers drive it via Firebase, all clients read it ──
  useEffect(() => {
    if (!roomData?.timer?.running) {
      clearInterval(timerInterval);
      setTimerInterval(null);
      return;
    }
    // Only the observer who started it ticks it down
    if (roomData.timer.startedBy !== myId) return;
    if (timerInterval) return; // already ticking

    const iv = setInterval(async () => {
      const newRemaining = (roomData.timer.remaining ?? 0) - 1;
      if (newRemaining <= 0) {
        clearInterval(iv);
        setTimerInterval(null);
        await update(ref(db, `rooms/${roomCode}/timer`), {
          running: false,
          remaining: 0,
        });
        // Auto-reveal
        await update(ref(db, `rooms/${roomCode}`), { revealed: true });
        showToast("⏰ Time's up! Cards revealed.");
      } else {
        await update(ref(db, `rooms/${roomCode}/timer`), {
          remaining: newRemaining,
        });
      }
    }, 1000);
    setTimerInterval(iv);
    return () => clearInterval(iv);
  }, [roomData?.timer?.running, roomData?.timer?.startedBy, myId, roomCode]);

  // ── Auto-reveal when all voters have voted ──────────────
  useEffect(() => {
    if (!roomData || roomData.revealed) return;
    const players = Object.values(roomData.players || {});
    const voters = players.filter((p) => p.role === "voter");
    if (voters.length === 0) return;
    if (voters.every((p) => p.voted)) {
      setTimeout(async () => {
        // re-check still all voted and not yet revealed
        const players2 = Object.values(roomData.players || {});
        if (
          players2.filter((p) => p.role === "voter").every((p) => p.voted) &&
          !roomData.revealed
        ) {
          await update(ref(db, `rooms/${roomCode}`), { revealed: true });
          showToast("🃏 All votes in — cards revealed!");
        }
      }, 800);
    }
  }, [roomData, roomCode]);

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(""), 3500);
  };

  // ── Create room ─────────────────────────────────────────
  const handleCreateRoom = async (name, role) => {
    const code = generateRoomCode();
    setMyName(name);
    setMyRole(role);
    setRoomCode(code);

    const roomRef = ref(db, `rooms/${code}`);
    await set(roomRef, {
      createdAt: serverTimestamp(),
      revealed: false,
      round: 1,
      timer: { running: false, duration: 30, remaining: 30 },
      players: {
        [myId]: { id: myId, name, role, voted: false, vote: null },
      },
    });

    // Update URL
    window.history.replaceState({}, "", `?room=${code}`);
    setScreen("game");
    showToast(`Room created! Code: ${code}`);
  };

  // ── Join room ───────────────────────────────────────────
  const handleJoinRoom = async (name, role, code) => {
    setMyName(name);
    setMyRole(role);
    setRoomCode(code);

    // Check room exists
    const roomRef = ref(db, `rooms/${code}`);
    const snap = await new Promise((res) =>
      onValue(roomRef, res, { onlyOnce: true }),
    );
    if (!snap.exists()) {
      showToast(`Room "${code}" not found. Check the code and try again.`);
      return;
    }

    await update(ref(db, `rooms/${code}/players/${myId}`), {
      id: myId,
      name,
      role,
      voted: false,
      vote: null,
    });

    window.history.replaceState({}, "", `?room=${code}`);
    setScreen("game");
  };

  // ── Leave room on unmount / unload ──────────────────────
  useEffect(() => {
    const cleanup = () => {
      if (roomCode && myId) {
        remove(ref(db, `rooms/${roomCode}/players/${myId}`));
      }
    };
    window.addEventListener("beforeunload", cleanup);
    return () => {
      cleanup();
      window.removeEventListener("beforeunload", cleanup);
    };
  }, [roomCode, myId]);

  // ── Select card ─────────────────────────────────────────
  const selectCard = useCallback(
    async (val) => {
      if (!roomData || roomData.revealed) return;
      const newVote = roomData.players?.[myId]?.vote === val ? null : val;
      await update(ref(db, `rooms/${roomCode}/players/${myId}`), {
        voted: !!newVote,
        vote: newVote,
      });
    },
    [roomData, roomCode, myId],
  );

  // ── Reveal votes (observer only) ────────────────────────
  const revealVotes = useCallback(async () => {
    await update(ref(db, `rooms/${roomCode}`), { revealed: true });
    // Stop timer if running
    await update(ref(db, `rooms/${roomCode}/timer`), { running: false });
  }, [roomCode]);

  // ── New round (observer only) ───────────────────────────
  const newRound = useCallback(async () => {
    const players = roomData?.players || {};
    const updates = {};
    Object.keys(players).forEach((id) => {
      updates[`rooms/${roomCode}/players/${id}/voted`] = false;
      updates[`rooms/${roomCode}/players/${id}/vote`] = null;
    });
    updates[`rooms/${roomCode}/revealed`] = false;
    updates[`rooms/${roomCode}/round`] = (roomData?.round || 1) + 1;
    updates[`rooms/${roomCode}/timer/running`] = false;
    updates[`rooms/${roomCode}/timer/remaining`] =
      roomData?.timer?.duration || 30;
    await update(ref(db), updates);
  }, [roomCode, roomData]);

  // ── Start timer (observer only) ─────────────────────────
  const startTimer = useCallback(
    async (seconds) => {
      await update(ref(db, `rooms/${roomCode}/timer`), {
        running: true,
        duration: seconds,
        remaining: seconds,
        startedBy: myId,
      });
    },
    [roomCode, myId],
  );

  const stopTimer = useCallback(async () => {
    clearInterval(timerInterval);
    setTimerInterval(null);
    await update(ref(db, `rooms/${roomCode}/timer`), { running: false });
  }, [roomCode, timerInterval]);

  // ─────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────
  if (screen === "join") {
    return (
      <div style={S.body}>
        <JoinScreen
          onJoin={handleJoinRoom}
          onCreateRoom={handleCreateRoom}
          initialRoom={roomCode}
        />
      </div>
    );
  }

  if (!roomData) {
    return (
      <div
        style={{ ...S.body, alignItems: "center", justifyContent: "center" }}
      >
        <div style={{ fontSize: "1rem", color: "rgba(244,237,216,0.4)" }}>
          Connecting to room…
        </div>
      </div>
    );
  }

  const players = Object.values(roomData.players || {});
  const myPlayer = roomData.players?.[myId];
  const myVote = myPlayer?.vote || null;
  const isObserver = myRole === "observer";
  const revealed = roomData.revealed || false;
  const round = roomData.round || 1;
  const timerState = roomData.timer || {
    running: false,
    duration: 30,
    remaining: 30,
  };
  const voters = players.filter((p) => p.role === "voter");
  const hasVotes = voters.some((p) => p.voted);
  const shareUrl = `${window.location.origin}${window.location.pathname}?room=${roomCode}`;

  return (
    <div style={S.body}>
      <style>{`
        @keyframes flipIn { from{transform:rotateY(90deg) scale(0.9)} to{transform:rotateY(0) scale(1)} }
        @keyframes fadeUp  { from{opacity:0;transform:translateY(14px)} to{opacity:1;transform:translateY(0)} }
        @keyframes pulse   { 0%,100%{opacity:1} 50%{opacity:0.3} }
        .p-card-hover:hover { transform: translateY(-8px) scale(1.05) !important; box-shadow: 0 16px 32px rgba(0,0,0,0.4) !important; }
      `}</style>

      {/* Header */}
      <header
        style={{
          width: "100%",
          maxWidth: 940,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "24px 0 16px",
          borderBottom: "1px solid rgba(200,164,74,0.2)",
          marginBottom: 22,
          flexWrap: "wrap",
          gap: 10,
        }}
      >
        <div
          style={{
            fontFamily: "Georgia,serif",
            fontSize: "1.5rem",
            color: "#c8a44a",
          }}
        >
          Planning <span style={{ color: "#f4edd8" }}>Poker</span>
        </div>

        {/* Room code + share */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            flexWrap: "wrap",
          }}
        >
          <div
            style={{
              background: "rgba(0,0,0,0.25)",
              border: "1px solid rgba(200,164,74,0.25)",
              borderRadius: 10,
              padding: "6px 14px",
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <span
              style={{
                fontSize: "0.7rem",
                letterSpacing: "1.5px",
                textTransform: "uppercase",
                color: "rgba(244,237,216,0.4)",
              }}
            >
              Room
            </span>
            <span
              style={{
                fontFamily: "Georgia,serif",
                fontSize: "1.1rem",
                fontWeight: 700,
                color: "#debb6a",
                letterSpacing: "3px",
              }}
            >
              {roomCode}
            </span>
          </div>
          <button
            onClick={() => {
              navigator.clipboard.writeText(shareUrl);
              showToast("Link copied! Share with your team.");
            }}
            style={{ ...S.btnGhost, padding: "7px 16px", fontSize: "0.8rem" }}
          >
            🔗 Copy Link
          </button>
          <div
            style={{
              background: "rgba(255,255,255,0.07)",
              border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: 100,
              padding: "5px 14px",
              fontSize: "0.74rem",
              letterSpacing: "1.6px",
              textTransform: "uppercase",
              color: "rgba(244,237,216,0.38)",
            }}
          >
            Round {round}
          </div>
        </div>
      </header>

      {/* Body */}
      <div
        style={{
          width: "100%",
          maxWidth: 940,
          display: "grid",
          gridTemplateColumns: "1fr 300px",
          gap: 22,
        }}
      >
        {/* LEFT */}
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {/* Timer */}
          <TimerPanel
            isObserver={isObserver}
            timerState={timerState}
            onStart={startTimer}
            onStop={stopTimer}
          />

          {/* Cards / Observer notice */}
          <div style={S.panel}>
            <span style={S.secLabel}>
              {isObserver ? "Votes Overview" : "Your Estimate"}
            </span>

            {isObserver ? (
              <div
                style={{
                  padding: "14px 18px",
                  background: "rgba(106,143,168,0.12)",
                  border: "1px solid rgba(106,143,168,0.3)",
                  borderRadius: 12,
                  color: "#6a8fa8",
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  fontSize: "0.88rem",
                }}
              >
                <span style={{ fontSize: "1.2rem" }}>👁</span>
                <span>
                  You're observing — use the controls below to reveal votes and
                  start new rounds.
                </span>
              </div>
            ) : (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                {CARDS.map((c) => {
                  const selected = myVote === c.val;
                  return (
                    <div
                      key={c.val}
                      className={!revealed && !selected ? "p-card-hover" : ""}
                      onClick={() => !revealed && selectCard(c.val)}
                      style={S.card(selected, revealed, c.red)}
                    >
                      {/* corner labels */}
                      <span
                        style={{
                          position: "absolute",
                          top: 5,
                          left: 6,
                          fontFamily: "Georgia,serif",
                          fontSize: "0.62rem",
                          color: c.red
                            ? "rgba(184,50,50,0.25)"
                            : "rgba(0,0,0,0.2)",
                        }}
                      >
                        {c.val}
                      </span>
                      <span
                        style={{
                          position: "absolute",
                          bottom: 5,
                          right: 6,
                          fontFamily: "Georgia,serif",
                          fontSize: "0.62rem",
                          color: c.red
                            ? "rgba(184,50,50,0.25)"
                            : "rgba(0,0,0,0.2)",
                          transform: "rotate(180deg)",
                        }}
                      >
                        {c.val}
                      </span>
                      <span
                        style={{
                          fontFamily: "Georgia,serif",
                          fontSize: "1.5rem",
                          fontWeight: 700,
                          color: c.red ? "#b83232" : "#1a1a14",
                        }}
                      >
                        {c.val}
                      </span>
                      <span
                        style={{
                          fontSize: "0.76rem",
                          color: c.red
                            ? "rgba(184,50,50,0.3)"
                            : "rgba(0,0,0,0.18)",
                          marginTop: 1,
                        }}
                      >
                        {c.suit}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Results */}
          {revealed && <Results players={players} />}

          {/* Observer controls */}
          {isObserver && (
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button
                style={{
                  ...S.btnGold,
                  opacity: !hasVotes || revealed ? 0.38 : 1,
                  cursor: !hasVotes || revealed ? "not-allowed" : "pointer",
                }}
                disabled={!hasVotes || revealed}
                onClick={revealVotes}
              >
                Reveal Cards
              </button>
              <button style={S.btnGhost} onClick={newRound}>
                ↺ New Round
              </button>
            </div>
          )}

          {/* Voter: waiting message if no vote yet and not revealed */}
          {!isObserver && !myVote && !revealed && (
            <div
              style={{
                fontSize: "0.82rem",
                color: "rgba(244,237,216,0.3)",
                fontStyle: "italic",
                textAlign: "center",
              }}
            >
              Pick a card above to cast your vote
            </div>
          )}
          {!isObserver && myVote && !revealed && (
            <div
              style={{
                fontSize: "0.82rem",
                color: "rgba(200,164,74,0.6)",
                textAlign: "center",
              }}
            >
              ✓ You voted <strong style={{ color: "#debb6a" }}>{myVote}</strong>{" "}
              — waiting for others…
            </div>
          )}
        </div>

        {/* RIGHT */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <PlayerList players={players} revealed={revealed} myId={myId} />

          {/* Invite hint */}
          <div
            style={{
              background: "rgba(0,0,0,0.14)",
              border: "1px dashed rgba(255,255,255,0.1)",
              borderRadius: 16,
              padding: "16px 18px",
            }}
          >
            <span style={S.secLabel}>Invite Team</span>
            <p
              style={{
                fontSize: "0.8rem",
                color: "rgba(244,237,216,0.35)",
                marginBottom: 10,
                lineHeight: 1.5,
              }}
            >
              Share the room code or copy the link below.
            </p>
            <div
              style={{
                background: "rgba(0,0,0,0.2)",
                borderRadius: 8,
                padding: "8px 12px",
                fontFamily: "monospace",
                fontSize: "0.78rem",
                color: "rgba(244,237,216,0.4)",
                wordBreak: "break-all",
                marginBottom: 10,
              }}
            >
              {shareUrl}
            </div>
            <button
              onClick={() => {
                navigator.clipboard.writeText(shareUrl);
                showToast("Link copied!");
              }}
              style={{ ...S.btnGold, padding: "8px 18px", fontSize: "0.82rem" }}
            >
              Copy Invite Link
            </button>
          </div>
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div
          style={{
            position: "fixed",
            bottom: 28,
            left: "50%",
            transform: "translateX(-50%)",
            background: "#fffdf5",
            color: "#1a1a14",
            borderRadius: 12,
            padding: "12px 22px",
            fontSize: "0.88rem",
            fontWeight: 500,
            boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
            border: "1px solid rgba(200,164,74,0.3)",
            zIndex: 200,
            whiteSpace: "nowrap",
            animation: "fadeUp 0.3s ease",
          }}
        >
          {toast}
        </div>
      )}
    </div>
  );
}
