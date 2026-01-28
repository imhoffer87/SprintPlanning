// server/index.js
import express from "express";
import http from "http";
import cors from "cors";
import { Server } from "socket.io";

const app = express();

const allowedOrigins = (process.env.CORS_ORIGINS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const corsOptions = {
  origin: (origin, cb) => {
    if (!origin) return cb(null, true); // curl/postman/no-origin
    if (allowedOrigins.length === 0) return cb(null, true); // allow all if unset
    return cb(null, allowedOrigins.includes(origin));
  },
  credentials: true,
};

app.use(cors(corsOptions));
app.get("/health", (_, res) => res.json({ ok: true }));

const server = http.createServer(app);

// ---- Socket.IO (IMPORTANT: create io before using it) ----
const io = new Server(server, {
  cors: corsOptions,
});

// ---- Rooms store ----
/**
 * rooms: Map<roomId, {
 *   story: string,
 *   deck: string[],
 *   revealed: boolean,
 *   users: Map<socketId, { name: string, vote: string|null }>,
 *   facilitators: Set<socketId>
 * }>
 */
const rooms = new Map();

function getOrCreateRoom(roomId) {
  if (!rooms.has(roomId)) {
    rooms.set(roomId, {
      story: "New story",
      deck: ["1", "2", "3", "5", "8", "13", "21", "?", "☕"],
      revealed: false,
      users: new Map(),
      facilitators: new Set(),
    });
  }
  return rooms.get(roomId);
}

function roomPublicState(room) {
  const users = Array.from(room.users.entries()).map(([id, u]) => ({
    id,
    name: u.name,
    vote: room.revealed ? u.vote : u.vote ? "VOTED" : null,
    isFacilitator: room.facilitators.has(id),
  }));

  const facilitatorCount = room.facilitators.size;
  const controlsLocked = facilitatorCount > 0; // once any facilitator exists, controls become fac-only

  return {
    story: room.story,
    deck: room.deck,
    revealed: room.revealed,
    users,
    facilitatorCount,
    controlsLocked,
  };
}

function emitRoomState(roomId) {
  const room = rooms.get(roomId);
  if (!room) return;
  io.to(roomId).emit("state", roomPublicState(room));
}

function canControlRoom(room, socketId) {
  // If no facilitators exist, anyone can control.
  if (room.facilitators.size === 0) return true;
  // If facilitators exist, only facilitators can control.
  return room.facilitators.has(socketId);
}

io.on("connection", (socket) => {
  socket.on("join", ({ roomId, name, isFacilitator }) => {
    if (!roomId || !name) return;

    const rid = String(roomId).trim();
    const displayName = String(name).trim().slice(0, 50);

    const room = getOrCreateRoom(rid);

    // track membership on socket for cleanup
    socket.data.roomId = rid;

    socket.join(rid);

    // Upsert user
    room.users.set(socket.id, { name: displayName, vote: null });

    // Optional facilitator
    if (isFacilitator) {
      room.facilitators.add(socket.id);
    } else {
      // joining as non-fac does NOT remove facilitator status
      // (so refreshes don't accidentally revoke)
    }

    emitRoomState(rid);
  });

  socket.on("vote", ({ roomId, vote }) => {
    const rid = String(roomId || "").trim();
    const room = rooms.get(rid);
    if (!room) return;

    const user = room.users.get(socket.id);
    if (!user) return;

    user.vote = vote ?? null;
    emitRoomState(rid);
  });

  socket.on("reveal", ({ roomId }) => {
    const rid = String(roomId || "").trim();
    const room = rooms.get(rid);
    if (!room) return;

    if (!canControlRoom(room, socket.id)) return;

    room.revealed = true;
    emitRoomState(rid);
  });

  socket.on("reset", ({ roomId }) => {
    const rid = String(roomId || "").trim();
    const room = rooms.get(rid);
    if (!room) return;

    if (!canControlRoom(room, socket.id)) return;

    room.revealed = false;
    room.users.forEach((u) => (u.vote = null));
    emitRoomState(rid);
  });

  socket.on("disconnect", () => {
    // Prefer the room we stored on join
    const rid = socket.data.roomId;

    if (rid && rooms.has(rid)) {
      const room = rooms.get(rid);

      room.users.delete(socket.id);
      room.facilitators.delete(socket.id);

      // If room empty, delete it; otherwise emit updated state
      if (room.users.size === 0) {
        rooms.delete(rid);
      } else {
        emitRoomState(rid);
      }
      return;
    }

    // Fallback: scan rooms (in case disconnect happens before join finished)
    for (const [roomId, room] of rooms.entries()) {
      if (room.users.has(socket.id) || room.facilitators.has(socket.id)) {
        room.users.delete(socket.id);
        room.facilitators.delete(socket.id);

        if (room.users.size === 0) rooms.delete(roomId);
        else emitRoomState(roomId);
      }
    }
  });
});

const PORT = process.env.PORT || 8787;
server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
