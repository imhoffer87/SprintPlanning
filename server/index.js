import express from "express";
import http from "http";
import cors from "cors";
import { Server } from "socket.io";

const app = express();

const allowedOrigins = (process.env.CORS_ORIGINS || "")
  .split(",")
  .map(s => s.trim())
  .filter(Boolean);

app.use(cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true);
    if (allowedOrigins.length === 0) return cb(null, true);
    cb(null, allowedOrigins.includes(origin));
  },
  credentials: true
}));

app.get("/health", (_, res) => res.json({ ok: true }));

const server = http.createServer(app);

const rooms = new Map();

function getOrCreateRoom(roomId) {
  if (!rooms.has(roomId)) {
    rooms.set(roomId, {
      story: "New story",
      deck: ["1", "2", "3", "5", "8", "13", "21", "?", "☕"],
      revealed: false,
      users: new Map()
    });
  }
  return rooms.get(roomId);
}

function roomPublicState(room) {
  const users = Array.from(room.users.entries()).map(([id, u]) => ({
    id,
    name: u.name,
    vote: room.revealed ? u.vote : (u.vote ? "VOTED" : null)
  }));
  return { story: room.story, deck: room.deck, revealed: room.revealed, users };
}

io.on("connection", (socket) => {
  socket.on("join", ({ roomId, name }) => {
    const room = getOrCreateRoom(roomId);
    socket.join(roomId);
    room.users.set(socket.id, { name, vote: null });
    io.to(roomId).emit("state", roomPublicState(room));
  });

  socket.on("vote", ({ roomId, vote }) => {
    const room = rooms.get(roomId);
    if (!room) return;
    room.users.get(socket.id).vote = vote;
    io.to(roomId).emit("state", roomPublicState(room));
  });

  socket.on("reveal", ({ roomId }) => {
    const room = rooms.get(roomId);
    if (!room) return;
    room.revealed = true;
    io.to(roomId).emit("state", roomPublicState(room));
  });

  socket.on("reset", ({ roomId }) => {
    const room = rooms.get(roomId);
    if (!room) return;
    room.revealed = false;
    room.users.forEach(u => u.vote = null);
    io.to(roomId).emit("state", roomPublicState(room));
  });

  socket.on("disconnect", () => {
    rooms.forEach(room => {
      room.users.delete(socket.id);
    });
  });
});

const io = new Server(server, {
  cors: {
    origin: (origin, cb) => {
      if (!origin) return cb(null, true);
      if (allowedOrigins.length === 0) return cb(null, true);
      cb(null, allowedOrigins.includes(origin));
    },
    credentials: true
  }
});

