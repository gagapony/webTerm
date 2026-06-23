// WebTerm Frontend Application
const log = window.logger || console;

// Derive a softer "mantle-like" background from a hex color (darken ~12%)
function deriveMantle(hex) {
  try {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    const f = 0.88; // darken factor
    const toHex = (v) => Math.round(Math.max(0, Math.min(255, v * f))).toString(16).padStart(2, '0');
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
  } catch { return hex; }
}

const XTERM_THEMES = {
  'catppuccin-mocha': {
    background: '#181825',  // mantle — softer than base (#1e1e2e)
    foreground: '#cdd6f4',
    cursor: '#f5e0dc',
    cursorAccent: '#181825',
    selectionBackground: 'rgba(88, 91, 112, 0.4)',
    black: '#45475a', red: '#f38ba8', green: '#a6e3a1', yellow: '#f9e2af',
    blue: '#89b4fa', magenta: '#f5c2e7', cyan: '#94e2d5', white: '#bac2de',
    brightBlack: '#585b70', brightRed: '#f38ba8', brightGreen: '#a6e3a1',
    brightYellow: '#f9e2af', brightBlue: '#89b4fa', brightMagenta: '#f5c2e7',
    brightCyan: '#94e2d5', brightWhite: '#a6adc8',
  },
  'catppuccin-macchiato': {
    background: '#1e2030',  // mantle
    foreground: '#cad3f5',
    cursor: '#f4dbd6',
    cursorAccent: '#1e2030',
    selectionBackground: 'rgba(73, 77, 100, 0.4)',
    black: '#494d64', red: '#ed8796', green: '#a6da95', yellow: '#eed49f',
    blue: '#8aadf4', magenta: '#f5bde6', cyan: '#8bd5ca', white: '#b8c0e0',
    brightBlack: '#5b6078', brightRed: '#ed8796', brightGreen: '#a6da95',
    brightYellow: '#eed49f', brightBlue: '#8aadf4', brightMagenta: '#f5bde6',
    brightCyan: '#8bd5ca', brightWhite: '#a5adcb',
  },
  'catppuccin-frappe': {
    background: '#292c3c',  // mantle
    foreground: '#c6d0f5',
    cursor: '#f2d5cf',
    cursorAccent: '#292c3c',
    selectionBackground: 'rgba(81, 87, 109, 0.4)',
    black: '#51576d', red: '#e78284', green: '#a6d189', yellow: '#e5c890',
    blue: '#8caaee', magenta: '#f4b8e4', cyan: '#81c8be', white: '#b5bfe2',
    brightBlack: '#626880', brightRed: '#e78284', brightGreen: '#a6d189',
    brightYellow: '#e5c890', brightBlue: '#8caaee', brightMagenta: '#f4b8e4',
    brightCyan: '#81c8be', brightWhite: '#a5adce',
  },
  'catppuccin-latte': {
    background: '#e6e9ef',  // mantle — softer than base (#eff1f5)
    foreground: '#4c4f69',
    cursor: '#dc8a78',
    cursorAccent: '#e6e9ef',
    selectionBackground: 'rgba(188, 192, 204, 0.4)',
    black: '#bcc0cc', red: '#d20f39', green: '#40a02b', yellow: '#df8e1d',
    blue: '#1e66f5', magenta: '#ea76cb', cyan: '#179299', white: '#5c5f77',
    brightBlack: '#acb0be', brightRed: '#d20f39', brightGreen: '#40a02b',
    brightYellow: '#df8e1d', brightBlue: '#1e66f5', brightMagenta: '#ea76cb',
    brightCyan: '#179299', brightWhite: '#6c6f85',
  },
};

class WebTerm {
  constructor() {
    log.info('WebTerm constructor called');
    this.ws = null;
    this.terminals = new Map();
    this.activeSessionId = null;
    this.selectedProtocol = 'ssh';
    this.isLoggedIn = false;

    this.init();
  }

  init() {
    log.info('WebTerm init called');
    this.bindElements();
    this.bindEvents();
    this.checkAuth();

    // Initialize settings
    this.currentTheme = 'catppuccin-mocha';
    this.savedThemes = {};
    this.customThemeColors = null;
    this.currentFontSize = 14;
    this.currentOpacity = 0.85;
    this.currentBlurStrength = 12;
    this.currentBackground = null;

    this.initSettingsTabs();
    this.initThemeSelector();
    this.initCustomThemePickers();
    this.initSliders();
    this.initBackgroundUpload();
    this.initThemeManagement();
    this.loadSettings();

    // Load backgrounds when settings modal opens
    this.settingsBtn?.addEventListener('click', () => {
      this.renderPresetBackgrounds();
      this.loadBackgrounds();
    });
  }

  async checkAuth() {
    try {
      const response = await fetch('/api/connections');
      if (response.ok) {
        this.onLoginSuccess();
      }
    } catch (err) {
      // Not logged in
    }
  }

  bindElements() {
    log.debug('bindElements called');
    // Login
    this.loginOverlay = document.getElementById('loginOverlay');
    this.loginForm = document.getElementById('loginForm');
    this.loginUsername = document.getElementById('loginUsername');
    this.loginPassword = document.getElementById('loginPassword');
    this.loginError = document.getElementById('loginError');
    log.debug('Login elements:', { loginOverlay: !!this.loginOverlay, loginForm: !!this.loginForm });

    // App
    this.app = document.getElementById('app');
    log.debug('App element:', !!this.app);

    // Buttons
    this.savedConnBtn = document.getElementById('savedConnBtn');
    this.reconnectBtn = document.getElementById('reconnectBtn');
    this.newSessionBtn = document.getElementById('newSessionBtn');
    this.settingsBtn = document.getElementById('settingsBtn');
    this.connectBtn = document.getElementById('connectBtn');
    this.saveConnectionBtn = document.getElementById('saveConnectionBtn');
    this.newSessionClose = document.getElementById('newSessionClose');
    this.newSessionCancel = document.getElementById('newSessionCancel');
    this.newSessionScrim = document.getElementById('newSessionScrim');
    log.debug('Buttons:', {
      savedConnBtn: !!this.savedConnBtn,
      reconnectBtn: !!this.reconnectBtn,
      newSessionBtn: !!this.newSessionBtn,
      settingsBtn: !!this.settingsBtn,
      connectBtn: !!this.connectBtn
    });

    // Modal
    this.newSessionModal = document.getElementById('newSessionModal');
    this.savedConnDropdown = document.getElementById('savedConnDropdown');
    this.savedConnList = document.getElementById('savedConnList');
    log.debug('Modal elements:', { newSessionModal: !!this.newSessionModal });

    // Status
    this.statusBtn = document.getElementById('statusBtn');
    this.statusDropdown = document.getElementById('statusDropdown');
    this.dropdownState = document.getElementById('dropdownState');
    this.dropdownProtocol = document.getElementById('dropdownProtocol');
    this.dropdownTarget = document.getElementById('dropdownTarget');
    this.dropdownTime = document.getElementById('dropdownTime');
    this.connectionStartTime = null;

    // Terminal
    this.terminalViewport = document.getElementById('terminalViewport');
    this.sessionTabs = document.getElementById('sessionTabs');
    this.sessionTabsBar = document.getElementById('sessionTabsBar');

    // Form fields
    this.connectionName = document.getElementById('connectionName');
    this.remoteFields = document.getElementById('remoteFields');
    this.sessionHost = document.getElementById('sessionHost');
    this.sessionPort = document.getElementById('sessionPort');
    this.sessionUsername = document.getElementById('sessionUsername');
    this.sessionPassword = document.getElementById('sessionPassword');

    // Protocol buttons
    this.protocolBtns = document.querySelectorAll('[data-protocol]');
  }

  bindEvents() {
    log.debug('bindEvents called');

    // Login form
    if (this.loginForm) {
      this.loginForm.addEventListener('submit', (e) => {
        log.info('Login form submitted');
        e.preventDefault();
        this.handleLogin();
      });
      log.debug('Login form event bound');
    }

    // Reconnect
    if (this.reconnectBtn) {
      this.reconnectBtn.addEventListener('click', () => {
        log.info('Reconnect button clicked');
        if (this.ws) this.ws.close();
        this.connectWebSocket();
      });
      log.debug('Reconnect button event bound');
    }

    // New session
    if (this.newSessionBtn) {
      this.newSessionBtn.addEventListener('click', () => {
        log.info('New Session button clicked');
        this.showNewSessionModal();
      });
      log.debug('New Session button event bound');
    }

    // Settings button
    if (this.settingsBtn) {
      this.settingsBtn.addEventListener('click', () => {
        log.info('Settings button clicked');
        this.showSettingsModal();
      });
      log.debug('Settings button event bound');
    }

    // Settings modal controls
    const settingsClose = document.getElementById('settingsClose');
    const settingsScrim = document.getElementById('settingsScrim');
    const settingsCancel = document.getElementById('settingsCancel');
    const settingsSave = document.getElementById('settingsSave');

    settingsClose?.addEventListener('click', () => this.hideSettingsModal());
    settingsScrim?.addEventListener('click', () => this.hideSettingsModal());
    settingsCancel?.addEventListener('click', () => this.hideSettingsModal());
    settingsSave?.addEventListener('click', () => {
      log.info('Settings saved');
      this.saveSettings();
      this.hideSettingsModal();
    });

    // Modal controls
    if (this.newSessionClose) {
      this.newSessionClose.addEventListener('click', () => {
        log.debug('Close button clicked');
        this.hideNewSessionModal();
      });
    }
    if (this.newSessionCancel) {
      this.newSessionCancel.addEventListener('click', () => {
        log.debug('Cancel button clicked');
        this.hideNewSessionModal();
      });
    }
    if (this.newSessionScrim) {
      this.newSessionScrim.addEventListener('click', () => {
        log.debug('Scrim clicked');
        this.hideNewSessionModal();
      });
    }
    if (this.connectBtn) {
      this.connectBtn.addEventListener('click', () => {
        log.info('Connect button clicked');
        this.createSessionFromModal();
      });
    }
    if (this.saveConnectionBtn) {
      this.saveConnectionBtn.addEventListener('click', () => {
        log.info('Save Connection button clicked');
        this.saveConnection();
      });
    }

    // Saved connections
    this.savedConnBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggleSavedConnections();
    });

    // Status indicator
    this.statusBtn?.addEventListener('click', () => this.toggleStatusDropdown());

    // Protocol selection
    this.protocolBtns?.forEach(btn => {
      btn.addEventListener('click', () => this.selectProtocol(btn.dataset.protocol));
    });

    // Close dropdown on outside click
    document.addEventListener('click', (e) => {
      if (this.savedConnDropdown && !this.savedConnDropdown.contains(e.target) && e.target !== this.savedConnBtn) {
        this.savedConnDropdown.hidden = true;
      }
      if (this.statusDropdown && !this.statusDropdown.contains(e.target) && e.target !== this.statusBtn && !this.statusBtn.contains(e.target)) {
        this.statusDropdown.hidden = true;
      }
    });

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this.hideNewSessionModal();
        if (this.savedConnDropdown) this.savedConnDropdown.hidden = true;
        if (this.statusDropdown) this.statusDropdown.hidden = true;
      }
    });
  }

  updateStatus(state, detail = {}) {
    this.statusBtn.classList.remove('status-connected', 'status-connecting', 'status-disconnected', 'status-error');
    this.statusBtn.classList.add(`status-${state}`);
    this.dropdownState.textContent = detail.state || '-';
    this.dropdownProtocol.textContent = detail.protocol || '-';
    this.dropdownTarget.textContent = detail.target || '-';
    this.dropdownTime.textContent = detail.time || '-';
  }

  toggleStatusDropdown() {
    this.statusDropdown.hidden = !this.statusDropdown.hidden;
    this.statusBtn.setAttribute('aria-expanded', String(!this.statusDropdown.hidden));
  }

  formatTime(date) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }

  async handleLogin() {
    const username = this.loginUsername.value;
    const password = this.loginPassword.value;

    if (!username || !password) {
      this.loginError.textContent = 'Please enter username and password';
      return;
    }

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });

      const data = await response.json();

      if (response.ok) {
        this.onLoginSuccess();
      } else {
        this.loginError.textContent = data.error || 'Login failed';
      }
    } catch (err) {
      this.loginError.textContent = 'Connection error';
    }
  }

  onLoginSuccess() {
    this.isLoggedIn = true;
    if (this.loginOverlay) {
      this.loginOverlay.hidden = true;
    }
    this.app.style.display = 'grid';
    this.connectWebSocket();
  }

  connectWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}`;

    this.updateStatus('connecting', { state: 'Connecting...', protocol: '-', target: '-', time: '-' });

    this.ws = new WebSocket(wsUrl);

    this.ws.onopen = () => {
      console.log('WebSocket connected');
      this.updateStatus('connected', { state: 'Connected', protocol: 'WebSocket', target: 'Ready' });
    };

    this.ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        this.handleWSMessage(message);
      } catch (err) {
        console.error('Failed to parse WS message:', err);
      }
    };

    this.ws.onclose = () => {
      console.log('WebSocket disconnected');
      this.updateStatus('disconnected', { state: 'Disconnected', protocol: '-', target: 'Reconnecting...' });
      setTimeout(() => {
        if (this.isLoggedIn) this.connectWebSocket();
      }, 3000);
    };

    this.ws.onerror = (err) => {
      console.error('WebSocket error:', err);
    };
  }

  _measureViewport() {
    const c = document.createElement('div');
    c.style.cssText = 'width:100%;height:100%;position:absolute;visibility:hidden';
    this.terminalViewport.appendChild(c);
    const t = new Terminal({
      fontFamily: '"MonaspiceAr NFM Medium", "MonaspiceAr NFM", monospace',
      fontSize: 14, lineHeight: 1.0,
    });
    const f = new FitAddon.FitAddon();
    t.loadAddon(f);
    t.open(c);
    f.fit();
    const dims = { cols: t.cols, rows: t.rows };
    t.dispose();
    c.remove();
    return dims;
  }

  handleWSMessage(message) {
    switch (message.type) {
      case 'created':
        this.onSessionCreated(message.sessionId, message.protocol);
        break;
      case 'output':
        this.onTerminalOutput(message.sessionId, message.data);
        break;
      case 'exit':
        this.onSessionExit(message.sessionId);
        break;
      case 'error':
        this.onSessionError(message.sessionId, message.message);
        break;
    }
  }

  showNewSessionModal() {
    log.info('showNewSessionModal called');
    log.debug('newSessionModal element:', this.newSessionModal);
    if (this.newSessionModal) {
      this.newSessionModal.removeAttribute('hidden');
      this.newSessionModal.style.display = 'grid';
      this.newSessionModal.dataset.open = 'true';
      log.debug('Modal shown');
    } else {
      log.error('newSessionModal element not found!');
    }
    this.loadSavedConnections();
  }

  hideNewSessionModal() {
    log.info('hideNewSessionModal called');
    if (this.newSessionModal) {
      this.newSessionModal.setAttribute('hidden', '');
      this.newSessionModal.style.display = 'none';
      this.newSessionModal.dataset.open = 'false';
    }
  }

  showSettingsModal() {
    log.info('showSettingsModal called');
    const modal = document.getElementById('settingsModal');
    if (modal) {
      modal.removeAttribute('hidden');
      modal.style.display = 'grid';
      modal.dataset.open = 'true';
    }
  }

  hideSettingsModal() {
    log.info('hideSettingsModal called');
    const modal = document.getElementById('settingsModal');
    if (modal) {
      modal.dataset.open = 'false';
      setTimeout(() => {
        modal.setAttribute('hidden', '');
        modal.style.display = 'none';
      }, 200);
    }
  }

  toggleSavedConnections() {
    this.savedConnDropdown.hidden = !this.savedConnDropdown.hidden;
    if (!this.savedConnDropdown.hidden) {
      this.loadSavedConnections();
    }
  }

  selectProtocol(protocol) {
    this.selectedProtocol = protocol;
    this.protocolBtns.forEach(btn => {
      btn.classList.toggle('is-active', btn.dataset.protocol === protocol);
    });

    this.remoteFields.style.display = 'block';
    this.sessionPort.placeholder = protocol === 'ssh' ? '22' : '23';
  }

  createSessionFromModal() {
    const { cols, rows } = this._measureViewport();

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

  createTerminal(sessionId, protocol, label) {
    if (!label) {
      label = protocol.toUpperCase();
    }
    const terminalTheme = this._resolveTheme();

    const terminal = new Terminal({
      theme: terminalTheme,
      fontFamily: '"MonaspiceAr NFM Medium", "MonaspiceAr NFM", monospace',
      fontSize: 14,
      lineHeight: 1.0,
      cursorBlink: true,
      cursorStyle: 'bar',
      scrollback: 10000,
    });

    const fitAddon = new FitAddon.FitAddon();
    const webLinksAddon = new WebLinksAddon.WebLinksAddon();

    terminal.loadAddon(fitAddon);
    terminal.loadAddon(webLinksAddon);

    // Hide all existing containers
    const existingContainers = this.terminalViewport.querySelectorAll('[id^="terminal-"]');
    existingContainers.forEach(c => c.style.display = 'none');

    // Create container
    const container = document.createElement('div');
    container.id = `terminal-${sessionId}`;
    container.style.width = '100%';
    container.style.height = '100%';
    this.terminalViewport.appendChild(container);

    terminal.open(container);

    // Handle resize — forward every resize to the backend so the remote
    // PTY stays in sync with xterm.js. The first resize after fit() is
    // intentional: SSH/Telnet open with the create-message cols/rows, but
    // forwarding the first onResize guarantees correctness even if the
    // server ignored channel-open dimensions. Linux's TIOCSWINSZ is a
    // no-op when the size is unchanged, so this is safe.
    terminal.onResize(({ cols, rows }) => {
      if (this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: 'resize', sessionId, cols, rows }));
      }
    });

    setTimeout(() => fitAddon.fit(), 100);

    // Store terminal
    this.terminals.set(sessionId, {
      terminal,
      fitAddon,
      protocol,
      label,
      container,
    });

    this.activeSessionId = sessionId;

    // Handle input
    terminal.onData((data) => {
      if (this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: 'input', sessionId, data }));
      }
    });

    // Fit on resize
    window.addEventListener('resize', () => fitAddon.fit());

    this.updateSessionTabs();
    terminal.focus();
  }

  onTerminalOutput(sessionId, data) {
    const session = this.terminals.get(sessionId);
    if (session) {
      session.terminal.write(data);
    }
  }

  onSessionExit(sessionId) {
    const session = this.terminals.get(sessionId);
    if (session) {
      session.terminal.write('\r\n\x1b[33m[Session ended]\x1b[0m\r\n');
    }
    this.updateStatus('disconnected', { state: 'Disconnected' });
  }

  onSessionError(sessionId, message) {
    console.error('Session error:', message);
    this.updateStatus('error', { state: 'Error', target: message });

    if (sessionId) {
      const session = this.terminals.get(sessionId);
      if (session) {
        session.terminal.write(`\r\n\x1b[31mError: ${message}\x1b[0m\r\n`);
      }
    }
  }

  updateSessionTabs() {
    this.sessionTabs.innerHTML = '';
    const hasSessions = this.terminals.size > 0;
    this.sessionTabsBar.dataset.empty = !hasSessions;

    for (const [id, session] of this.terminals) {
      const tab = document.createElement('div');
      tab.className = `session-tab${id === this.activeSessionId ? ' is-active' : ''}`;
      tab.dataset.indicator = 'live';

      tab.innerHTML = `
        <div class="session-tab-copy">
          <div class="session-tab-heading">
            <span class="session-tab-title">${this.escapeHtml(session.label)}</span>
          </div>
          <div class="session-tab-meta">${id.substring(0, 8)}</div>
        </div>
        <button class="session-tab-close" data-session-id="${id}">×</button>
      `;

      // Click to switch
      tab.addEventListener('click', (e) => {
        if (!e.target.classList.contains('session-tab-close')) {
          this.switchToSession(id);
        }
      });

      // Close button
      tab.querySelector('.session-tab-close')?.addEventListener('click', () => {
        this.closeSession(id);
      });

      this.sessionTabs.appendChild(tab);
    }
  }

  switchToSession(sessionId) {
    const session = this.terminals.get(sessionId);
    if (!session) return;

    this.activeSessionId = sessionId;

    // Hide all containers, show target
    const allContainers = this.terminalViewport.querySelectorAll('[id^="terminal-"]');
    allContainers.forEach(c => c.style.display = 'none');

    if (session.container) {
      session.container.style.display = 'block';
      session.fitAddon.fit();
      session.terminal.focus();
    }

    this.updateSessionTabs();
  }

  closeSession(sessionId) {
    this.ws.send(JSON.stringify({ type: 'close', sessionId }));

    const session = this.terminals.get(sessionId);
    if (session) {
      session.terminal.dispose();
      this.terminals.delete(sessionId);
    }

    if (this.terminals.size === 0) {
      this.updateStatus('connecting', { state: 'Ready', protocol: '-', target: 'Click + to connect', time: '-' });
      this.connectionStartTime = null;
      this.activeSessionId = null;
    } else {
      const firstSession = this.terminals.keys().next().value;
      this.switchToSession(firstSession);
    }

    this.updateSessionTabs();
  }

  // Saved connections
  async loadSavedConnections() {
    try {
      const response = await fetch('/api/connections');
      if (!response.ok) return;
      const connections = await response.json();
      this.renderSavedConnections(connections);
    } catch (err) {
      console.error('Failed to load connections:', err);
    }
  }

  renderSavedConnections(connections) {
    if (!connections.length) {
      this.savedConnList.innerHTML = '<div class="saved-connections-empty">No saved connections</div>';
      return;
    }

    this.savedConnList.innerHTML = connections.map(conn => {
      const icon = conn.protocol === 'ssh' ? '🔒' : '📡';
      return `
        <div class="saved-connection-item" data-connection-id="${conn.id}">
          <div class="saved-connection-icon">${icon}</div>
          <div class="saved-connection-info">
            <div class="saved-connection-name">${this.escapeHtml(conn.name)}</div>
            <div class="saved-connection-meta">${conn.protocol.toUpperCase()} • ${conn.host || '-'}${conn.port ? ':' + conn.port : ''}</div>
          </div>
          <button class="saved-connection-delete" data-connection-id="${conn.id}" title="Delete">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>
      `;
    }).join('');

    // Bind events
    this.savedConnList.querySelectorAll('.saved-connection-item').forEach(item => {
      item.addEventListener('click', (e) => {
        if (!e.target.closest('.saved-connection-delete')) {
          this.connectSaved(parseInt(item.dataset.connectionId));
        }
      });
    });

    this.savedConnList.querySelectorAll('.saved-connection-delete').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.deleteSaved(parseInt(btn.dataset.connectionId));
      });
    });
  }

  async connectSaved(connectionId) {
    try {
      const response = await fetch('/api/connections');
      const connections = await response.json();
      const conn = connections.find(c => c.id === connectionId);
      if (!conn) return;

      this.savedConnDropdown.hidden = true;

      // Set form and connect
      this.selectProtocol(conn.protocol);
      if (this.connectionName) this.connectionName.value = conn.name || '';
      this.sessionHost.value = conn.host || '';
      this.sessionPort.value = conn.port || '';
      this.sessionUsername.value = conn.username || '';
      this.sessionPassword.value = conn.password_encrypted || '';

      this.createSessionFromModal();
    } catch (err) {
      console.error('Failed to connect:', err);
    }
  }

  async deleteSaved(connectionId) {
    try {
      await fetch(`/api/connections/${connectionId}`, { method: 'DELETE' });
      this.loadSavedConnections();
    } catch (err) {
      console.error('Failed to delete connection:', err);
    }
  }

  async saveConnection() {
    const name = this.connectionName?.value?.trim();
    if (!name) {
      alert('Please enter a connection name');
      return;
    }

    const data = {
      name,
      protocol: this.selectedProtocol,
      host: this.sessionHost.value || null,
      port: parseInt(this.sessionPort.value) || null,
      username: this.sessionUsername.value || null,
      password: this.sessionPassword.value || null,
    };

    try {
      await fetch('/api/connections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      this.connectionName.value = '';
      this.loadSavedConnections();
    } catch (err) {
      console.error('Failed to save connection:', err);
    }
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  initSettingsTabs() {
    const tabs = document.querySelectorAll('.settings-tab');
    const contents = document.querySelectorAll('.settings-tab-content');

    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        const targetTab = tab.dataset.tab;

        // Update tab active states
        tabs.forEach(t => {
          t.classList.remove('is-active');
          t.setAttribute('aria-selected', 'false');
        });
        tab.classList.add('is-active');
        tab.setAttribute('aria-selected', 'true');

        // Update content visibility
        contents.forEach(content => {
          content.classList.toggle('is-active', content.dataset.tabContent === targetTab);
        });
      });
    });
  }

  initThemeSelector() {
    const themeOptions = document.querySelectorAll('.theme-option');
    const customThemeSection = document.querySelector('.custom-theme-section');

    themeOptions.forEach(option => {
      option.addEventListener('click', () => {
        const theme = option.dataset.theme;

        // Update active state
        themeOptions.forEach(o => o.classList.remove('is-active'));
        option.classList.add('is-active');

        // Show/hide custom theme section
        if (customThemeSection) {
          customThemeSection.hidden = theme !== 'custom';
        }

        // Apply theme
        this.applyTheme(theme);

        // Update custom theme dropdown
        this.updateCustomThemeDropdown();
      });
    });
  }

  applyTheme(theme) {
    this.currentTheme = theme;

    if (theme === 'custom') {
      const base = document.getElementById('customBase')?.value || '#1e1e2e';
      const text = document.getElementById('customText')?.value || '#cdd6f4';
      const accent = document.getElementById('customAccent')?.value || '#89b4fa';
      const surface = document.getElementById('customSurface')?.value || '#313244';
      const surface1 = document.getElementById('customSurface1')?.value || '#45475a';
      const overlay0 = document.getElementById('customOverlay0')?.value || '#585b70';
      const overlay1 = document.getElementById('customOverlay1')?.value || '#6c7086';

      this.customThemeColors = { base, text, accent, surface0: surface, surface1, overlay0, overlay1 };
      this.applyCustomThemeFromColors(this.customThemeColors);
    } else if (theme && theme.startsWith('custom-') && this.savedThemes && this.savedThemes[theme]) {
      // It's a saved custom theme
      const customTheme = this.savedThemes[theme];
      this.customThemeColors = customTheme.colors;
      this.applyCustomThemeFromColors(customTheme.colors);
      this.updateCustomColorPickers(customTheme.colors);
    } else {
      document.documentElement.setAttribute('data-theme', theme);
      // Reset custom properties
      document.documentElement.style.removeProperty('--ctp-base');
      document.documentElement.style.removeProperty('--ctp-text');
      document.documentElement.style.removeProperty('--ctp-accent');
      document.documentElement.style.removeProperty('--ctp-surface0');
      document.documentElement.style.removeProperty('--ctp-surface1');
      document.documentElement.style.removeProperty('--ctp-overlay0');
      document.documentElement.style.removeProperty('--ctp-overlay1');
    }

    this.applyTerminalTheme();
  }

  initCustomThemePickers() {
    const pickers = [
      { id: 'customBase', hexId: 'customBaseHex' },
      { id: 'customText', hexId: 'customTextHex' },
      { id: 'customAccent', hexId: 'customAccentHex' },
      { id: 'customSurface', hexId: 'customSurfaceHex' },
      { id: 'customSurface1', hexId: 'customSurface1Hex' },
      { id: 'customOverlay0', hexId: 'customOverlay0Hex' },
      { id: 'customOverlay1', hexId: 'customOverlay1Hex' },
    ];

    pickers.forEach(({ id, hexId }) => {
      const picker = document.getElementById(id);
      const hexSpan = document.getElementById(hexId);
      if (picker) {
        picker.addEventListener('input', (e) => {
          if (hexSpan) hexSpan.textContent = e.target.value;
          if (this.currentTheme?.startsWith('custom') || this.currentTheme === 'custom') {
            // Update custom theme colors
            this.customThemeColors = {
              base: document.getElementById('customBase')?.value || '#1e1e2e',
              text: document.getElementById('customText')?.value || '#cdd6f4',
              accent: document.getElementById('customAccent')?.value || '#89b4fa',
              surface0: document.getElementById('customSurface')?.value || '#313244',
              surface1: document.getElementById('customSurface1')?.value || '#45475a',
              overlay0: document.getElementById('customOverlay0')?.value || '#585b70',
              overlay1: document.getElementById('customOverlay1')?.value || '#6c7086'
            };
            this.applyCustomThemeFromColors(this.customThemeColors);
          }
        });
      }
    });
  }

  initSliders() {
    // Font size slider
    const fontSizeSlider = document.getElementById('fontSizeSlider');
    const fontSizeValue = document.getElementById('fontSizeValue');

    if (fontSizeSlider) {
      fontSizeSlider.addEventListener('input', (e) => {
        const size = e.target.value;
        if (fontSizeValue) fontSizeValue.textContent = `${size}px`;
        document.documentElement.style.setProperty('--font-size', `${size}px`);

        // Update all terminals
        this.terminals.forEach(t => {
          if (t.terminal) t.terminal.options.fontSize = parseInt(size);
        });

        this.currentFontSize = parseInt(size);
      });
    }

    // Opacity slider
    const opacitySlider = document.getElementById('opacitySlider');
    const opacityValue = document.getElementById('opacityValue');

    if (opacitySlider) {
      opacitySlider.addEventListener('input', (e) => {
        const opacity = e.target.value;
        if (opacityValue) opacityValue.textContent = `${opacity}%`;
        document.documentElement.style.setProperty('--terminal-opacity', opacity / 100);
        this.currentOpacity = opacity / 100;
        this.applyTerminalTheme();
      });
    }

    // Blur slider
    const blurSlider = document.getElementById('blurSlider');
    const blurValue = document.getElementById('blurValue');

    if (blurSlider) {
      blurSlider.addEventListener('input', (e) => {
        const blur = e.target.value;
        if (blurValue) blurValue.textContent = `${blur}px`;
        document.documentElement.style.setProperty('--blur-strength', `${blur}px`);
        this.currentBlurStrength = parseInt(blur);
      });
    }
  }

  async loadSettings() {
    try {
      const response = await fetch('/api/settings');
      if (!response.ok) return;
      let settings = await response.json();

      // Migration: if server has no settings but localStorage does, upload then clear
      if (!settings || Object.keys(settings).length === 0) {
        const saved = localStorage.getItem('webterm-settings');
        if (saved) {
          settings = JSON.parse(saved);
          await fetch('/api/settings', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(settings),
          });
          localStorage.removeItem('webterm-settings');
          log.info('Settings migrated from localStorage to server');
        } else {
          return;
        }
      }

      this.applySettings(settings);
    } catch (err) {
      log.error('Failed to load settings:', err);
    }
  }

  applySettings(settings) {
    // Load saved themes (backward compatible)
    if (settings.themes) {
      this.savedThemes = settings.themes;
    } else if (settings.customColors) {
      // Migrate old format
      this.savedThemes = {
        'custom-legacy': {
          name: 'Legacy Custom Theme',
          colors: settings.customColors
        }
      };
    } else {
      this.savedThemes = {};
    }

    // Apply theme
    const themeToApply = settings.currentTheme || settings.theme || 'catppuccin-mocha';
    this.currentTheme = themeToApply;

    // Check if it's a saved custom theme
    if (themeToApply.startsWith('custom-') && this.savedThemes[themeToApply]) {
      const customTheme = this.savedThemes[themeToApply];
      this.applyCustomThemeFromColors(customTheme.colors);
      this.customThemeColors = customTheme.colors;

      // Update color pickers
      this.updateCustomColorPickers(customTheme.colors);

      // Show custom section
      const customThemeSection = document.querySelector('.custom-theme-section');
      if (customThemeSection) {
        customThemeSection.hidden = false;
      }

      // Update custom theme dropdown if exists
      this.updateCustomThemeDropdown();
    } else if (themeToApply === 'custom') {
      // Legacy custom theme handling
      if (settings.customColors) {
        this.customThemeColors = settings.customColors;
        this.applyCustomThemeFromColors(settings.customColors);
        this.updateCustomColorPickers(settings.customColors);
      }
      const customThemeSection = document.querySelector('.custom-theme-section');
      if (customThemeSection) {
        customThemeSection.hidden = false;
      }
    } else {
      this.applyTheme(themeToApply);
    }

    // Update theme selector UI
    this.updateThemeSelectorUI(themeToApply);

    // Apply font size
    if (settings.fontSize) {
      this.currentFontSize = settings.fontSize;
      document.documentElement.style.setProperty('--font-size', `${settings.fontSize}px`);
      const fontSizeSlider = document.getElementById('fontSizeSlider');
      const fontSizeValue = document.getElementById('fontSizeValue');
      if (fontSizeSlider) fontSizeSlider.value = settings.fontSize;
      if (fontSizeValue) fontSizeValue.textContent = `${settings.fontSize}px`;
    }

    // Apply opacity
    if (settings.terminalOpacity !== undefined) {
      this.currentOpacity = settings.terminalOpacity;
      document.documentElement.style.setProperty('--terminal-opacity', settings.terminalOpacity);
      const opacitySlider = document.getElementById('opacitySlider');
      const opacityValue = document.getElementById('opacityValue');
      if (opacitySlider) opacitySlider.value = settings.terminalOpacity * 100;
      if (opacityValue) opacityValue.textContent = `${Math.round(settings.terminalOpacity * 100)}%`;
    }

    // Apply blur
    if (settings.blurStrength !== undefined) {
      this.currentBlurStrength = settings.blurStrength;
      document.documentElement.style.setProperty('--blur-strength', `${settings.blurStrength}px`);
      const blurSlider = document.getElementById('blurSlider');
      const blurValue = document.getElementById('blurValue');
      if (blurSlider) blurSlider.value = settings.blurStrength;
      if (blurValue) blurValue.textContent = `${settings.blurStrength}px`;
    }

    // Apply background
    if (settings.backgroundImage) {
      this.applyBackground(settings.backgroundImage);
    }
  }

  async saveSettings() {
    const settings = {
      themes: this.savedThemes || {},
      currentTheme: this.currentTheme || 'catppuccin-mocha',
      fontSize: this.currentFontSize || 14,
      backgroundImage: this.currentBackground || null,
      terminalOpacity: this.currentOpacity !== undefined ? this.currentOpacity : 0.85,
      blurStrength: this.currentBlurStrength || 12
    };

    // If current theme is custom, save the colors
    if (this.currentTheme === 'custom' && this.customThemeColors) {
      settings.themes['custom-current'] = {
        name: 'Current Custom',
        colors: this.customThemeColors
      };
    }

    try {
      await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });
    } catch (err) {
      log.error('Failed to save settings:', err);
    }
  }

  // Theme management methods
  applyCustomThemeFromColors(colors) {
    if (!colors) return;

    const base = colors.base || '#1e1e2e';
    const text = colors.text || '#cdd6f4';
    const accent = colors.accent || '#89b4fa';
    const surface = colors.surface0 || colors.surface || '#313244';
    const surface1 = colors.surface1 || '#45475a';
    const overlay0 = colors.overlay0 || '#585b70';
    const overlay1 = colors.overlay1 || '#6c7086';

    document.documentElement.style.setProperty('--ctp-base', base);
    document.documentElement.style.setProperty('--ctp-text', text);
    document.documentElement.style.setProperty('--ctp-accent', accent);
    document.documentElement.style.setProperty('--ctp-surface0', surface);
    document.documentElement.style.setProperty('--ctp-surface1', surface1);
    document.documentElement.style.setProperty('--ctp-overlay0', overlay0);
    document.documentElement.style.setProperty('--ctp-overlay1', overlay1);
    document.documentElement.removeAttribute('data-theme');
    this.applyTerminalTheme();
  }

  deriveXtermTheme(colors) {
    const base = colors.base || '#1e1e2e';
    const mantle = deriveMantle(base);
    return {
      background: mantle,
      foreground: colors.text || '#cdd6f4',
      cursor: colors.accent || '#89b4fa',
      cursorAccent: mantle,
      selectionBackground: (colors.surface1 || '#45475a') + '66',
      black: colors.surface1 || '#45475a', red: '#f38ba8',
      green: '#a6e3a1', yellow: '#f9e2af',
      blue: colors.accent || '#89b4fa', magenta: '#f5c2e7',
      cyan: '#94e2d5', white: colors.overlay1 || '#6c7086',
      brightBlack: colors.surface2 || '#585b70', brightRed: '#f38ba8',
      brightGreen: '#a6e3a1', brightYellow: '#f9e2af',
      brightBlue: colors.accent || '#89b4fa', brightMagenta: '#f5c2e7',
      brightCyan: '#94e2d5', brightWhite: colors.overlay0 || '#585b70',
    };
  }

  _resolveTheme() {
    const themeName = this.currentTheme || 'catppuccin-mocha';
    let theme;

    if ((themeName === 'custom' || themeName.startsWith('custom-')) && this.customThemeColors) {
      theme = this.deriveXtermTheme(this.customThemeColors);
    } else {
      theme = XTERM_THEMES[themeName] || XTERM_THEMES['catppuccin-mocha'];
    }

    // Terminal background always transparent — color and opacity
    // are controlled by .terminal-frame CSS for visual consistency
    // with the topbar
    theme = { ...theme, background: 'transparent' };

    return theme;
  }

  applyTerminalTheme() {
    const theme = this._resolveTheme();

    // Apply to all active terminals
    this.terminals.forEach(t => {
      if (t.terminal) {
        t.terminal.options.theme = theme;
      }
    });
  }

  updateCustomColorPickers(colors) {
    if (!colors) return;

    if (document.getElementById('customBase')) document.getElementById('customBase').value = colors.base || '#1e1e2e';
    if (document.getElementById('customText')) document.getElementById('customText').value = colors.text || '#cdd6f4';
    if (document.getElementById('customAccent')) document.getElementById('customAccent').value = colors.accent || '#89b4fa';
    if (document.getElementById('customSurface')) document.getElementById('customSurface').value = colors.surface0 || colors.surface || '#313244';
    if (document.getElementById('customSurface1')) document.getElementById('customSurface1').value = colors.surface1 || '#45475a';
    if (document.getElementById('customOverlay0')) document.getElementById('customOverlay0').value = colors.overlay0 || '#585b70';
    if (document.getElementById('customOverlay1')) document.getElementById('customOverlay1').value = colors.overlay1 || '#6c7086';
  }

  updateThemeSelectorUI(themeId) {
    // Reset all theme options
    document.querySelectorAll('.theme-option').forEach(o => o.classList.remove('is-active'));

    // Find and activate the matching theme option
    const themeOption = document.querySelector(`[data-theme="${themeId}"]`);
    if (themeOption) {
      themeOption.classList.add('is-active');
    } else if (themeId && themeId.startsWith('custom-')) {
      // It's a saved custom theme, activate the custom option
      const customOption = document.querySelector('[data-theme="custom"]');
      if (customOption) {
        customOption.classList.add('is-active');
      }
    }

    // Show/hide custom theme section
    const customThemeSection = document.querySelector('.custom-theme-section');
    if (customThemeSection) {
      customThemeSection.hidden = !themeId?.startsWith('custom');
    }
  }

  updateCustomThemeDropdown() {
    const dropdown = document.getElementById('customThemeSelect');
    if (!dropdown) return;

    // Clear existing options except the first "New Custom" option
    dropdown.innerHTML = '<option value="">New Custom Theme</option>';

    // Add saved custom themes
    for (const [id, theme] of Object.entries(this.savedThemes || {})) {
      if (id.startsWith('custom-')) {
        const option = document.createElement('option');
        option.value = id;
        option.textContent = theme.name || id;
        if (id === this.currentTheme) {
          option.selected = true;
        }
        dropdown.appendChild(option);
      }
    }
  }

  selectSavedTheme(themeId) {
    if (!themeId || !this.savedThemes[themeId]) return;

    const theme = this.savedThemes[themeId];
    this.currentTheme = themeId;
    this.customThemeColors = theme.colors;
    this.applyCustomThemeFromColors(theme.colors);
    this.updateCustomColorPickers(theme.colors);
    this.updateThemeSelectorUI(themeId);
    this.updateCustomThemeDropdown();
  }

  saveCustomTheme() {
    const nameInput = document.getElementById('customThemeName');
    const name = nameInput?.value?.trim() || `Custom Theme ${Object.keys(this.savedThemes || {}).length + 1}`;

    // Get current colors from pickers
    const colors = {
      base: document.getElementById('customBase')?.value || '#1e1e2e',
      text: document.getElementById('customText')?.value || '#cdd6f4',
      accent: document.getElementById('customAccent')?.value || '#89b4fa',
      surface0: document.getElementById('customSurface')?.value || '#313244',
      surface1: document.getElementById('customSurface1')?.value || '#45475a',
      overlay0: document.getElementById('customOverlay0')?.value || '#585b70',
      overlay1: document.getElementById('customOverlay1')?.value || '#6c7086'
    };

    // Generate unique ID
    let themeId = 'custom-' + Date.now();
    while (this.savedThemes[themeId]) {
      themeId = 'custom-' + Date.now() + '-' + Math.random().toString(36).substr(2, 5);
    }

    // Save theme
    this.savedThemes[themeId] = { name, colors };
    this.currentTheme = themeId;
    this.customThemeColors = colors;

    // Apply theme
    this.applyCustomThemeFromColors(colors);
    this.updateThemeSelectorUI(themeId);
    this.updateCustomThemeDropdown();

    // Clear name input
    if (nameInput) nameInput.value = '';

    log.info(`Theme saved: ${name} (${themeId})`);
  }

  deleteCustomTheme(themeId) {
    if (!themeId || !this.savedThemes[themeId]) return;

    if (!confirm(`Delete theme "${this.savedThemes[themeId].name}"?`)) return;

    delete this.savedThemes[themeId];

    // If the deleted theme was active, switch to default
    if (this.currentTheme === themeId) {
      this.currentTheme = 'catppuccin-mocha';
      this.applyTheme('catppuccin-mocha');
      this.updateThemeSelectorUI('catppuccin-mocha');
    }

    this.updateCustomThemeDropdown();

    log.info(`Theme deleted: ${themeId}`);
  }

  importThemeFromJSON(jsonString) {
    try {
      const data = JSON.parse(jsonString);

      // Validate structure
      if (!data.name || !data.colors) {
        throw new Error('Invalid theme format: missing "name" or "colors"');
      }

      // Validate colors
      const requiredColors = ['base', 'text', 'accent', 'surface0'];
      for (const color of requiredColors) {
        if (!data.colors[color]) {
          throw new Error(`Missing required color: ${color}`);
        }
      }

      // Generate unique ID
      let themeId = 'custom-' + Date.now();
      while (this.savedThemes[themeId]) {
        themeId = 'custom-' + Date.now() + '-' + Math.random().toString(36).substr(2, 5);
      }

      // Save theme
      this.savedThemes[themeId] = {
        name: data.name,
        colors: data.colors
      };

      // Apply the imported theme
      this.selectSavedTheme(themeId);

      log.info(`Theme imported: ${data.name} (${themeId})`);
      return { success: true, themeId, name: data.name };
    } catch (error) {
      log.error('Failed to import theme:', error);
      return { success: false, error: error.message };
    }
  }

  exportCurrentTheme() {
    // Get current colors
    let colors;
    if (this.currentTheme?.startsWith('custom-') && this.savedThemes[this.currentTheme]) {
      colors = this.savedThemes[this.currentTheme].colors;
    } else if (this.customThemeColors) {
      colors = this.customThemeColors;
    } else {
      colors = {
        base: document.getElementById('customBase')?.value || '#1e1e2e',
        text: document.getElementById('customText')?.value || '#cdd6f4',
        accent: document.getElementById('customAccent')?.value || '#89b4fa',
        surface0: document.getElementById('customSurface')?.value || '#313244',
        surface1: document.getElementById('customSurface1')?.value || '#45475a',
        overlay0: document.getElementById('customOverlay0')?.value || '#585b70',
        overlay1: document.getElementById('customOverlay1')?.value || '#6c7086'
      };
    }

    const themeName = this.savedThemes[this.currentTheme]?.name || 'Exported Theme';

    return {
      name: themeName,
      colors: colors
    };
  }

  // Background image methods
  applyBackground(background) {
    if (!background) {
      document.body.style.backgroundImage = '';
      document.body.classList.remove('has-background');
      this.applyTerminalTheme();
      return;
    }

    const url = background.value || background;
    document.body.style.backgroundImage = `url(${url})`;
    document.body.style.backgroundSize = 'cover';
    document.body.style.backgroundPosition = 'center';
    document.body.style.backgroundAttachment = 'fixed';
    document.body.classList.add('has-background');
    this.applyTerminalTheme();
  }

  async loadBackgrounds() {
    try {
      const response = await fetch('/api/backgrounds');
      if (response.ok) {
        const backgrounds = await response.json();
        this.renderUploadedBackgrounds(backgrounds);
      }
    } catch (error) {
      console.error('Failed to load backgrounds:', error);
    }
  }

  renderPresetBackgrounds() {
    const grid = document.getElementById('bgPresetGrid');
    if (!grid) return;

    const presets = [
      { id: 'mountain', name: 'Mountain', url: '/backgrounds/preset-mountain.svg' },
      { id: 'ocean', name: 'Ocean', url: '/backgrounds/preset-ocean.svg' },
      { id: 'forest', name: 'Forest', url: '/backgrounds/preset-forest.svg' }
    ];

    grid.innerHTML = presets.map(preset => `
      <div class="bg-preset-item" data-preset="${preset.id}" data-url="${preset.url}">
        <img src="${preset.url}" alt="${preset.name}" loading="lazy">
        <span>${preset.name}</span>
      </div>
    `).join('');

    // Add click handlers
    grid.querySelectorAll('.bg-preset-item').forEach(item => {
      item.addEventListener('click', () => {
        const url = item.dataset.url;
        this.selectBackground({ type: 'preset', value: url });

        // Update active state
        document.querySelectorAll('.bg-preset-item, .bg-uploaded-item').forEach(i => i.classList.remove('is-active'));
        item.classList.add('is-active');
      });
    });
  }

  renderUploadedBackgrounds(backgrounds) {
    const grid = document.getElementById('bgUploadedGrid');
    if (!grid) return;

    if (backgrounds.length === 0) {
      grid.innerHTML = '<div class="bg-empty-message">No uploaded images</div>';
      return;
    }

    grid.innerHTML = backgrounds.map(bg => `
      <div class="bg-uploaded-item" data-id="${bg.id}" data-url="/backgrounds/${this.escapeHtml(bg.filename)}">
        <img src="/backgrounds/${this.escapeHtml(bg.filename)}" alt="${this.escapeHtml(bg.original_name)}" loading="lazy">
        <button class="bg-delete-btn" data-id="${bg.id}">×</button>
      </div>
    `).join('');

    // Add click handlers
    grid.querySelectorAll('.bg-uploaded-item').forEach(item => {
      item.addEventListener('click', (e) => {
        if (!e.target.classList.contains('bg-delete-btn')) {
          const url = item.dataset.url;
          this.selectBackground({ type: 'uploaded', value: url });

          // Update active state
          document.querySelectorAll('.bg-preset-item, .bg-uploaded-item').forEach(i => i.classList.remove('is-active'));
          item.classList.add('is-active');
        }
      });
    });

    // Add delete handlers
    grid.querySelectorAll('.bg-delete-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const id = btn.dataset.id;
        await this.deleteBackground(id);
      });
    });
  }

  selectBackground(background) {
    this.currentBackground = background;
    this.applyBackground(background);
  }

  async uploadBackground(file) {
    const formData = new FormData();
    formData.append('image', file);

    try {
      const response = await fetch('/api/backgrounds/upload', {
        method: 'POST',
        body: formData
      });

      if (response.ok) {
        const result = await response.json();
        this.loadBackgrounds();
        return result;
      } else {
        const error = await response.json();
        alert(error.error || 'Upload failed');
        return null;
      }
    } catch (error) {
      console.error('Upload error:', error);
      alert('Upload failed');
      return null;
    }
  }

  async deleteBackground(id) {
    if (!confirm('Delete this background image?')) return;

    try {
      const response = await fetch(`/api/backgrounds/${id}`, {
        method: 'DELETE'
      });

      if (response.ok) {
        this.loadBackgrounds();

        // Reset if currently selected
        if (this.currentBackground && this.currentBackground.value && this.currentBackground.value.includes(id)) {
          this.currentBackground = null;
          this.applyBackground(null);
        }
      }
    } catch (error) {
      console.error('Delete error:', error);
    }
  }

  initBackgroundUpload() {
    const uploadArea = document.getElementById('bgUploadArea');
    const fileInput = document.getElementById('bgFileInput');

    if (uploadArea && fileInput) {
      // Click to upload
      uploadArea.addEventListener('click', () => {
        fileInput.click();
      });

      // File input change
      fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
          this.uploadBackground(file);
        }
      });

      // Drag and drop
      uploadArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadArea.classList.add('is-dragover');
      });

      uploadArea.addEventListener('dragleave', () => {
        uploadArea.classList.remove('is-dragover');
      });

      uploadArea.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadArea.classList.remove('is-dragover');

        const file = e.dataTransfer.files[0];
        if (file && file.type.startsWith('image/')) {
          this.uploadBackground(file);
        }
      });
    }

    // URL input
    const urlInput = document.getElementById('bgUrlInput');
    const urlApply = document.getElementById('bgUrlApply');

    if (urlInput && urlApply) {
      urlApply.addEventListener('click', () => {
        const url = urlInput.value.trim();
        if (url) {
          this.selectBackground({ type: 'url', value: url });
          urlInput.value = '';
        }
      });

      urlInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
          urlApply.click();
        }
      });
    }
  }

  initThemeManagement() {
    // Save theme button
    const saveThemeBtn = document.getElementById('saveCustomThemeBtn');
    if (saveThemeBtn) {
      saveThemeBtn.addEventListener('click', () => {
        this.saveCustomTheme();
      });
    }

    // Custom theme dropdown
    const customThemeSelect = document.getElementById('customThemeSelect');
    if (customThemeSelect) {
      customThemeSelect.addEventListener('change', (e) => {
        const themeId = e.target.value;
        if (themeId) {
          this.selectSavedTheme(themeId);
        }
      });
    }

    // Import from file
    const importFileBtn = document.getElementById('importThemeFileBtn');
    const importFileInput = document.getElementById('importThemeFile');
    if (importFileBtn && importFileInput) {
      importFileBtn.addEventListener('click', () => {
        importFileInput.click();
      });

      importFileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
          const reader = new FileReader();
          reader.onload = (event) => {
            const result = this.importThemeFromJSON(event.target.result);
            if (result.success) {
              alert(`Theme "${result.name}" imported successfully!`);
            } else {
              alert(`Import failed: ${result.error}`);
            }
          };
          reader.readAsText(file);
          importFileInput.value = '';
        }
      });
    }

    // Export theme button
    const exportThemeBtn = document.getElementById('exportThemeBtn');
    if (exportThemeBtn) {
      exportThemeBtn.addEventListener('click', () => {
        const theme = this.exportCurrentTheme();
        const json = JSON.stringify(theme, null, 2);

        // Copy to clipboard
        navigator.clipboard.writeText(json).then(() => {
          alert('Theme JSON copied to clipboard!');
        }).catch(() => {
          // Fallback: download as file
          const blob = new Blob([json], { type: 'application/json' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = 'theme.json';
          a.click();
          URL.revokeObjectURL(url);
        });
      });
    }

    // Delete theme button
    const deleteThemeBtn = document.getElementById('deleteThemeBtn');
    if (deleteThemeBtn) {
      deleteThemeBtn.addEventListener('click', () => {
        const select = document.getElementById('customThemeSelect');
        if (select && select.value && this.savedThemes[select.value]) {
          const themeId = select.value;
          const themeName = this.savedThemes[themeId].name || themeId;
          if (!confirm(`Delete theme "${themeName}"?`)) return;
          delete this.savedThemes[themeId];
          this.updateCustomThemeDropdown();
          this.saveSettings();
        }
      });
    }
  }
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  window.app = new WebTerm();
});
