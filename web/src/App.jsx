import { useMemo, useState } from "react";
import { io } from "socket.io-client";

const SERVER_URL = import.meta.env.VITE_SERVER_URL || "http://localhost:8787";

const DECK = ["0", "1", "2", "3", "5", "8", "13", "21", "34", "?", "☕"];

function computeStats(users, revealed) {
  if (!revealed) return null;

  const nums = users
    .map((u) => Number(u.vote))
    .filter((n) => Number.isFinite(n));

  if (nums.length === 0) {
    return { count: 0, sum: 0, avg: null, mean: null, mode: null };
  }

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

export default function App() {
  const [name, setName] = useState("");
  const [roomId, setRoomId] = useState("");
  const [socket, setSocket] = useState(null);

  const [users, setUsers] = useState([]);
  const [revealed, setRevealed] = useState(false);
  const [myVote, setMyVote] = useState(null);

  const votedCount = useMemo(
    () => users.filter((u) => (revealed ? u.vote != null : u.vote)).length,
    [users, revealed]
  );

  const stats = useMemo(() => computeStats(users, revealed), [users, revealed]);

  function joinRoom() {
    if (!name.trim() || !roomId.trim()) return;

    const s = io(SERVER_URL, { transports: ["websocket", "polling"] });

    s.emit("join", { roomId: roomId.trim(), name: name.trim() });

    s.on("state", (state) => {
      setUsers(state.users || []);
      setRevealed(!!state.revealed);

      if (!state.revealed && (state.users || []).every((u) => !u.vote)) {
        setMyVote(null);
      }
    });

    setSocket(s);
  }

  function vote(value) {
    if (!socket) return;
    setMyVote(value);
    socket.emit("vote", { roomId, vote: value });
  }

  function revealVotes() {
    socket?.emit("reveal", { roomId });
  }

  function resetVotes() {
    setMyVote(null);
    socket?.emit("reset", { roomId });
  }

  if (!socket) {
    return (
      <div className="page">
        <div className="wrap">
          <div className="header">
            <h1>Planning Poker</h1>
            <p className="sub">Simple, real-time sprint estimation.</p>
          </div>

          <div className="card">
            <div className="grid2">
              <label>
                <span>Your name</span>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Player1"
                />
              </label>

              <label>
                <span>Room ID</span>
                <input
                  value={roomId}
                  onChange={(e) => setRoomId(e.target.value)}
                  placeholder="TPM"
                />
              </label>
            </div>

            <div className="row joinRow">
              <button className="btn primary" onClick={joinRoom}>
                Join room
              </button>
            </div>

            <p className="hint">Tip: everyone joins the same Room ID to vote together.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="wrap">
        <div className="topbar">
          <div>
            <h2>Room: {roomId}</h2>

            <div className="chips">
              <span className="chip voted">
                Voted: <strong>{votedCount}/{users.length}</strong>
              </span>

              <span className={`chip ${revealed ? "revealed" : "hidden"}`}>
                Status: <strong>{revealed ? "Revealed" : "Hidden"}</strong>
              </span>
            </div>
          </div>

          <div className="row">
            <button className="btn" onClick={resetVotes}>
              Reset votes
            </button>
            <button className="btn primary" onClick={revealVotes}>
              Reveal
            </button>
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
                  <div className="playerName">{u.name}</div>
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
                    {stats?.avg == null ? "—" : Math.round(stats.avg * 100) / 100}
                  </strong>
                </div>
                <div className="stat">
                  <span>Mean</span>
                  <strong>
                    {stats?.mean == null ? "—" : Math.round(stats.mean * 100) / 100}
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
