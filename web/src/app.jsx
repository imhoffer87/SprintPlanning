import { useEffect, useState } from "react";
import { io } from "socket.io-client";

const SERVER = import.meta.env.VITE_SERVER_URL || "http://localhost:8787";

export default function App() {
  const [name, setName] = useState("");
  const [room, setRoom] = useState("");
  const [socket, setSocket] = useState(null);
  const [users, setUsers] = useState([]);
  const [revealed, setRevealed] = useState(false);

  const join = () => {
    const s = io(SERVER);
    s.emit("join", { roomId: room, name });
    s.on("state", state => {
      setUsers(state.users);
      setRevealed(state.revealed);
    });
    setSocket(s);
  };

  return (
    <div style={{ padding: 20 }}>
      {!socket ? (
        <>
          <input placeholder="Name" onChange={e => setName(e.target.value)} />
          <input placeholder="Room" onChange={e => setRoom(e.target.value)} />
          <button onClick={join}>Join</button>
        </>
      ) : (
        <>
          <h2>Room: {room}</h2>
          <button onClick={() => socket.emit("reveal", { roomId: room })}>
            Reveal
          </button>
          <ul>
            {users.map(u => (
              <li key={u.id}>
                {u.name}: {revealed ? u.vote || "-" : u.vote ? "Voted" : "Waiting"}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

