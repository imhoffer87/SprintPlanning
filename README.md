# SprintPlanning

Planning Poker sprint estimation tool with real-time voting via WebSocket.

## Quick Start

### Prerequisites

- Node.js 16+ and npm

### Setup & Development

```bash
# Install dependencies for both server and web
npm install

# Start both server and web in development mode
npm run dev
```

The server runs on `http://localhost:8787` and the web frontend on `http://localhost:5173`.

### Manual Setup (if workspaces don't work)

**Server:**

```bash
cd server
npm install
npm start
```

**Web (in another terminal):**

```bash
cd web
npm install
npm run dev
```

## Project Structure

- `server/` - Express + Socket.io backend (port 8787)
- `web/` - React + Vite frontend (port 5173)
- `scripts/` - Development utilities

## Available Scripts

**Root:**

- `npm run dev` - Start server and frontend in parallel
- `npm run build` - Build the web frontend for production
- `npm start` - Start server only

**Web:**

- `npm run dev` - Start Vite dev server
- `npm run build` - Build for production
- `npm run preview` - Preview production build

**Server:**

- `npm start` - Start Express server

## Environment Variables

**Server:**

- `PORT` (default: 8787) - Server port
- `CORS_ORIGINS` - Comma-separated list of allowed origins for CORS

Example:

```bash
PORT=3000 CORS_ORIGINS=http://localhost:5173 npm start
```

## Features

- Real-time voting rooms via WebSocket
- Facilitator mode for room control
- Vote reveal and statistics (sum, avg, mode)
- Auto-reconnection with exponential backoff
- Mobile-friendly responsive design
