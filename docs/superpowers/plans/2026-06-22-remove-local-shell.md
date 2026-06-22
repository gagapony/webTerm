# Remove Local Shell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove all local shell logic, UI, data, and dependencies from webTerm, leaving only SSH and Telnet.

**Architecture:** Surgical removal across 9 source files + 1 file deletion + 1 dependency removal + DB migration. The app transitions from auto-connecting a local shell on startup to a "Ready" idle state where the user manually opens SSH/Telnet sessions.

**Tech Stack:** TypeScript (Express + ws backend), vanilla JS frontend, better-sqlite3, xterm.js. No test framework — verification is `tsc` build + grep checks.

---

### Task 1: Narrow the Protocol type

**Files:**
- Modify: `src/models/connection.ts:1`

- [ ] **Step 1: Remove `'local'` from the Protocol type**

In `src/models/connection.ts`, change line 1 from:

```typescript
export type Protocol = 'ssh' | 'telnet' | 'local';
```

to:

```typescript
export type Protocol = 'ssh' | 'telnet';
```

- [ ] **Step 2: Verify the build still compiles (it will fail elsewhere — that's expected)**

Run: `npx tsc --noEmit 2>&1 | head -30`

Expected: Type errors in `session-manager.ts` and `ws.ts` referencing `'local'`. This is correct — those are fixed in later tasks. The `connection.ts` file itself should not error.

- [ ] **Step 3: Commit**

```bash
git add src/models/connection.ts
git commit -m "refactor: narrow Protocol type to ssh | telnet"
```

---

### Task 2: Remove local from session-manager.ts

**Files:**
- Modify: `src/services/session-manager.ts` (lines 5, 11, 12, 23, 30, 46-53, 108-111)

- [ ] **Step 1: Remove the LocalSession import**

In `src/services/session-manager.ts`, delete line 5:

```typescript
import { LocalSession, LocalOptions } from '../protocols/local';
```

- [ ] **Step 2: Narrow the protocol type in the ActiveSession interface**

Change lines 11-12 from:

```typescript
  protocol: 'ssh' | 'telnet' | 'local';
  session: SSHSession | TelnetSession | LocalSession;
```

to:

```typescript
  protocol: 'ssh' | 'telnet';
  session: SSHSession | TelnetSession;
```

- [ ] **Step 3: Narrow the createSession signature**

Change lines 23 and 30 from:

```typescript
  async createSession(
    ws: WebSocket,
    protocol: 'ssh' | 'telnet' | 'local',
    options: any
  ): Promise<{ sessionId: string; shell?: string }> {
```

to:

```typescript
  async createSession(
    ws: WebSocket,
    protocol: 'ssh' | 'telnet',
    options: any
  ): Promise<{ sessionId: string }> {
```

And change line 30 from:

```typescript
    let session: SSHSession | TelnetSession | LocalSession;
```

to:

```typescript
    let session: SSHSession | TelnetSession;
```

- [ ] **Step 4: Remove the `case 'local'` block**

Delete lines 46-53 (the entire local case branch):

```typescript
        case 'local':
          session = new LocalSession();
          (session as LocalSession).spawn({
            ...options as LocalOptions,
            cols,
            rows,
          });
          break;
```

- [ ] **Step 5: Remove the shell return logic**

Change lines 108-112 from:

```typescript
      const result: { sessionId: string; shell?: string } = { sessionId };
      if (protocol === 'local') {
        result.shell = (session as LocalSession).getShell();
      }
      return result;
```

to:

```typescript
      return { sessionId };
```

- [ ] **Step 6: Verify the build compiles for this file**

Run: `npx tsc --noEmit 2>&1 | grep session-manager`

Expected: No errors for `session-manager.ts`. Remaining errors should only be in `ws.ts`.

- [ ] **Step 7: Commit**

```bash
git add src/services/session-manager.ts
git commit -m "refactor: remove local shell from session manager"
```

---

### Task 3: Remove local from ws.ts

**Files:**
- Modify: `src/routes/ws.ts` (lines 12, 17, 67, 77-79)

- [ ] **Step 1: Narrow the WSMessage protocol type and remove shell field**

In `src/routes/ws.ts`, change line 12 from:

```typescript
  protocol?: 'ssh' | 'telnet' | 'local';
```

to:

```typescript
  protocol?: 'ssh' | 'telnet';
```

Delete line 17:

```typescript
  shell?: string;
```

- [ ] **Step 2: Remove shell from the options passed to createSession**

Change lines 62-70 from:

```typescript
        const result = await sessionManager.createSession(ws, message.protocol, {
          host: message.host,
          port: message.port,
          username: message.username,
          password: message.password,
          shell: message.shell,
          cols: message.cols || 80,
          rows: message.rows || 24,
        });
```

to:

```typescript
        const result = await sessionManager.createSession(ws, message.protocol, {
          host: message.host,
          port: message.port,
          username: message.username,
          password: message.password,
          cols: message.cols || 80,
          rows: message.rows || 24,
        });
```

- [ ] **Step 3: Remove the shell response logic**

Change lines 72-80 from:

```typescript
        const response: any = {
          type: 'created',
          sessionId: result.sessionId,
          protocol: message.protocol,
        };
        if (result.shell) {
          response.shell = result.shell;
        }
        ws.send(JSON.stringify(response));
```

to:

```typescript
        ws.send(JSON.stringify({
          type: 'created',
          sessionId: result.sessionId,
          protocol: message.protocol,
        }));
```

- [ ] **Step 4: Verify the full backend build compiles**

Run: `npx tsc --noEmit`

Expected: PASS — no type errors anywhere in the backend (except potentially the still-present `local.ts` file if it imports nothing external; since it exports to nothing now, it may still compile. That's fine — we delete it next.)

- [ ] **Step 5: Commit**

```bash
git add src/routes/ws.ts
git commit -m "refactor: remove local shell from websocket handler"
```

---

### Task 4: Delete local.ts protocol file

**Files:**
- Delete: `src/protocols/local.ts`

- [ ] **Step 1: Delete the file**

Run:

```bash
rm src/protocols/local.ts
```

- [ ] **Step 2: Verify nothing imports it**

Run: `grep -r "protocols/local" src/ --include="*.ts"`

Expected: No output (no remaining imports).

- [ ] **Step 3: Verify build**

Run: `npx tsc --noEmit`

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "refactor: delete local shell protocol implementation"
```

---

### Task 5: Database migration — remove CHECK constraint and delete local rows

**Files:**
- Modify: `src/services/connection-store.ts` (lines 23-61)

- [ ] **Step 1: Remove `'local'` from the CHECK constraint in table creation**

In `src/services/connection-store.ts`, change line 35 from:

```sql
        protocol TEXT NOT NULL CHECK(protocol IN ('ssh', 'telnet', 'local')),
```

to:

```sql
        protocol TEXT NOT NULL,
```

(Removing the CHECK entirely, per spec — TypeScript types enforce valid protocols at the application layer.)

- [ ] **Step 2: Add a migration method to handle existing databases**

Add this method to the `ConnectionStore` class, after the `initialize()` method (after line 62):

```typescript
  private migrateRemoveLocalConnections(): void {
    // Delete any existing local protocol connections
    this.db.prepare('DELETE FROM connections WHERE protocol = ?').run('local');

    // If the old CHECK constraint exists, rebuild the table without it.
    // SQLite cannot ALTER a CHECK constraint, so we recreate the table.
    const tableInfo = this.db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='connections'").get() as { sql: string } | undefined;

    if (tableInfo && tableInfo.sql.includes("CHECK(protocol IN")) {
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS connections_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          protocol TEXT NOT NULL,
          host TEXT,
          port INTEGER,
          username TEXT,
          password_encrypted TEXT,
          ssh_key_path TEXT,
          ssh_key_passphrase TEXT,
          options TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        INSERT INTO connections_new SELECT * FROM connections;
        DROP TABLE connections;
        ALTER TABLE connections_new RENAME TO connections;
      `);
    }
  }
```

- [ ] **Step 3: Call the migration in the constructor**

In the `constructor()` method, change line 20 from:

```typescript
    this.initialize();
```

to:

```typescript
    this.initialize();
    this.migrateRemoveLocalConnections();
```

- [ ] **Step 4: Verify build**

Run: `npx tsc --noEmit`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/connection-store.ts
git commit -m "refactor: remove local from DB constraint, add migration"
```

---

### Task 6: Remove node-pty dependency

**Files:**
- Modify: `package.json` (line 23)

- [ ] **Step 1: Confirm node-pty is only used by local.ts**

Run: `grep -r "node-pty" src/ --include="*.ts"`

Expected: No output (local.ts is already deleted, and no other file imports node-pty).

- [ ] **Step 2: Remove node-pty from package.json**

In `package.json`, delete line 23:

```json
    "node-pty": "^1.1.0",
```

Also update the description on line 4 from:

```json
  "description": "Web-based terminal service with SSH, Telnet, and local shell support",
```

to:

```json
  "description": "Web-based terminal service with SSH and Telnet support",
```

- [ ] **Step 3: Reinstall dependencies to update lockfile**

Run: `npm install`

Expected: Completes without error. `node-pty` is removed from `node_modules`.

- [ ] **Step 4: Verify build**

Run: `npx tsc --noEmit`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: remove node-pty dependency"
```

---

### Task 7: Frontend — remove auto-connect and local element references

**Files:**
- Modify: `public/js/app.js` (lines 175, 180, 374-375, 400-409)

- [ ] **Step 1: Remove the autoConnectLocal call from ws.onopen**

In `public/js/app.js`, change lines 371-376 from:

```javascript
    this.ws.onopen = () => {
      console.log('WebSocket connected');
      this.updateStatus('connected', { state: 'Connected', protocol: 'WebSocket', target: 'Ready' });
      // Auto-connect local shell
      this.autoConnectLocal();
    };
```

to:

```javascript
    this.ws.onopen = () => {
      console.log('WebSocket connected');
      this.updateStatus('connected', { state: 'Connected', protocol: 'WebSocket', target: 'Ready' });
    };
```

- [ ] **Step 2: Delete the autoConnectLocal method entirely**

Delete lines 400-409:

```javascript
  autoConnectLocal() {
    const { cols, rows } = this._measureViewport();
    this._pendingDims = { cols, rows };
    this.ws.send(JSON.stringify({
      type: 'create',
      protocol: 'local',
      cols,
      rows,
    }));
  }
```

- [ ] **Step 3: Remove localFields and sessionShell element references from cacheDom**

Delete line 175:

```javascript
    this.localFields = document.getElementById('localFields');
```

Delete line 180:

```javascript
    this.sessionShell = document.getElementById('sessionShell');
```

- [ ] **Step 4: Commit**

```bash
git add public/js/app.js
git commit -m "refactor: remove local shell auto-connect and element refs"
```

---

### Task 8: Frontend — remove local logic from protocol/session methods

**Files:**
- Modify: `public/js/app.js` (lines 498-512, 514-543, 545-565, 767, 773)

- [ ] **Step 1: Simplify selectProtocol — remove local branch**

Change lines 498-512 from:

```javascript
  selectProtocol(protocol) {
    this.selectedProtocol = protocol;
    this.protocolBtns.forEach(btn => {
      btn.classList.toggle('is-active', btn.dataset.protocol === protocol);
    });

    if (protocol === 'local') {
      this.remoteFields.style.display = 'none';
      this.localFields.style.display = 'block';
    } else {
      this.remoteFields.style.display = 'block';
      this.localFields.style.display = 'none';
      this.sessionPort.placeholder = protocol === 'ssh' ? '22' : '23';
    }
  }
```

to:

```javascript
  selectProtocol(protocol) {
    this.selectedProtocol = protocol;
    this.protocolBtns.forEach(btn => {
      btn.classList.toggle('is-active', btn.dataset.protocol === protocol);
    });

    this.remoteFields.style.display = 'block';
    this.sessionPort.placeholder = protocol === 'ssh' ? '22' : '23';
  }
```

- [ ] **Step 2: Simplify createSessionFromModal — remove local branch**

Change lines 514-543 from:

```javascript
  createSessionFromModal() {
    const { cols, rows } = this._measureViewport();
    this._pendingDims = { cols, rows };

    const options = {
      type: 'create',
      protocol: this.selectedProtocol,
      cols,
      rows,
    };

    if (this.selectedProtocol === 'local') {
      if (this.sessionShell.value.trim()) {
        options.shell = this.sessionShell.value.trim();
      }
    } else {
      options.host = this.sessionHost.value;
      options.port = parseInt(this.sessionPort.value) || (this.selectedProtocol === 'ssh' ? 22 : 23);
      options.username = this.sessionUsername.value;
      options.password = this.sessionPassword.value;
    }

    if (this.selectedProtocol !== 'local' && !options.host) {
      alert('Host is required');
      return;
    }

    this.ws.send(JSON.stringify(options));
    this.hideNewSessionModal();
  }
```

to:

```javascript
  createSessionFromModal() {
    const { cols, rows } = this._measureViewport();
    this._pendingDims = { cols, rows };

    const options = {
      type: 'create',
      protocol: this.selectedProtocol,
      cols,
      rows,
      host: this.sessionHost.value,
      port: parseInt(this.sessionPort.value) || (this.selectedProtocol === 'ssh' ? 22 : 23),
      username: this.sessionUsername.value,
      password: this.sessionPassword.value,
    };

    if (!options.host) {
      alert('Host is required');
      return;
    }

    this.ws.send(JSON.stringify(options));
    this.hideNewSessionModal();
  }
```

- [ ] **Step 3: Simplify onSessionCreated — remove local branch and shell param**

Change the method signature and body (lines 545-565) from:

```javascript
  onSessionCreated(sessionId, protocol, shell) {
    this.createTerminal(sessionId, protocol);

    const host = this.sessionHost.value || 'local';
    this.connectionStartTime = new Date();
    let target;
    if (protocol === 'local') {
      target = shell || 'Local Shell';
    } else {
      target = `${host}:${this.sessionPort.value || 22}`;
    }
    const protocolLabel = protocol === 'local' ? 'Local' : protocol === 'ssh' ? 'SSH' : 'Telnet';
    this.updateStatus('connected', { state: 'Connected', protocol: protocolLabel, target: target, time: this.formatTime(this.connectionStartTime) });

    // Clear form
    if (this.connectionName) this.connectionName.value = '';
    this.sessionHost.value = '';
    this.sessionPort.value = '';
    this.sessionUsername.value = '';
    this.sessionPassword.value = '';
  }
```

to:

```javascript
  onSessionCreated(sessionId, protocol) {
    this.createTerminal(sessionId, protocol);

    const host = this.sessionHost.value;
    this.connectionStartTime = new Date();
    const target = `${host}:${this.sessionPort.value || 22}`;
    const protocolLabel = protocol === 'ssh' ? 'SSH' : 'Telnet';
    this.updateStatus('connected', { state: 'Connected', protocol: protocolLabel, target: target, time: this.formatTime(this.connectionStartTime) });

    // Clear form
    if (this.connectionName) this.connectionName.value = '';
    this.sessionHost.value = '';
    this.sessionPort.value = '';
    this.sessionUsername.value = '';
    this.sessionPassword.value = '';
  }
```

Also update the call site in `handleWSMessage` (line 432) from:

```javascript
        this.onSessionCreated(message.sessionId, message.protocol, message.shell);
```

to:

```javascript
        this.onSessionCreated(message.sessionId, message.protocol);
```

- [ ] **Step 4: Remove local from renderSavedConnections**

Change line 767 from:

```javascript
      const icon = conn.protocol === 'ssh' ? '🔒' : conn.protocol === 'telnet' ? '📡' : '💻';
```

to:

```javascript
      const icon = conn.protocol === 'ssh' ? '🔒' : '📡';
```

Change line 773 from:

```javascript
            <div class="saved-connection-meta">${conn.protocol.toUpperCase()} • ${conn.host || 'local'}${conn.port ? ':' + conn.port : ''}</div>
```

to:

```javascript
            <div class="saved-connection-meta">${conn.protocol.toUpperCase()} • ${conn.host || '-'}${conn.port ? ':' + conn.port : ''}</div>
```

- [ ] **Step 5: Verify no remaining local references in app.js**

Run: `grep -in "local" public/js/app.js`

Expected: No output (or only matches in unrelated contexts like `localStorage`). Carefully verify each match is non-local-shell related.

- [ ] **Step 6: Commit**

```bash
git add public/js/app.js
git commit -m "refactor: remove local shell logic from frontend JS"
```

---

### Task 9: HTML cleanup — remove Local UI elements

**Files:**
- Modify: `public/index.html` (lines 185, 207, 228-233)

- [ ] **Step 1: Update the subtitle**

In `public/index.html`, change line 185 from:

```html
          <p class="settings-subtitle">Create a new SSH, Telnet, or local shell connection.</p>
```

to:

```html
          <p class="settings-subtitle">Create a new SSH or Telnet connection.</p>
```

- [ ] **Step 2: Remove the Local protocol button**

Delete line 207:

```html
              <button class="workspace-chip" data-protocol="local">Local</button>
```

- [ ] **Step 3: Remove the localFields div**

Delete lines 228-233:

```html
          <div id="localFields" style="display: none;">
            <div class="compact-field">
              <label class="toolbar-label">SHELL</label>
              <input type="text" class="toolbar-input" id="sessionShell" placeholder="Auto-detect" autocomplete="off">
            </div>
          </div>
```

- [ ] **Step 4: Verify no remaining local shell references in HTML**

Run: `grep -in 'data-protocol="local"\|localFields\|sessionShell\|local shell' public/index.html`

Expected: No output.

- [ ] **Step 5: Commit**

```bash
git add public/index.html
git commit -m "refactor: remove local shell UI from HTML"
```

---

### Task 10: Update README

**Files:**
- Modify: `README.md` (lines 3, 9, 80)

- [ ] **Step 1: Update the description and features**

In `README.md`, change line 3 from:

```markdown
Web-based terminal service with SSH, Telnet, and local shell support.
```

to:

```markdown
Web-based terminal service with SSH and Telnet support.
```

Delete line 9:

```markdown
- **Local Shell**: Start a local bash/zsh session
```

Change line 80 from:

```markdown
│   ├── protocols/          # SSH, Telnet, Local implementations
```

to:

```markdown
│   ├── protocols/          # SSH, Telnet implementations
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: update README to reflect SSH and Telnet only"
```

---

### Task 11: Final verification

- [ ] **Step 1: Full TypeScript build**

Run: `npx tsc --noEmit`

Expected: PASS with zero errors.

- [ ] **Step 2: Grep for any remaining local shell references in source**

Run:

```bash
grep -rin "local" src/ public/js/ public/index.html --include="*.ts" --include="*.js" --include="*.html" | grep -vi "localhost\|locale\|localstorage" | grep -i "protocol\|shell\|pty\|localFields\|sessionShell\|autoConnect"
```

Expected: No output.

- [ ] **Step 3: Verify node-pty is gone**

Run: `grep "node-pty" package.json package-lock.json`

Expected: No output.

- [ ] **Step 4: Start the dev server and smoke test**

Run: `npm run dev`

Expected: Server starts without errors. Open the app in a browser, verify:
- The app loads to a "Ready" state with no automatic terminal session
- The New Session modal shows only SSH and Telnet buttons (no Local)
- No SHELL field appears
- Creating an SSH or Telnet session works normally
- Saved connections list shows SSH/Telnet icons only

- [ ] **Step 5: Final commit (if any fixes were needed)**

If the smoke test revealed issues, fix and commit them. Otherwise no commit needed.
