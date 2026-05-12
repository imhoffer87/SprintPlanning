// web/src/App.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import { io } from "socket.io-client";

const SERVER_URL = import.meta.env.VITE_SERVER_URL || "http://localhost:8787";
const DECK = ["0", "1", "2", "3", "5", "8", "13", "21", "34", "?", "☕"];

function computeStats(users, revealed) {
  if (!revealed) return null;

  const nums = users
    .map((u) => Number(u.vote))
    .filter((n) => Number.isFinite(n));

  if (nums.length === 0)
    return { count: 0, sum: 0, avg: null, mean: null, mode: null };

  const sum = nums.reduce((a, b) => a + b, 0);
  const avg = sum / nums.length;

  const freq = new Map();
  for (const n of nums) freq.set(n, (freq.get(n) || 0) + 1);

  let best = null;
  let bestCount = 0;
  let tied = false;

  for (const [n, c] of freq.entries()) {
    if (c > bestCount) {
      best = n;
      bestCount = c;
      tied = false;
    } else if (c === bestCount) {
      tied = true;
    }
  }

  const mode = tied ? "tie" : best;

  return { count: nums.length, sum, avg, mean: avg, mode };
}

function buildInviteUrl(origin, roomId, isFacilitator) {
  const base = `${origin}/?room=${encodeURIComponent(roomId)}`;
  return isFacilitator ? `${base}&fac=1` : base;
}

export default function App() {
  const [name, setName] = useState("");
  const [roomId, setRoomId] = useState("");

  const [socket, setSocket] = useState(null);
  const [users, setUsers] = useState([]);
  const [revealed, setRevealed] = useState(false);
  const [myVote, setMyVote] = useState(null);

  // Facilitator is client-side (from checkbox or &fac=1)
  const [isFacilitator, setIsFacilitator] = useState(false);

  // NEW: comes from server state
  const [facilitatorCount, setFacilitatorCount] = useState(0);

  // Toast
  const [toast, setToast] = useState({
    open: false,
    message: "",
    type: "info",
  });
  const toastTimerRef = useRef(null);

  function showToast(message, type = "info") {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast({ open: true, message, type });
    toastTimerRef.current = setTimeout(
      () => setToast((t) => ({ ...t, open: false })),
      1800
    );
  }

  async function copyText(text, successMsg = "Copied!") {
    try {
      await navigator.clipboard.writeText(text);
      showToast(successMsg, "success");
    } catch {
      window.prompt("Copy this:", text);
    }
  }

  // Prefill from URL and persist facilitator choice for this tab
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const r = params.get("room");
    const fac = params.get("fac");

    if (r) setRoomId(r);
    if (fac === "1") setIsFacilitator(true);

    const stored = sessionStorage.getItem("pp_isFacilitator");
    if (stored === "1") setIsFacilitator(true);

    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, []);

  const votedCount = useMemo(
    () => users.filter((u) => (revealed ? u.vote != null : u.vote)).length,
    [users, revealed]
  );

  const stats = useMemo(() => computeStats(users, revealed), [users, revealed]);

  const origin =
    typeof window !== "undefined" && window.location?.origin
      ? window.location.origin
      : "";

  const cleanRoomId = roomId.trim();
  const inviteUrl = cleanRoomId
    ? buildInviteUrl(origin, cleanRoomId, false)
    : "";
  const facilitatorUrl = cleanRoomId
    ? buildInviteUrl(origin, cleanRoomId, true)
    : "";

  // ✅ KEY LOGIC:
  // If there are 0 facilitators in the room, controls are open to everyone.
  const controlsOpen = facilitatorCount === 0;
  const canControl = isFacilitator || controlsOpen;

  function joinRoom() {
    if (!name.trim() || !cleanRoomId) return;

    sessionStorage.setItem("pp_isFacilitator", isFacilitator ? "1" : "0");

    const s = io(SERVER_URL, {
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: 5,
    });

    s.emit("join", { roomId: cleanRoomId, name: name.trim(), isFacilitator });

    s.on("state", (state) => {
      setUsers(state.users || []);
      setRevealed(!!state.revealed);

      // NEW: read from server
      setFacilitatorCount(Number(state.facilitatorCount ?? 0));

      // If reset happened, clear local vote highlight
      if (!state.revealed && (state.users || []).every((u) => !u.vote)) {
        setMyVote(null);
      }
    });

    s.on("connect_error", () =>
      showToast("Connection error. Try refreshing.", "error")
    );

    setSocket(s);
  }

  function vote(value) {
    if (!socket) return;
    setMyVote(value);
    socket.emit("vote", { roomId: cleanRoomId, vote: value });
  }

  function revealVotes() {
    // only block if controls are locked AND you're not facilitator
    if (!canControl)
      return showToast(
        "Controls locked (a facilitator is in this room).",
        "error"
      );
    socket?.emit("reveal", { roomId: cleanRoomId });
    showToast("Revealed votes", "info");
  }

  function resetVotes() {
    if (!canControl)
      return showToast(
        "Controls locked (a facilitator is in this room).",
        "error"
      );
    setMyVote(null);
    socket?.emit("reset", { roomId: cleanRoomId });
    showToast("Votes reset", "info");
  }

  if (!socket) {
    return (
      <div className="joinPage">
        <div
          className={`toast ${toast.open ? "open" : ""} ${toast.type}`}
          role="status"
          aria-live="polite"
        >
          {toast.message}
        </div>

        <div className="joinWrap">
          <div className="joinHeader">
            <h1>Planning Poker</h1>
            <p className="sub">Simple, real-time sprint estimation.</p>
          </div>

          <div className="card joinCard">
            <div className="grid2 joinGrid">
              <label>
                <span>Your name</span>
                <input
                  autoFocus
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Eric"
                  onKeyDown={(e) => e.key === "Enter" && joinRoom()}
                />
              </label>

              <label>
                <span>Room ID</span>
                <div className="roomRow">
                  <input
                    value={roomId}
                    onChange={(e) => setRoomId(e.target.value)}
                    placeholder="TEAM1"
                    onKeyDown={(e) => e.key === "Enter" && joinRoom()}
                  />
                  <button
                    className="btn"
                    type="button"
                    onClick={() => {
                      const slug = Math.random()
                        .toString(36)
                        .slice(2, 7)
                        .toUpperCase();
                      setRoomId(`ROOM-${slug}`);
                      showToast("Generated room ID", "info");
                    }}
                    title="Generate a room ID"
                  >
                    🎲
                  </button>
                </div>
              </label>
            </div>

            <div className="joinToggle">
              <label className="toggle">
                <input
                  type="checkbox"
                  checked={isFacilitator}
                  onChange={(e) => {
                    setIsFacilitator(e.target.checked);
                    showToast(
                      e.target.checked
                        ? "Facilitator mode enabled"
                        : "Facilitator mode disabled",
                      "info"
                    );
                  }}
                />
                <span>Join as facilitator (optional)</span>
              </label>
              <span className="hint small">
                If nobody facilitates, controls are open to everyone.
              </span>
            </div>

            <div className="row joinActions">
              <button className="btn primary" onClick={joinRoom}>
                Join room
              </button>

              <button
                className="btn"
                type="button"
                disabled={!cleanRoomId}
                onClick={() =>
                  copyText(
                    isFacilitator ? facilitatorUrl : inviteUrl,
                    "Invite link copied"
                  )
                }
              >
                Copy invite link
              </button>
            </div>

            <div className="joinHint">
              <div className="hint">
                Tip: everyone joins the same Room ID to vote together.
              </div>
              {cleanRoomId ? (
                <div className="hint small">
                  Invite link: <span className="mono">{inviteUrl}</span>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <div
        className={`toast ${toast.open ? "open" : ""} ${toast.type}`}
        role="status"
        aria-live="polite"
      >
        {toast.message}
      </div>

      <div className="wrap">
        <div className="topbar">
          <div className="topLeft">
            <h2 className="roomTitle">Room: {cleanRoomId}</h2>

            <div className="chips">
              <span className="chip voted">
                Voted:{" "}
                <strong>
                  {votedCount}/{users.length}
                </strong>
              </span>
              <span className={`chip ${revealed ? "revealed" : "hidden"}`}>
                Status: <strong>{revealed ? "Revealed" : "Hidden"}</strong>
              </span>
            </div>

            <div className="shareBlock">
              <div className="shareRow">
                <div className="shareLabel">Invite</div>
                <div className="sharePill" title={inviteUrl}>
                  <span className="mono shareText">{inviteUrl}</span>
                </div>
                <button
                  className="iconBtn"
                  onClick={() => copyText(inviteUrl, "Invite link copied")}
                  title="Copy invite link"
                >
                  📋
                </button>
              </div>

              {/* Only show facilitator link row if you personally are a facilitator */}
              {isFacilitator ? (
                <div className="shareRow">
                  <div className="shareLabel">Fac</div>
                  <div className="sharePill" title={facilitatorUrl}>
                    <span className="mono shareText">{facilitatorUrl}</span>
                  </div>
                  <button
                    className="iconBtn"
                    onClick={() =>
                      copyText(facilitatorUrl, "Facilitator link copied")
                    }
                    title="Copy facilitator link"
                  >
                    🗝️
                  </button>
                </div>
              ) : null}
            </div>
          </div>

          <div className="topRight">
            <div className="rolePill">
              Controls:{" "}
              <strong>
                {controlsOpen
                  ? "Open"
                  : isFacilitator
                    ? "Facilitator"
                    : "Locked"}
              </strong>
            </div>

            {canControl ? (
              <div className="actions">
                <button className="btn btnBig" onClick={resetVotes}>
                  Reset votes
                </button>
                <button className="btn primary btnBig" onClick={revealVotes}>
                  Reveal
                </button>
              </div>
            ) : (
              <div className="actions">
                <button
                  className="btn btnBig"
                  onClick={() => copyText(inviteUrl, "Invite link copied")}
                >
                  Invite
                </button>
                <button
                  className="btn primary btnBig"
                  onClick={() => {
                    copyText(facilitatorUrl, "Facilitator link copied");
                    showToast(
                      "Open the facilitator link to enable Reveal/Reset",
                      "info"
                    );
                  }}
                  title="Copy facilitator link (to become a facilitator)"
                >
                  Become facilitator
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="layout">
          <div className="card">
            <h3>Your vote</h3>
            <p className="sub">Pick a card. Votes stay hidden until reveal.</p>

            <div className="deck">
              {DECK.map((v) => (
                <button
                  key={v}
                  className={"cardBtn" + (myVote === v ? " selected" : "")}
                  onClick={() => vote(v)}
                  aria-label={`Vote ${v}`}
                >
                  {v}
                </button>
              ))}
            </div>
          </div>

          <div className="card">
            <h3>Players</h3>

            <div className="players">
              {users.map((u) => (
                <div key={u.id} className="playerRow">
                  <div className="playerName">
                    {u.name} {u.isFacilitator ? "🧭" : ""}
                  </div>
                  <div className="playerVote">
                    {revealed ? (u.vote ?? "—") : u.vote ? "✓" : "…"}
                  </div>
                </div>
              ))}
            </div>

            <div className="divider" />

            <h3>Summary</h3>
            {!revealed ? (
              <p className="hint">Reveal votes to see the stats.</p>
            ) : (
              <div className="stats">
                <div className="stat">
                  <span>Numeric votes</span>
                  <strong>{stats?.count ?? 0}</strong>
                </div>
                <div className="stat">
                  <span>Sum</span>
                  <strong>{stats?.sum ?? "—"}</strong>
                </div>
                <div className="stat">
                  <span>Avg</span>
                  <strong>
                    {stats?.avg == null
                      ? "—"
                      : Math.round(stats.avg * 100) / 100}
                  </strong>
                </div>
                <div className="stat">
                  <span>Mean</span>
                  <strong>
                    {stats?.mean == null
                      ? "—"
                      : Math.round(stats.mean * 100) / 100}
                  </strong>
                </div>
                <div className="stat">
                  <span>Mode</span>
                  <strong>{stats?.mode ?? "—"}</strong>
                </div>
              </div>
            )}

            <p className="hint">Note: “?” and “☕” are ignored in the math.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
