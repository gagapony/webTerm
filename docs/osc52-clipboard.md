# OSC 52 Clipboard Sharing

webTerm supports OSC 52, the standard terminal protocol for clipboard operations. This lets you copy text from remote programs (nvim, tmux, etc.) directly into your browser clipboard — no extra software needed.

## How It Works

```
nvim/tmux (remote) → OSC 52 escape sequence (base64) → SSH
→ webTerm → xterm.js → browser clipboard
```

Remote programs send an escape sequence with base64-encoded text; xterm.js receives it and writes to the clipboard via the browser Clipboard API.

## Browser Configuration

### Chrome / Edge

Works out of the box, no configuration needed.

### Firefox

Firefox blocks clipboard writes without a user gesture. Open `about:config` and set:

| Setting | Value | Purpose |
|---|---|---|
| `dom.events.asyncClipboard.dataTransfer` | `true` | Allow async clipboard data transfer |
| `clipboard.readText.enabled` | `true` | Allow clipboard read (for paste via OSC 52) |

After changing, restart Firefox.

## Remote Program Configuration

### tmux

Add to `~/.tmux.conf`:

```tmux
set -g set-clipboard on
```

Reload: `tmux source-file ~/.tmux.conf`

Usage: select text with mouse → `Enter` or prefix + `]` to copy → browser clipboard updated instantly.

### Neovim (0.10+)

Built-in OSC 52 support. Add to `init.lua`:

```lua
vim.o.clipboard = 'unnamedplus'
```

Usage: `y` to yank → browser clipboard updated instantly.

### Neovim (older versions)

Install plugin `ojroques/vim-oscyml` or use:

```vim
" init.vim
Plug 'ojroques/vim-oscyml'
```

### Quick Test (no config needed)

Run this in any remote shell to send a test string:

```bash
printf '\e]52;c;%s\a' "$(echo -n 'OSC52 clipboard test' | base64)"
```

Then `Ctrl+V` in your browser to verify.

## Troubleshooting

| Symptom | Fix |
|---|---|
| Chrome: clipboard not updated | Click the terminal area first (needs page focus) |
| Firefox: clipboard not updated | Apply `about:config` settings above, restart browser |
| Works in tmux but not nvim | Check Neovim version ≥ 0.10 or install OSC 52 plugin |
| Works in nvim but not tmux | Check `set -g set-clipboard on` in tmux config |
| HTTPS required error | Serve webTerm over HTTPS or use localhost |
