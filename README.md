# WhatsApp Session Manager API

Production-ready WhatsApp Session Manager API with multi-session support, dual pairing methods (QR Code & Pairing Code), real-time WebSocket updates, and secure API key authentication.

Built with **Node.js**, **Express.js**, **Baileys**, and **Socket.IO**.

---

## Table of Contents

- [Features](#features)
- [Architecture](#architecture)
- [Requirements](#requirements)
- [Installation](#installation)
- [Configuration](#configuration)
- [Running](#running)
- [API Reference](#api-reference)
  - [Health Check](#health-check)
  - [Create Session](#create-session)
  - [Session Status](#session-status)
  - [List Sessions](#list-sessions)
  - [Check Number](#check-number)
  - [Delete Session](#delete-session)
- [WebSocket (Socket.IO)](#websocket-socketio)
  - [Connection](#connection)
  - [Events](#events)
- [Authentication](#authentication)
- [Rate Limiting](#rate-limiting)
- [Error Handling](#error-handling)
- [Project Structure](#project-structure)
- [Testing](#testing)
- [Deployment](#deployment)
- [Troubleshooting](#troubleshooting)

---

## Features

- **Dual Pairing Methods** — QR Code scan or 8-digit Pairing Code via WhatsApp notification
- **Multi-Session Support** — Run unlimited isolated WhatsApp sessions simultaneously
- **Real-Time Updates** — QR codes, pairing codes, connection status pushed via Socket.IO
- **Auto-Reconnect** — Exponential backoff reconnection on disconnects (max 5 retries)
- **QR Regeneration** — Automatic QR refresh on expiry (up to 5 attempts)
- **Number Lookup** — Check if a phone number exists on WhatsApp
- **Multi-Key Auth** — Multiple API keys supported via `x-api-key` header
- **Rate Limiting** — Configurable per-IP rate limiting
- **Clean Shutdown** — Graceful SIGINT/SIGTERM handling closes all sessions
- **File-Based Storage** — Each session persisted in its own directory
- **VPS Ready** — Listens on `0.0.0.0`, CORS enabled, no localhost-only logic

---

## Architecture

```
Client (Wix / Laravel / React / etc.)
  │
  ├── REST API (HTTP) ──────── Express.js ──── Controllers ──── SessionManager
  │                                │                                  │
  │                           Middlewares                        Baileys (WA)
  │                         (Auth, Rate Limit)                        │
  │                                                              /sessions/
  └── WebSocket (Socket.IO) ── Dynamic Namespaces ── Real-time events
```

---

## Requirements

- **Node.js** >= 18.0.0 (LTS recommended)
- **npm** >= 9.0.0
- A server/VPS with internet access (for WhatsApp Web connection)

---

## Installation

```bash
# Clone the repository
git clone <your-repo-url> whatsapp-session-manager
cd whatsapp-session-manager

# Install dependencies
npm install

# Create environment file
cp .env.example .env

# Edit configuration
nano .env  # or use your preferred editor
```

---

## Configuration

All configuration is via environment variables in `.env`:

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | HTTP server port |
| `HOST` | `0.0.0.0` | Bind address (`0.0.0.0` for all interfaces) |
| `API_KEYS` | _(empty)_ | Comma-separated API keys. Leave empty to disable auth |
| `CORS_ORIGIN` | `*` | Allowed CORS origins (`*` = all) |
| `LOG_LEVEL` | `info` | Pino log level: `fatal`, `error`, `warn`, `info`, `debug`, `trace`, `silent` |
| `SESSIONS_DIR` | `./sessions` | Directory for session auth state files |
| `RATE_LIMIT_WINDOW_MS` | `900000` | Rate limit window in milliseconds (default: 15 min) |
| `RATE_LIMIT_MAX` | `100` | Max requests per window per IP |

### Example `.env`

```env
PORT=3000
HOST=0.0.0.0
API_KEYS=sk_live_abc123,sk_live_def456
CORS_ORIGIN=*
LOG_LEVEL=info
SESSIONS_DIR=./sessions
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX=100
```

---

## Running

```bash
# Production
npm start

# Development (with auto-reload)
npm run dev

# Run tests
npm test
```

---

## API Reference

All API endpoints (except `/health`) require authentication via `x-api-key` header when `API_KEYS` is configured.

### Standard Response Format

All responses follow this structure:

```json
{
  "success": true,
  "message": "Description",
  "data": { }
}
```

Error responses:

```json
{
  "success": false,
  "message": "Error description"
}
```

---

### Health Check

Check if the server is running.

```
GET /health
```

**Authentication:** Not required

**Response:**

```json
{
  "success": true,
  "message": "OK",
  "data": {
    "uptime": 120,
    "timestamp": "2026-02-25T10:00:00.000Z",
    "memoryUsage": 52428800
  }
}
```

---

### Create Session

Create a new WhatsApp session using QR code or pairing code method.

```
POST /api/session/create
Content-Type: application/json
x-api-key: your-api-key
```

#### Method 1: QR Code (default)

**Request Body:**

```json
{
  "sessionId": "my-session-1",
  "pairingMethod": "qr"
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `sessionId` | string | No | Custom session ID. Auto-generated UUID if omitted. Only `a-z`, `A-Z`, `0-9`, `-`, `_` allowed. |
| `pairingMethod` | string | No | `"qr"` (default) or `"code"` |

**Response:**

```json
{
  "success": true,
  "message": "Session created",
  "data": {
    "sessionId": "my-session-1",
    "pairingMethod": "qr",
    "status": "qr_generated"
  }
}
```

After this, connect to the WebSocket namespace `/{sessionId}` to receive the QR code as a base64 image.

#### Method 2: Pairing Code

**Request Body:**

```json
{
  "sessionId": "my-session-2",
  "pairingMethod": "code",
  "phoneNumber": "628123456789"
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `sessionId` | string | No | Custom session ID |
| `pairingMethod` | string | Yes | Must be `"code"` |
| `phoneNumber` | string | Yes | Phone number in E.164 format without `+` (e.g., `628123456789`) |

**Response:**

```json
{
  "success": true,
  "message": "Session created",
  "data": {
    "sessionId": "my-session-2",
    "pairingMethod": "code",
    "status": "code_requested",
    "pairingCode": "A1B2-C3D4"
  }
}
```

The user must enter this 8-digit code in **WhatsApp > Linked Devices > Link with phone number**.

---

### Session Status

Get the current status of a session.

```
GET /api/session/status/:sessionId
x-api-key: your-api-key
```

**Response:**

```json
{
  "success": true,
  "message": "Session status retrieved",
  "data": {
    "sessionId": "my-session-1",
    "status": "connected"
  }
}
```

**Possible status values:**

| Status | Description |
|---|---|
| `connecting` | Session is initializing |
| `qr_required` | Waiting for QR code scan |
| `code_required` | Waiting for pairing code entry |
| `connected` | Session is active and connected |
| `closed` | Session is closed or doesn't exist |

---

### List Sessions

List all active sessions.

```
GET /api/session/list
x-api-key: your-api-key
```

**Response:**

```json
{
  "success": true,
  "message": "Sessions retrieved",
  "data": {
    "sessions": [
      { "sessionId": "my-session-1", "status": "connected" },
      { "sessionId": "my-session-2", "status": "qr_required" }
    ]
  }
}
```

---

### Check Number

Check if a phone number is registered on WhatsApp.

```
POST /api/session/check-number
Content-Type: application/json
x-api-key: your-api-key
```

**Request Body:**

```json
{
  "sessionId": "my-session-1",
  "number": "628123456789"
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `sessionId` | string | Yes | An active (connected) session ID |
| `number` | string | Yes | Phone number in E.164 format without `+` |

**Response (exists):**

```json
{
  "success": true,
  "message": "Number check completed",
  "data": {
    "exists": true,
    "jid": "628123456789@s.whatsapp.net"
  }
}
```

**Response (not found):**

```json
{
  "success": true,
  "message": "Number check completed",
  "data": {
    "exists": false,
    "jid": null
  }
}
```

---

### Delete Session

Logout and destroy a session. Removes all session files.

```
DELETE /api/session/:sessionId
x-api-key: your-api-key
```

**Response:**

```json
{
  "success": true,
  "message": "Session deleted",
  "data": {
    "sessionId": "my-session-1",
    "status": "closed"
  }
}
```

---

## WebSocket (Socket.IO)

Real-time events are delivered via Socket.IO dynamic namespaces.

### Connection

Connect to the session namespace using the Socket.IO client:

```javascript
import { io } from "socket.io-client";

const socket = io("https://your-domain.com/my-session-1", {
  path: "/socket.io",
});
```

Each session has its own namespace: `/{sessionId}`

### Events

| Event | Direction | Payload | Description |
|---|---|---|---|
| `qr` | Server → Client | `string` (base64 data URL) | QR code image for scanning. Emitted multiple times as QR refreshes. |
| `pairing_code` | Server → Client | `{ code: "A1B2-C3D4" }` | 8-digit pairing code (only for `pairingMethod: "code"`) |
| `connected` | Server → Client | `{ sessionId: "..." }` | Session successfully connected to WhatsApp |
| `disconnected` | Server → Client | `{ reason: "..." }` | Session disconnected |

**Disconnect reasons:**

| Reason | Description |
|---|---|
| `logged_out` | User logged out from WhatsApp |
| `max_qr_attempts` | QR code scanned too slowly (5 attempts exhausted) |
| `max_retries` | Reconnection attempts exhausted |
| `pairing_code_failed` | Failed to request pairing code |
| `manual_logout` | Session deleted via API |

### Full Client Example

```html
<!DOCTYPE html>
<html>
<head>
  <title>WhatsApp QR Scanner</title>
  <script src="https://cdn.socket.io/4.8.1/socket.io.min.js"></script>
</head>
<body>
  <div id="status">Connecting...</div>
  <img id="qr" style="display:none; width:300px; height:300px;" />

  <script>
    const SESSION_ID = 'my-session-1';
    const SERVER_URL = 'https://your-domain.com';

    const socket = io(`${SERVER_URL}/${SESSION_ID}`, {
      path: '/socket.io',
    });

    socket.on('qr', (qrBase64) => {
      document.getElementById('status').textContent = 'Scan QR Code:';
      const img = document.getElementById('qr');
      img.src = qrBase64;
      img.style.display = 'block';
    });

    socket.on('pairing_code', (data) => {
      document.getElementById('status').textContent =
        `Enter this code in WhatsApp: ${data.code}`;
      document.getElementById('qr').style.display = 'none';
    });

    socket.on('connected', (data) => {
      document.getElementById('status').textContent = '✅ Connected!';
      document.getElementById('qr').style.display = 'none';
    });

    socket.on('disconnected', (data) => {
      document.getElementById('status').textContent =
        `❌ Disconnected: ${data.reason}`;
      document.getElementById('qr').style.display = 'none';
    });
  </script>
</body>
</html>
```

---

## Authentication

API key authentication is enforced on all `/api/*` routes when `API_KEYS` is set in `.env`.

- Pass the key via `x-api-key` HTTP header
- Multiple keys supported (comma-separated in `.env`)
- If `API_KEYS` is empty or not set, authentication is **disabled** (open access)
- The `/health` endpoint is always public

**Example:**

```bash
curl -X POST http://localhost:3000/api/session/create \
  -H "Content-Type: application/json" \
  -H "x-api-key: sk_live_abc123" \
  -d '{"pairingMethod": "qr"}'
```

**Error (missing key):**

```json
{
  "success": false,
  "message": "API key is required. Provide it via x-api-key header."
}
```

**Error (invalid key):**

```json
{
  "success": false,
  "message": "Invalid API key."
}
```

---

## Rate Limiting

- Default: **100 requests per 15 minutes** per IP address
- Configurable via `RATE_LIMIT_WINDOW_MS` and `RATE_LIMIT_MAX` in `.env`
- Uses standard `RateLimit-*` headers in responses
- Applied globally to all routes

**Rate limit exceeded response (HTTP 429):**

```json
{
  "success": false,
  "message": "Too many requests, please try again later."
}
```

---

## Error Handling

Global error handler catches all unhandled errors and returns standardized responses.

| HTTP Code | Scenario |
|---|---|
| 400 | Invalid input (bad sessionId, missing fields, invalid number) |
| 401 | Missing or invalid API key |
| 404 | Session not found |
| 429 | Rate limit exceeded |
| 500 | Internal server error |

In development, error messages are verbose. In production (`NODE_ENV=production`), internal errors return generic messages.

---

## Project Structure

```
whatsapp-session-manager/
├── server.js                          # Entry point: HTTP + Socket.IO server
├── package.json                       # Dependencies & scripts
├── .env                               # Environment config (gitignored)
├── .env.example                       # Template for .env
├── .gitignore
│
├── src/
│   ├── app.js                         # Express app setup & middleware
│   │
│   ├── config/
│   │   └── index.js                   # Parsed env configuration
│   │
│   ├── controllers/
│   │   └── sessionController.js       # Request handlers
│   │
│   ├── middlewares/
│   │   ├── apiKeyAuth.js              # API key authentication
│   │   ├── errorHandler.js            # Global error handler
│   │   └── rateLimiter.js             # Rate limiting
│   │
│   ├── routes/
│   │   ├── healthRoutes.js            # GET /health
│   │   └── sessionRoutes.js           # /api/session/* routes
│   │
│   ├── services/
│   │   └── sessionManager.js          # Baileys session lifecycle
│   │
│   ├── sockets/
│   │   └── index.js                   # Socket.IO initialization
│   │
│   └── utils/
│       ├── logger.js                  # Pino logger
│       └── response.js               # Standardized response helpers
│
├── sessions/                          # Session auth files (gitignored)
│   └── .gitkeep
│
└── tests/
    ├── unit/
    │   ├── config.test.js
    │   ├── response.test.js
    │   ├── apiKeyAuth.test.js
    │   ├── errorHandler.test.js
    │   └── sessionController.test.js
    └── integration/
        └── api.test.js
```

---

## Testing

```bash
# Run all tests
npm test

# Run with verbose output
npm test -- --reporter spec

# Run only unit tests
npx vitest run tests/unit

# Run only integration tests
npx vitest run tests/integration

# Watch mode
npx vitest
```

---

## Deployment

### VPS (Ubuntu/Debian)

```bash
# Install Node.js 20 LTS
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Clone & setup
git clone <repo-url> /opt/whatsapp-api
cd /opt/whatsapp-api
npm install --production
cp .env.example .env
nano .env  # configure API_KEYS, PORT, etc.

# Run with PM2
npm install -g pm2
pm2 start server.js --name whatsapp-api
pm2 save
pm2 startup
```

### Reverse Proxy (Nginx)

```nginx
server {
    listen 80;
    server_name api.yourdomain.com;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 86400;
    }
}
```

> **Important:** WebSocket support requires `proxy_set_header Upgrade` and `Connection "upgrade"`.

### Docker (optional)

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --production
COPY . .
EXPOSE 3000
CMD ["node", "server.js"]
```

---

## Troubleshooting

### QR code not appearing
- Ensure the Socket.IO client is connected to the correct namespace (`/{sessionId}`)
- Check server logs for QR generation errors
- Try deleting the session folder and creating a new session

### Pairing code not working
- Ensure `phoneNumber` is in E.164 format without `+` (e.g., `628123456789`)
- The phone number must be the one registered on the target WhatsApp account
- Pairing codes expire quickly — enter it within 60 seconds

### Session keeps reconnecting
- Check your internet connection on the server
- WhatsApp may have temporarily blocked the connection — wait a few minutes
- If stuck, delete the session and create a new one

### Port already in use
```bash
# Find and kill the process using the port
lsof -i :3000
kill -9 <PID>
```

### Rate limit errors in development
Set higher limits in `.env`:
```env
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX=1000
```

---

## License

MIT
