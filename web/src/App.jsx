import { useState } from "react";
import { io } from "socket.io-client";

const SERVER_URL =
  import.meta.env.VITE_SERVER_URL || "http://localhost:8787";

export default function App() {
  const [name, setName] = useState("");
  const [roomId, setRoomId] = useState("");
  const [socket, setSocket] = useState(null);
  const [users, setUsers] = useState([]);
  const [revealed, setRevealed] = useState(false);

  function joinRoom() {
    if (!name || !roomId) return;

    const s = io(SERVER_URL);
    s.emit("join", { roomId, name });

    s.on("state", (state) => {
      setUsers(state.users);
      setRevealed(state.revealed);
    });

    setSocket(s);
  }

  function vote(value) {
    socket.emit("vote", { roomId, vote: value });
  }

  if (!socket) {
    return (
      <div style={{ padding: 20 }}>
        <h1>Planning Poker</h1>
        <input
          placeholder="Your name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <input
          placeholder="Room ID"
          value={roomId}
          onChange={(e) => setRoomId(e.target.value)}
        />
        <button onClick={joinRoom}>Join</button>
      </div>
    );
  }

  return (
    <div style={{ padding: 20 }}>
      <h2>Room: {roomId}</h2>

      <div style={{ marginBottom: 12 }}>
        <button onClick={() => vote("1")}>1</button>
        <button onClick={() => vote("2")}>2</button>
        <button onClick={() => vote("3")}>3</button>
        <button onClick={() => vote("5")}>5</button>
        <button onClick={() => vote("8")}>8</button>
      </div>

      <button onClick={() => socket.emit("reveal", { roomId })}>
        Reveal
      </button>

      <h3>Players</h3>
      {users.map((u) => (
        <div key={u.id} className="user">
          {u.name}:{" "}
          {revealed ? u.vote || "-" : u.vote ? "Voted" : "Waiting"}
        </div>
      ))}
    </div>
  );
}

