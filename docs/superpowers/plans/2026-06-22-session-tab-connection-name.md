# Session Tab Connection Name Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Session tabs display the connection name (with `user@host` fallback) instead of the protocol type.

**Architecture:** Single-file change in `public/js/app.js`. Thread a `label` field through `createTerminal` and the `terminals` Map. Populate it in `onSessionCreated` by reading form values **before** the form is cleared. Render it HTML-escaped in `updateSessionTabs`. Saved-connection clicks populate the name field so the same flow handles them.

**Tech Stack:** Vanilla JS frontend (served statically, no build step), no test framework. Verification is manual via browser against observable behaviors.

---

## File Structure

All work is in one file:

- **Modify:** `public/js/app.js`
  - `createTerminal(sessionId, protocol)` → add `label` parameter
  - `onSessionCreated(sessionId, protocol)` → capture form state before clearing, compute label, pass through
  - `updateSessionTabs()` → render `session.label` (escaped) instead of `session.protocol.toUpperCase()`
  - `connectSaved(connectionId)` → populate `connectionName.value` from saved record

No backend, HTML, CSS, or database changes.

---

### Task 1: Add `label` plumbing through `createTerminal` and the terminals Map

This task introduces the `label` field end-to-end but defaults it to `protocol.toUpperCase()`, so behavior is **unchanged** until Task 2 populates it with real values. This keeps the refactor observable-behavior-neutral and gives Task 2 a clean "wire up the source" focus.

**Files:**
- Modify: `public/js/app.js:534` (`createTerminal` signature and Map entry)
- Modify: `public/js/app.js:652` (tab title rendering in `updateSessionTabs`)

- [ ] **Step 1: Change `createTerminal` signature to accept `label`**

In `public/js/app.js`, the `createTerminal` method starts at line 534. Change the first line from:

```js
createTerminal(sessionId, protocol) {
```

to:

```js
createTerminal(sessionId, protocol, label) {
```

- [ ] **Step 2: Default `label` to `protocol.toUpperCase()` when not provided**

Immediately after the new function-opening line (before `const terminalTheme = this._resolveTheme();` at line 535), insert:

```js
  if (!label) {
    label = protocol.toUpperCase();
  }
```

This preserves the current behavior for all existing callers that don't pass a third argument.

- [ ] **Step 3: Store `label` in the terminals Map entry**

Around lines 589-594, the Map entry is currently:

```js
this.terminals.set(sessionId, {
  terminal,
  fitAddon,
  protocol,
  container,
});
```

Change to:

```js
this.terminals.set(sessionId, {
  terminal,
  fitAddon,
  protocol,
  label,
  container,
});
```

- [ ] **Step 4: Render `session.label` (HTML-escaped) in `updateSessionTabs`**

In `updateSessionTabs` around line 652, change:

```js
<span class="session-tab-title">${session.protocol.toUpperCase()}</span>
```

to:

```js
<span class="session-tab-title">${this.escapeHtml(session.label)}</span>
```

The existing `escapeHtml` method at `app.js:829` is reused. Switching from `innerHTML`-interpolated protocol (which was safely constrained) to user-provided text requires escaping to prevent XSS.

- [ ] **Step 5: Verify no behavior changed**

Start the dev server:

```bash
PORT=8009 npm run dev
```

Open `http://localhost:8009` in a browser, log in (`admin` / `admin` by default), connect to any SSH or Telnet host **without** entering a connection name.

Expected: the new session tab still reads `SSH` or `TELNET` (the default fallback from Step 2). No console errors. This confirms the plumbing is wired correctly without yet changing observable behavior.

- [ ] **Step 6: Commit**

```bash
git add public/js/app.js
git commit -m "$(cat <<'EOF'
refactor: thread label field through createTerminal and session tabs

Plumbing only — label defaults to protocol.toUpperCase() so behavior
is unchanged. Subsequent commits populate it from the connection form.

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Populate `label` from `onSessionCreated` form state

This task makes the feature visible: tabs now show the connection name when provided, falling back to `user@host` → `host` → protocol uppercase.

**Files:**
- Modify: `public/js/app.js:517` (`onSessionCreated`)

- [ ] **Step 1: Capture form values and compute `label` before clearing the form**

In `public/js/app.js`, the `onSessionCreated` method starts at line 517. It currently looks like this:

```js
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

Replace the entire method body with:

```js
onSessionCreated(sessionId, protocol) {
  // Capture form values BEFORE clearing the form.
  const name = (this.connectionName?.value || '').trim();
  const host = this.sessionHost.value.trim();
  const username = this.sessionUsername.value.trim();

  // Label resolution priority: name → user@host → host → protocol
  const label =
    name ||
    (username && host ? `${username}@${host}` : '') ||
    host ||
    protocol.toUpperCase();

  this.createTerminal(sessionId, protocol, label);

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

Two important changes from the original:

1. `host` is now read **before** `createTerminal` is called (it was previously read between `createTerminal` and the status update — same value either way, since the form isn't cleared until the end, but the new ordering makes the data flow obvious).
2. `name`, `host`, `username` are captured up front and used to compute `label`, which is passed to `createTerminal`.

- [ ] **Step 2: Manual verification — connection name is shown**

With the dev server running, do a hard refresh in the browser (`Ctrl+Shift+R`) to bypass cache (the prior commit in this branch added `Cache-Control: no-cache` to static assets, but a hard refresh guarantees a clean state).

Open the New Session modal. Fill in:
- Connection Name: `My Test Server`
- Protocol: SSH
- Host: (any reachable host or `localhost`)
- Port: 22
- Username: `admin`
- Password: (anything)

Click Connect.

Expected: the new session tab shows `My Test Server` as its title, not `SSH`.

- [ ] **Step 3: Manual verification — `user@host` fallback when no name**

Click "New Session" again. Fill in:
- Connection Name: **leave empty**
- Protocol: SSH
- Host: `192.168.1.100` (the actual value matters for this test)
- Username: `admin`

Click Connect.

Expected: the new tab title reads `admin@192.168.1.100`.

- [ ] **Step 4: Manual verification — `host` fallback when no name and no username**

Click "New Session" again. Fill in:
- Connection Name: **leave empty**
- Username: **leave empty**
- Host: `10.0.0.5`

Click Connect.

Expected: the new tab title reads `10.0.0.5`.

- [ ] **Step 5: Manual verification — HTML is escaped**

Click "New Session". In Connection Name, type:

```
<script>alert(1)</script>
```

Click Connect (host can be anything).

Expected:
- No `alert(1)` dialog appears.
- The tab title visibly shows the literal text `<script>alert(1)</script>` as a heading.
- Browser DevTools → Elements shows the text is rendered as a text node inside the `<span>`, not parsed as an element.

- [ ] **Step 6: Commit**

```bash
git add public/js/app.js
git commit -m "$(cat <<'EOF'
feat: show connection name (or user@host fallback) on session tabs

Tabs now prefer the user-entered connection name, falling back to
user@host, then host, then protocol uppercase. Form values are read
before onSessionCreated clears the form. Label is HTML-escaped to
prevent XSS from user-provided text.

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Carry saved-connection name through `connectSaved`

Saved connections have names stored in the database. Without this task, clicking a saved connection fills host/port/username/password but not the name field — so the resulting tab would fall back to `user@host` instead of the saved name.

**Files:**
- Modify: `public/js/app.js:779` (inside `connectSaved`)

- [ ] **Step 1: Populate `connectionName.value` from the saved record**

In `public/js/app.js`, the `connectSaved` method starts at line 769. Around lines 778-783 it currently sets form fields:

```js
// Set form and connect
this.selectProtocol(conn.protocol);
this.sessionHost.value = conn.host || '';
this.sessionPort.value = conn.port || '';
this.sessionUsername.value = conn.username || '';
this.sessionPassword.value = conn.password_encrypted || '';
```

Change to:

```js
// Set form and connect
this.selectProtocol(conn.protocol);
if (this.connectionName) this.connectionName.value = conn.name || '';
this.sessionHost.value = conn.host || '';
this.sessionPort.value = conn.port || '';
this.sessionUsername.value = conn.username || '';
this.sessionPassword.value = conn.password_encrypted || '';
```

The `conn.name` field exists on the `Connection` type (`src/models/connection.ts:5` — `name: string`) and is already rendered elsewhere (`app.js:739`). The null-guard on `this.connectionName` mirrors the existing pattern at `app.js:527`.

- [ ] **Step 2: Manual verification — saved connection shows its name**

With the dev server running, ensure you have at least one saved connection (the Save Connection button in the modal creates one). If you don't have one:

1. Click "New Session".
2. Fill in Connection Name: `Prod Box`, Host: `prod.example.com`, Username: `deploy`.
3. Click "Save Connection" (do NOT click Connect).
4. Close the modal.

Now:

1. Click the "Saved" dropdown button.
2. Click the `Prod Box` entry.

Expected:
- The New Session modal does **not** open (this is current behavior — `connectSaved` calls `createSessionFromModal` directly).
- The new session tab title reads `Prod Box` (not `deploy@prod.example.com`).

- [ ] **Step 3: Manual verification — saved connection with empty name still falls back**

In the database, a saved connection always has a name (`name: string` is non-nullable per the model), so this case is essentially unreachable in normal use. If you want to be thorough, manually edit a row in `data/webterm.db` to set `name = ''` and click that saved connection.

Expected: the tab falls back to `user@host` per Task 2's resolution rules.

If you skip this edge case, that's acceptable — the model guarantees non-empty names.

- [ ] **Step 4: Commit**

```bash
git add public/js/app.js
git commit -m "$(cat <<'EOF'
feat: populate connection name field when clicking a saved connection

connectSaved now sets connectionName.value = conn.name so the tab
title uses the saved name rather than falling back to user@host.

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Final end-to-end verification

No code changes — this task confirms all spec success criteria are met.

**Files:** none

- [ ] **Step 1: Verify all spec success criteria**

Hard-refresh the browser (`Ctrl+Shift+R`). For each scenario, open a new session and check the tab title:

| Scenario | Inputs | Expected Tab Title |
|---|---|---|
| Name provided | Name: `My Server`, User: `admin`, Host: `1.2.3.4` | `My Server` |
| No name, user + host | Name: empty, User: `admin`, Host: `192.168.1.1` | `admin@192.168.1.1` |
| No name, no user | Name: empty, User: empty, Host: `10.0.0.5` | `10.0.0.5` |
| HTML in name | Name: `<b>bold</b>`, User: `x`, Host: `y` | literal `<b>bold</b>` (not bolded) |
| Saved connection | Click a saved entry named `Prod Box` | `Prod Box` |

- [ ] **Step 2: Verify no regression in existing behavior**

Confirm these unrelated features still work:

- Status dropdown still shows `host:port` in its `target` field (unchanged by this plan).
- Closing a tab still removes the session and updates the tab bar.
- Switching between tabs still brings the correct terminal to the front.
- Resize, input, and session exit still work.

- [ ] **Step 3: No commit (verification only)**

If all checks pass, the implementation is complete. If anything fails, identify which task introduced the regression and fix it before committing.

---

## Self-Review

### Spec coverage

| Spec requirement | Covered by |
|---|---|
| Label resolution: name → user@host → host → protocol | Task 2 Step 1 (the inline resolution logic) |
| `createTerminal` accepts and stores `label` | Task 1 Steps 1-3 |
| `updateSessionTabs` renders `session.label` escaped | Task 1 Step 4 |
| `onSessionCreated` reads form before clearing, computes label | Task 2 Step 1 |
| `connectSaved` populates `connectionName.value` | Task 3 Step 1 |
| HTML escaping to prevent XSS | Task 1 Step 4 (uses `this.escapeHtml`), verified in Task 2 Step 5 |
| All four spec success criteria | Task 4 Step 1 table |

All spec sections have a corresponding task. No gaps.

### Placeholder scan

No "TBD", "TODO", "implement later", or vague "add error handling" anywhere. Every code step contains the literal code to write.

### Type/name consistency

- The Map entry field is called `label` in Task 1 Step 3 (storage) and `session.label` in Task 1 Step 4 (read). ✓
- The third parameter to `createTerminal` is `label` in Task 1 Step 1 (signature) and Task 2 Step 1 (call site). ✓
- `this.escapeHtml(...)` is used consistently (matches the existing method at `app.js:829`, not `_escapeHtml`). ✓
- `this.connectionName` is used consistently (matches the existing field at `app.js:173`). ✓
