# WebTerm

Web-based terminal service with SSH, Telnet, and local shell support.

## Features

- **SSH**: Connect to remote servers with password or key authentication
- **Telnet**: Connect to legacy devices
- **Local Shell**: Start a local bash/zsh session
- **Session Management**: Multiple terminal sessions with tabs
- **Log Recording**: Record terminal sessions in asciinema format
- **Connection Manager**: Save and manage connection configurations
- **Modern UI**: Dark theme with responsive design

## Installation

```bash
npm install
```

## Configuration

Copy `.env.example` to `.env` and modify as needed:

```bash
cp .env.example .env
```

Or use environment variables directly:

```bash
PORT=8080 npm run dev
```

## Running

```bash
# Development
npm run dev

# Production
npm run build
npm start
```

The server will start at `http://localhost:PORT` (default: 3000).

## Default Credentials

- Username: `admin`
- Password: `admin`

Change these via environment variables:
```bash
ADMIN_USER=myuser ADMIN_PASS=mypassword npm start
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | Server port |
| `HOST` | `0.0.0.0` | Server host |
| `SESSION_SECRET` | `webterm-secret-...` | Session encryption key |
| `DB_PATH` | `./data/webterm.db` | SQLite database path |
| `LOG_DIR` | `./data/logs` | Log recordings directory |
| `ADMIN_USER` | `admin` | Default admin username |
| `ADMIN_PASS` | `admin` | Default admin password |

## Project Structure

```
webTerm/
├── src/
│   ├── server.ts           # Express + WebSocket server
│   ├── config.ts           # Configuration
│   ├── middleware/          # Auth & session middleware
│   ├── routes/             # API & WebSocket routes
│   ├── services/           # Business logic
│   ├── protocols/          # SSH, Telnet, Local implementations
│   └── utils/              # Logger, crypto utilities
├── public/
│   ├── index.html          # Main HTML
│   ├── css/term.css        # Styles
│   └── js/app.js           # Frontend logic
└── data/
    ├── webterm.db          # SQLite database
    └── logs/               # Session recordings
```

## API Endpoints

### Authentication
- `POST /api/auth/login` - Login
- `POST /api/auth/logout` - Logout

### Connections
- `GET /api/connections` - List connections
- `POST /api/connections` - Create connection
- `PUT /api/connections/:id` - Update connection
- `DELETE /api/connections/:id` - Delete connection

### Sessions
- `GET /api/sessions` - List sessions

### Recordings
- `GET /api/recordings` - List recordings
- `GET /api/recordings/:id/download` - Download recording

## WebSocket Protocol

### Client Messages
```json
{ "type": "create", "protocol": "ssh", "host": "...", "port": 22 }
{ "type": "input", "sessionId": "...", "data": "ls\n" }
{ "type": "resize", "sessionId": "...", "cols": 80, "rows": 24 }
{ "type": "recording:start", "sessionId": "..." }
{ "type": "recording:stop", "sessionId": "..." }
{ "type": "close", "sessionId": "..." }
```

### Server Messages
```json
{ "type": "created", "sessionId": "...", "protocol": "ssh" }
{ "type": "output", "sessionId": "...", "data": "file1 file2\n" }
{ "type": "exit", "sessionId": "..." }
{ "type": "error", "sessionId": "...", "message": "..." }
{ "type": "recording:status", "sessionId": "...", "active": true }
```

## License

MIT
