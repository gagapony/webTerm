# Remove Local Shell

**Date:** 2026-06-22
**Status:** Approved

## Goal

Remove all local shell logic, UI, and data from webTerm. Only SSH and Telnet remain.

## Background

webTerm currently supports three connection protocols: SSH, Telnet, and Local shell. Local shell spawns a PTY on the server via node-pty and auto-connects the moment the WebSocket opens. The user wants local shell eliminated entirely — no code, no UI, no default auto-connect, no saved local connections.

## Startup Behavior

On WebSocket open, the app no longer auto-connects anything. It enters a "Ready" state: empty terminal viewport, status bar reads "Ready", and the user opens the connect dialog manually via the toolbar to start an SSH or Telnet session.

## Changes

### Backend

| File | Change |
|------|--------|
| `src/protocols/local.ts` | **DELETE** the entire file |
| `src/models/connection.ts` | `Protocol` type narrows to `'ssh' \| 'telnet'` |
| `src/services/session-manager.ts` | Remove `LocalSession`/`LocalOptions` import; remove `case 'local'` branch; remove `shell` return logic; narrow all protocol unions and the `createSession` signature |
| `src/routes/ws.ts` | Remove `'local'` from the protocol type; remove `shell` field from create message |
| `src/services/connection-store.ts` | Remove `'local'` from DB CHECK constraint |
| `package.json` | Remove `node-pty` dependency (only used by local shell); remove from `@types` if present |

### Frontend

| File | Change |
|------|-------|
| `public/js/app.js` | Remove `autoConnectLocal()` method and its call in `ws.onopen`; remove `localFields` element reference; remove all `protocol === 'local'` / `selectedProtocol === 'local'` branches in protocol selection, session creation, and session-created handler; remove `'local'` fallback string in saved-connection meta |
| `public/index.html` | Remove `<button class="workspace-chip" data-protocol="local">` chip; remove `#localFields` div; update subtitle from "SSH, Telnet, or local shell" to "SSH or Telnet" |

### Database Migration

The `connections` table currently has:

```sql
protocol TEXT NOT NULL CHECK(protocol IN ('ssh', 'telnet', 'local'))
```

SQLite cannot alter a CHECK constraint in place. The migration will:

1. Delete rows where `protocol = 'local'`
2. Remove the CHECK constraint going forward (rebuild table without it)

Removing the CHECK entirely is preferred over re-adding a narrower one because:
- Avoids future table rebuilds when protocols change
- TypeScript types already enforce valid protocols at the application layer

### Documentation

- Update `README.md` to reflect SSH + Telnet only
- Historical specs in `docs/superpowers/specs/*` are left as-is (point-in-time records)

## Out of Scope

- Redesigning the connect dialog
- Changes to SSH or Telnet logic
- UI polish beyond removing local shell elements

## Success Criteria

- No references to local shell remain in source code (excluding historical spec docs)
- App starts in "Ready" state with no automatic session
- SSH and Telnet connections work as before
- `node-pty` is no longer a dependency
- Existing local connections in the DB are deleted
- Build passes with no type errors
