<div align="center">

# WebTerm

**A self-hosted, browser-based terminal for SSH & Telnet.**

Connect to remote servers from any modern browser — no client installs, no plugins.
Built on [xterm.js](https://xtermjs.org/) with a real-time WebSocket backend, encrypted credential
storage, session recording, and a polished frosted-glass UI.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](#license)
[![Go](https://img.shields.io/badge/Go-1.23%2B-00ADD8?logo=go&logoColor=white)](https://go.dev/)
[![Docker](https://img.shields.io/badge/Docker-%E2%89%A524-2496ED?logo=docker&logoColor=white)](https://www.docker.com/)
[![xterm.js](https://img.shields.io/badge/Powered%20by-xterm.js-1f1f1f)](https://xtermjs.org/)
[![Protocols](https://img.shields.io/badge/Protocols-SSH%20%7C%20Telnet-8A2BE2)](#features)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](#contributing)

</div>

---

## Overview

WebTerm turns a web browser into a fully-featured terminal gateway. Spin it up on a
server, log in once, and you can open multiple SSH or Telnet sessions in browser tabs,
save connection profiles, record sessions for audit or playback, and copy text straight
out of remote `tmux`/`nvim` — all behind a single authenticated endpoint.

> Ideal for homelabs, jump-hosts, ops dashboards, or anywhere you want a terminal
> without installing one.

The backend is a single static Go binary with **~13 MB idle RSS** (an order of magnitude
smaller than typical Node.js deployments) and ships as a **~17 MB scratch-based Docker
image**. SQLite is embedded (pure Go, no CGO), bcrypt hashes and the on-disk database
schema are byte-compatible with the original Node version, and zero external services are
required.

---

## ✨ Features

- **SSH & Telnet** — Connect to remote hosts with password, key, or key + passphrase authentication.
- **Multi-session tabs** — Run many terminals side by side in a single browser window.
- **Connection Manager** — Save and organize reusable connection profiles with credentials encrypted at rest.
- **Session Recording** — Capture every session in [asciinema](https://asciinema.org/) `.cast` format for replay and audit.
- **OSC 52 Clipboard** — Copy from remote `tmux`, `nvim`, and friends directly into your browser clipboard.
- **Theming & Backgrounds** — Switch themes (e.g. *Catppuccin Mocha*), set custom backgrounds, and tune transparency with a frosted-glass UI.
- **Authentication** — Session-based login with `bcrypt`-hashed passwords, HMAC-signed cookies, and a default admin you can change.
- **WebSocket auth** — Terminal creation requires a valid session (a security improvement over the original Node version).
- **Self-contained** — SQLite-backed, zero external databases required. Optional [Nix](https://nixos.org/) shell included.
- **Tiny footprint** — Static Go binary, scratch Docker image, ~13 MB RSS at idle.

---

## 📸 Screenshots

> ℹ️ Images are collapsible — click a title to expand. _(Screenshots are being added; paths are reserved under `docs/images/`.)_

<details>
<summary><b>🖥️ Main terminal interface</b></summary>
<br>

<img src="docs/images/main-interface.png" alt="WebTerm main interface: frosted topbar, session tabs, and an xterm.js terminal viewport" width="100%">

<p><em>The primary workspace — frosted-glass topbar with status indicator, session tab bar, and a translucent terminal viewport rendering over a custom background.</em></p>

</details>

<details>
<summary><b>🔌 Connection manager</b></summary>
<br>

<img src="docs/images/connection-manager.png" alt="WebTerm connection manager: list of saved connection profiles with quick-open buttons" width="100%">

<p><em>Connection profiles with credentials encrypted at rest in SQLite. Edit, delete, or open a new session in one click.</em></p>

</details>

<details>
<summary><b>⚙️ Settings & theme switcher</b></summary>
<br>

<img src="docs/images/settings.png" alt="WebTerm settings panel: theme dropdown, opacity slider, blur strength, background picker" width="100%">

<p><em>Tune transparency, blur strength, font size, terminal background (preset/uploaded/URL), and theme from one panel — persisted server-side.</em></p>

</details>

---

## 🧱 Tech Stack

| Layer | Technology | Purpose |
|-------|------------|---------|
| Frontend | [xterm.js](https://xtermjs.org/) (Canvas renderer) + vanilla JS | Terminal rendering & UI (embedded in the Go binary via `embed.FS`) |
| Backend | Go (standard library `net/http` + Go 1.22 method-pattern routing) | HTTP API + real-time WebSocket |
| WebSocket | [`coder/websocket`](https://github.com/coder/websocket) | Maintained, low-overhead WebSocket |
| SSH | [`golang.org/x/crypto/ssh`](https://pkg.go.dev/golang.org/x/crypto/ssh) | Pure-Go SSH client (no CGO) |
| Telnet | Hand-written IAC state machine in `go-server/telnet.go` | ~150 LOC, latin1-accurate |
| Storage | [`modernc.org/sqlite`](https://pkg.go.dev/modernc.org/sqlite) | Pure-Go SQLite, no CGO, byte-compatible schema with the original Node build |
| Auth | [`golang.org/x/crypto/bcrypt`](https://pkg.go.dev/golang.org/x/crypto/bcrypt) + HMAC-SHA256-signed cookies | Password hashing & sessions |
| Recordings | asciinema `.cast` files on disk | Portable session replays |

The whole backend compiles to a single static binary with `CGO_ENABLED=0` and runs on
`scratch`, Alpine, or `gcr.io/distroless/static`.

---

## 🚀 Quick Start

### Prerequisites

- **Docker** (recommended) **or Go ≥ 1.23** for local builds.

<details>
<summary><b>Using Nix? (recommended on NixOS)</b></summary>

```bash
nix-shell   # provides go from the project's shell.nix
```

</details>

### Docker (recommended)

```bash
# 1. Configure (optional — sane defaults are built in)
cp .env.example .env
#   …then edit .env, or just set env vars inline

# 2. Build and start
docker compose up -d
```

The container reads `./data/` for persistent SQLite, background images, and `.cast`
recordings. It binds to **port 8008 by default** (override via `PORT` in `.env`).

Log in with the default credentials, then **change them immediately**:

```bash
ADMIN_USER=admin ADMIN_PASS=your-strong-password docker compose up -d
```

### Local (Go toolchain)

```bash
# 1. Configure
cp .env.example .env

# 2. Build
cd go-server
go build -o webterm .

# 3. Run from the repo root so ./data and ./.env resolve
cd ..
./go-server/webterm
```

The server starts at **`http://localhost:3000`** (override with `PORT`).

---

## ⚙️ Configuration

All settings are optional and have sensible defaults. Configure via a `.env` file or environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | Port the HTTP/WebSocket server listens on |
| `HOST` | `0.0.0.0` | Network interface to bind |
| `SESSION_SECRET` | `webterm-secret-change-in-production` | Secret used to sign session cookies — **set this in production** |
| `DB_PATH` | `./data/webterm.db` | SQLite database file location |
| `LOG_DIR` | `./data/logs` | Directory for asciinema `.cast` recordings |
| `ADMIN_USER` | `admin` | Username for the default admin (only used if the `users` table is empty) |
| `ADMIN_PASS` | `admin` | Password for the default admin — **change this in production** |
| `LOG_LEVEL` | `info` | Logger threshold: `debug` \| `info` \| `warn` \| `error` (production should be `warn`) |
| `GOMEMLIMIT` | (unset) | Soft memory cap for the Go runtime, e.g. `200MiB`. Compose sets `200MiB` by default. |

---

## 🧭 Usage

1. **Log in** at `/` with the default `admin` / `admin` (or whatever you set in `.env`).
2. **Change your password** immediately via the settings panel.
3. **Add a connection** in the connection manager: name, protocol (`ssh` or `telnet`),
   host, port, username, and either password or private key.
4. **Open a terminal tab** — credentials are sent over WebSocket and never persisted client-side.
5. **Record sessions** by default; browse past recordings in the settings panel and
   download `.cast` files to replay in [asciinema](https://asciinema.org/).

### Multiple sessions, one browser

Open as many connection profiles as you want; each gets its own tab and its own
upstream SSH/Telnet connection. Closing a tab cleanly tears down the upstream session
and updates the database.

### Themes & backgrounds

Switch between bundled themes (e.g. *Catppuccin Mocha*, default), upload a custom
background image, or paste an image URL. Tuning lives in the settings panel and
persists server-side.

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    Browser  (xterm.js, Canvas)                    │
│   Terminal viewport · Session tabs · Connection manager · Settings│
└───────────────────────────────┬───────────────────────────────────┘
                                 │  HTTP API  +  WebSocket
┌───────────────────────────────┴───────────────────────────────────┐
│                       Go HTTP Server                              │
│   Auth middleware · Session manager · Protocol handlers · Static FS│
└──────────┬────────────────────────────────────┬──────────────────┘
           │                                    │
           ▼                                    ▼
┌─────────────────────┐               ┌──────────────────────────┐
│        SSH          │               │         Telnet           │
│  (x/crypto/ssh)     │               │   (hand-written IAC)    │
└─────────────────────┘               └──────────────────────────┘
           │                                    │
           ▼                                    ▼
┌──────────────────────────────────────────────────────────────────┐
│                         Storage Layer                             │
│   SQLite (connections · users · metadata)   │   Filesystem (.cast)│
└──────────────────────────────────────────────────────────────────┘
```

The Go binary embeds `public/` (the entire frontend, served by `embed.FS`), so a single
file deploys the whole app. Backgrounds and recordings live under `./data/` which is the
volume mount point in `docker-compose.yml`.

### Project Structure

```
webTerm/
├── go-server/                   # Go backend (single package, main)
│   ├── main.go                  # entry point + server assembly + graceful shutdown
│   ├── config.go                # env loading + .env parsing
│   ├── logger.go                # slog text handler
│   ├── store.go                 # SQLite (modernc.org/sqlite, no CGO) — full schema parity with Node
│   ├── auth.go                  # session store + HMAC-signed cookies + bcrypt login/change-password
│   ├── ws.go                    # WebSocket protocol + auth-gated upgrade
│   ├── session.go               # Manager: bridges WS connections to SSH/Telnet sessions
│   ├── ssh.go                   # SSH client (x/crypto/ssh) + keepalive
│   ├── telnet.go                # Telnet client (IAC/NAWS/latin1-accurate)
│   ├── api.go                   # 9 REST endpoints (connections, sessions, settings, recordings)
│   ├── backgrounds.go           # multipart upload with MIME whitelist + path sanitation
│   ├── static.go                # embed.FS + layered cache headers + disk handler
│   └── *_test.go                # 46 tests
├── public/                      # frontend (embedded into the binary)
│   ├── index.html
│   ├── js/app.js                # main UI
│   ├── css/term.css
│   ├── themes/                  # theme definitions (JSON)
│   ├── backgrounds/             # preset backgrounds
│   └── lib/                     # xterm.js + addons (canvas, fit, web-links)
├── data/                        # runtime data — bind-mount in Docker, gitignored
│   ├── webterm.db               # SQLite (WAL mode)
│   ├── backgrounds/             # uploaded user backgrounds
│   └── logs/*.cast              # session recordings
├── docs/                        # design specs, plans, screenshots
├── Dockerfile                   # multi-stage golang:alpine → scratch
├── docker-compose.yml           # port mapping + ./data volume + GOMEMLIMIT
├── shell.nix                    # Nix shell providing Go
├── .env.example                 # template; copy to .env and customize
├── .dockerignore                # build context = go-server/ only
└── README.md                    # this file
```

---

## 📡 API Reference

All endpoints return JSON. Authenticated endpoints require a `connect.sid` cookie
from `POST /api/auth/login`. Some endpoints (notably `GET /api/settings`) are
intentionally public.

### Auth

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/api/auth/login` | — | Body: `{username, password}`. Sets `connect.sid` cookie. |
| `POST` | `/api/auth/logout` | — | Destroys the current session. |
| `POST` | `/api/auth/change-password` | ✓ | Body: `{currentPassword, newPassword}` (≥6 chars). |

### Connections

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/connections` | ✓ | List all saved connection profiles. |
| `POST` | `/api/connections` | ✓ | Create a new profile. |
| `PUT` | `/api/connections/{id}` | ✓ | Update an existing profile. |
| `DELETE` | `/api/connections/{id}` | ✓ | Delete a profile. |

### Sessions & recordings

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/sessions` | ✓ | List historical sessions. |
| `GET` | `/api/recordings` | ✓ | List `.cast` files in the log directory. |
| `GET` | `/api/recordings/{id}/download` | ✓ | Download a `.cast` file. Path traversal rejected (400). |

### Settings

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/settings` | — | Get current UI settings (or `{}`). |
| `PUT` | `/api/settings` | ✓ | Persist UI settings. |

### Backgrounds

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/backgrounds` | ✓ | List uploaded backgrounds. |
| `POST` | `/api/backgrounds/upload` | ✓ | Multipart upload (`image` field). JPEG/PNG/GIF/WebP only, ≤ 5 MB. |
| `DELETE` | `/api/backgrounds/{id}` | ✓ | Delete a background. |

### WebSocket

Connect to `ws://<host>:<port>/` (upgrade from HTTP on `/`). **Authentication is
required** — `connect.sid` must be present and valid, otherwise the upgrade is rejected
with `401 Authentication required`.

Message protocol (all messages are JSON text frames):

| Client → server | Fields | Purpose |
|-----------------|--------|---------|
| `create` | `protocol`, `host`, `port`, `username`, `password`, `cols`, `rows` | Open a new SSH/Telnet session. |
| `input` | `sessionId`, `data` | Forward keystrokes to the upstream session. |
| `resize` | `sessionId`, `cols`, `rows` | Notify the upstream session of a viewport change. |
| `close` | `sessionId` | Close the upstream session and tear down. |

| Server → client | Fields | Purpose |
|-----------------|--------|---------|
| `created` | `sessionId`, `protocol` | Acknowledges a successful `create`. |
| `output` | `sessionId`, `data` | Upstream session output. |
| `exit` | `sessionId` | Upstream session ended. |
| `error` | `message` (and optionally `sessionId`) | Error reply to a `create` or an upstream error. |

---

## 🔒 Security

- **bcrypt** cost 10 for password hashing (same as the original Node build — hashes are
  portable between the two implementations).
- **HMAC-SHA256**-signed session cookies (`connect.sid`), verified with constant-time
  compare; tamper-resistant.
- **HttpOnly + SameSite=Lax** cookies; `Secure` flag auto-applied when behind TLS or
  a trusted reverse proxy (`X-Forwarded-Proto: https`).
- **WebSocket auth gate** — terminals can no longer be opened by unauthenticated clients
  (an improvement over the original Node version, which had no WS-side auth).
- **Path-traversal rejection** for recording downloads (`/`/`\`/`..` all rejected with
  400).
- **Filename sanitation** for background uploads: `/`, `\`, and `[^a-zA-Z0-9._-]` all
  mapped to `_`, prefixed with a millisecond timestamp.
- **Insecure host-key verification** for SSH — matches the original `ssh2` default;
  flip this in `go-server/ssh.go` for production deployments.
- **Default admin** (`admin`/`admin`) is created only when the `users` table is empty;
  **change the password immediately** after first login.

**Before deploying**: set `SESSION_SECRET` to a strong random value, set
`ADMIN_PASS` to a strong password, and put WebTerm behind TLS (the `Secure` cookie flag
is set automatically when TLS is terminated upstream).

---

## 🛣️ Roadmap

- [ ] Strict host-key verification for SSH (configurable `known_hosts`).
- [ ] Passphrase-encrypted SSH keys at rest (currently stored as plaintext like the
      original).
- [ ] Cluster mode (Redis-backed sessions) for multi-instance deployments.
- [ ] Terminal multiplexing (split panes).
- [ ] Optional TURN/relay for browser-side clipboard over OSC 52.

---

## 🤝 Contributing

PRs welcome. The codebase is small enough to grok in an afternoon — ~2,000 LOC of Go
plus a vanilla-JS frontend with no build step.

```bash
git clone <your-fork>
cd webTerm
nix-shell           # or install Go ≥ 1.23 manually
cd go-server
go test ./...
```

Before opening a PR, please run the full test suite and the linter (`go vet ./...`).

---

## 📄 License

Released under the **MIT License**. See [LICENSE](LICENSE) for details.