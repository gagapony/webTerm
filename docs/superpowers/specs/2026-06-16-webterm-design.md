# WebTerm Design Specification

## Overview

A web-based terminal service built on xterm.js with SSH, Telnet, and local shell support. Features connection configuration management and session log recording.

## Requirements

- **Protocols**: SSH, Telnet, Local shell
- **Storage**: SQLite for configs/metadata, filesystem for logs
- **Auth**: Basic authentication (username/password)
- **UI**: Uses provided `term.css` design system (~6200 lines)

## Architecture

### System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      Browser (xterm.js)                      │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐    │
│  │ Terminal  │  │ Session  │  │ Connection│  │ Settings │    │
│  │ Viewport  │  │   Tabs   │  │  Manager  │  │   Panel  │    │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘    │
└─────────────────────────┬───────────────────────────────────┘
                          │ WebSocket + HTTP API
┌─────────────────────────┴───────────────────────────────────┐
│                    Express Server                            │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐    │
│  │  Auth    │  │ Session  │  │ Protocol │  │  Log     │    │
│  │ Middleware│  │ Manager  │  │ Handlers │  │ Recorder │    │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘    │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐                  │
│  │   SSH    │  │  Telnet  │  │  Local   │                  │
│  │  Client  │  │  Client  │  │  Shell   │                  │
│  └──────────┘  └──────────┘  └──────────┘                  │
└─────────────────────────┬───────────────────────────────────┘
                          │
┌─────────────────────────┴───────────────────────────────────┐
│                     Storage Layer                            │
│  ┌──────────────────┐  ┌──────────────────────────────────┐ │
│  │     SQLite       │  │          Filesystem              │ │
│  │  - Connections   │  │  - Session logs (.cast files)    │ │
│  │  - Users         │  │  - SSH keys                      │ │
│  │  - Log metadata  │  │  - Configuration exports         │ │
│  └──────────────────┘  └──────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

### Technology Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Frontend | xterm.js + vanilla JS | Terminal rendering |
| Styling | term.css (provided) | UI design system |
| Backend | Express.js + ws | HTTP API + WebSocket |
| Protocols | ssh2, telnet-client, node-pty | SSH/Telnet/Local |
| Storage | better-sqlite3 | Connection configs |
| Logs | Filesystem (.cast format) | Session recordings |
| Auth | express-session + bcrypt | Basic authentication |

## Project Structure

```
webTerm/
├── package.json
├── tsconfig.json
├── term.css                    # Provided styles
├── src/
│   ├── server.ts              # Express + WebSocket setup
│   ├── config.ts              # App configuration
│   ├── middleware/
│   │   ├── auth.ts            # Basic auth middleware
│   │   └── session.ts         # Session management
│   ├── routes/
│   │   ├── api.ts             # REST API routes
│   │   └── ws.ts              # WebSocket handlers
│   ├── services/
│   │   ├── session-manager.ts # Session lifecycle
│   │   ├── log-recorder.ts    # Log recording service
│   │   └── connection-store.ts# SQLite operations
│   ├── protocols/
│   │   ├── ssh.ts             # SSH client (ssh2)
│   │   ├── telnet.ts          # Telnet client
│   │   └── local.ts           # Local shell (node-pty)
│   ├── models/
│   │   ├── connection.ts      # Connection config type
│   │   ├── session.ts         # Session type
│   │   └── user.ts            # User type
│   └── utils/
│       ├── logger.ts          # Logging utility
│       └── crypto.ts          # Password hashing
├── data/
│   ├── webterm.db             # SQLite database
│   └── logs/                  # Session recordings
│       └── {session-id}.cast  # asciinema format
└── public/
    ├── index.html             # Main HTML with term.css structure
    ├── css/
    │   └── term.css           # Provided styles
    ├── js/
    │   ├── app.js             # Main application entry
    │   ├── terminal.js        # xterm.js wrapper & WebSocket
    │   ├── sessions.js        # Session tab management
    │   ├── connections.js     # Connection config CRUD
    │   ├── recorder.js        # Log recording controls
    │   └── settings.js        # Settings modal logic
    └── assets/
        └── fonts/             # MesloLGS NF fonts
```

## Frontend Design

### HTML Structure (term.css Mapping)

```html
<div id="app">
  <!-- Topbar -->
  <header class="topbar">
    <div class="topbar-row topbar-row-main">
      <div class="masthead">
        <div class="brand">
          <img class="brand-mark" src="/logo.svg" />
          <span class="brand-title">WebTerm</span>
        </div>
      </div>
      <div class="status-stack">
        <div class="status-headline">Connected</div>
        <div class="status-detail">192.168.1.100:22</div>
      </div>
      <button class="connection-topology" data-state="connected">
        <span class="topology-button-icon"><!-- SVG --></span>
      </button>
      <div class="toolbar-actions">
        <button class="toolbar-button chrome-button is-primary">New Session</button>
      </div>
    </div>
    <div class="topbar-row topbar-row-tabs">
      <div class="session-tabs-bar">
        <div class="session-tabs">
          <!-- Session tabs rendered dynamically -->
        </div>
      </div>
    </div>
  </header>

  <!-- Terminal Area -->
  <main class="terminal-shell">
    <div class="terminal-frame">
      <div class="terminal-stage">
        <div class="terminal-panels">
          <div class="terminal-pane" data-focused="true">
            <div class="terminal-pane-tabs"><!-- Tabs --></div>
            <div class="terminal-pane-body">
              <div class="terminal-viewport">
                <div class="xterm"><!-- xterm.js --></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </main>
</div>
```

### term.css Class Usage

| Component | term.css Classes |
|-----------|-----------------|
| Topbar | `.topbar`, `.topbar-row`, `.masthead`, `.brand` |
| Status | `.status-stack`, `.status-headline`, `.status-detail` |
| Connection | `.connection-topology`, `[data-state]` |
| Session Tabs | `.session-tabs-bar`, `.session-tab`, `[data-indicator]` |
| Recording | `.session-tab-record`, `[data-recording]` |
| Terminal | `.terminal-frame`, `.terminal-stage`, `.terminal-viewport` |
| Settings | `.settings-modal`, `.settings-dialog`, `.settings-body` |
| Buttons | `.toolbar-button`, `.chrome-button`, `.is-primary` |

## Backend Design

### Database Schema

```sql
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE connections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  protocol TEXT NOT NULL CHECK(protocol IN ('ssh', 'telnet', 'local')),
  host TEXT,
  port INTEGER,
  username TEXT,
  password_encrypted TEXT,
  ssh_key_path TEXT,
  ssh_key_passphrase TEXT,
  options JSON,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  connection_id INTEGER REFERENCES connections(id),
  protocol TEXT NOT NULL,
  host TEXT,
  port INTEGER,
  started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  ended_at DATETIME,
  log_path TEXT,
  status TEXT CHECK(status IN ('active', 'closed', 'error'))
);

CREATE INDEX idx_sessions_connection ON sessions(connection_id);
CREATE INDEX idx_sessions_started ON sessions(started_at);
```

### REST API

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/auth/login` | Login |
| `POST` | `/api/auth/logout` | Logout |
| `GET` | `/api/connections` | List connections |
| `POST` | `/api/connections` | Create connection |
| `PUT` | `/api/connections/:id` | Update connection |
| `DELETE` | `/api/connections/:id` | Delete connection |
| `POST` | `/api/sessions` | Start session |
| `GET` | `/api/sessions` | List sessions |
| `DELETE` | `/api/sessions/:id` | Close session |
| `POST` | `/api/sessions/:id/recording/start` | Start recording |
| `POST` | `/api/sessions/:id/recording/stop` | Stop recording |
| `GET` | `/api/recordings` | List recordings |
| `GET` | `/api/recordings/:id/download` | Download .cast |

### WebSocket Protocol

```
Client → Server:
  { type: "input", sessionId: "xxx", data: "ls -la\n" }
  { type: "resize", sessionId: "xxx", cols: 80, rows: 24 }
  { type: "recording:start", sessionId: "xxx" }
  { type: "recording:stop", sessionId: "xxx" }

Server → Client:
  { type: "output", sessionId: "xxx", data: "file1 file2\n" }
  { type: "exit", sessionId: "xxx", code: 0 }
  { type: "error", sessionId: "xxx", message: "Connection failed" }
  { type: "recording:status", sessionId: "xxx", active: true }
```

## Protocol Implementations

### SSH (ssh2)

```typescript
interface SSHOptions {
  host: string;
  port: number;
  username: string;
  password?: string;
  privateKey?: string;
  passphrase?: string;
}

class SSHSession {
  private client: Client;
  private stream: any;

  async connect(options: SSHOptions): Promise<void>;
  onData(callback: (data: Buffer) => void): void;
  write(data: string): void;
  resize(cols: number, rows: number): void;
  close(): void;
}
```

### Telnet (telnet-client)

```typescript
interface TelnetOptions {
  host: string;
  port: number;
  shellPrompt?: string;
  timeout?: number;
}

class TelnetSession {
  async connect(options: TelnetOptions): Promise<void>;
  onData(callback: (data: string) => void): void;
  write(data: string): void;
  close(): void;
}
```

### Local Shell (node-pty)

```typescript
interface LocalOptions {
  shell?: string;
  cwd?: string;
  env?: Record<string, string>;
}

class LocalSession {
  spawn(options: LocalOptions): void;
  onData(callback: (data: string) => void): void;
  write(data: string): void;
  resize(cols: number, rows: number): void;
  kill(): void;
}
```

## Log Recording

### asciinema .cast Format

```jsonl
{"version": 2, "width": 80, "height": 24, "timestamp": 1234567890}
[0.5, "o", "user@server:~$ "]
[1.2, "o", "ls -la\r\n"]
[1.5, "o", "total 48\r\n"]
[2.0, "i", "c"]
```

### LogRecorder Service

```typescript
class LogRecorder {
  start(sessionId: string, cols: number, rows: number): void;
  writeOutput(data: string): void;
  writeInput(data: string): void;
  stop(): string;  // returns log path
  isActive(): boolean;
}
```

## Connection States

| State | term.css Selector | Meaning |
|-------|-------------------|---------|
| `connected` | `[data-state=connected]` | Active connection |
| `degraded` | `[data-state=degraded]` | Slow/unstable |
| `offline` | `[data-state=offline]` | Disconnected |
| `unconfigured` | `[data-state=unconfigured]` | Not configured |

## Session Indicators

| Indicator | term.css Selector | Meaning |
|-----------|-------------------|---------|
| `live` | `[data-indicator=live]` | Active with pulse |
| `watching` | `[data-indicator=watching]` | Read-only |
| `disconnected` | `[data-indicator=disconnected]` | Ended |
| `closed` | `[data-indicator=closed]` | Cleanly closed |
| `error` | `[data-indicator=error]` | Error state |

## Settings Modal Structure

```
.settings-modal[data-open=true]
├── .settings-scrim
└── .settings-dialog
    ├── .settings-header
    │   ├── .settings-copy
    │   │   ├── .settings-kicker
    │   │   ├── .settings-title
    │   │   └── .settings-subtitle
    │   └── .settings-close-button
    ├── .settings-body
    │   └── .settings-grid
    │       └── .compact-field
    │           ├── .toolbar-label
    │           └── .toolbar-input
    └── .settings-footer
        └── .settings-footer-actions
            └── .chrome-button.is-primary
```

## Implementation Phases

### Phase 1: Core Setup
- Express server with TypeScript
- SQLite database setup
- Basic auth middleware
- Static file serving

### Phase 2: Terminal Engine
- xterm.js integration
- WebSocket connection
- Local shell (node-pty)
- Terminal viewport with term.css

### Phase 3: Remote Protocols
- SSH client (ssh2)
- Telnet client
- Connection configuration UI

### Phase 4: Session Management
- Session tabs
- Multi-session support
- Session lifecycle management

### Phase 5: Recording & Logs
- Log recorder service
- Recording controls UI
- .cast file generation
- Recording playback

### Phase 6: Polish
- Settings modal
- Error handling
- Connection state indicators
- Responsive design
