// WebTerm Frontend Application
const log = window.logger || console;

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
    this.statusHeadline = document.getElementById('statusHeadline');
    this.statusDetail = document.getElementById('statusDetail');

    // Terminal
    this.terminalViewport = document.getElementById('terminalViewport');
    this.sessionTabs = document.getElementById('sessionTabs');
    this.sessionTabsBar = document.getElementById('sessionTabsBar');

    // Form fields
    this.connectionName = document.getElementById('connectionName');
    this.remoteFields = document.getElementById('remoteFields');
    this.localFields = document.getElementById('localFields');
    this.sessionHost = document.getElementById('sessionHost');
    this.sessionPort = document.getElementById('sessionPort');
    this.sessionUsername = document.getElementById('sessionUsername');
    this.sessionPassword = document.getElementById('sessionPassword');
    this.sessionShell = document.getElementById('sessionShell');

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
      this.hideSettingsModal();
    });

    // Font size slider
    const fontSizeSlider = document.getElementById('fontSizeSlider');
    const fontSizeValue = document.getElementById('fontSizeValue');
    fontSizeSlider?.addEventListener('input', (e) => {
      const size = e.target.value;
      if (fontSizeValue) fontSizeValue.textContent = `${size}px`;
      document.documentElement.style.setProperty('--font-size', `${size}px`);
      // Update all terminals
      this.terminals.forEach(t => {
        if (t.terminal) t.terminal.options.fontSize = parseInt(size);
      });
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

    // Protocol selection
    this.protocolBtns?.forEach(btn => {
      btn.addEventListener('click', () => this.selectProtocol(btn.dataset.protocol));
    });

    // Close dropdown on outside click
    document.addEventListener('click', (e) => {
      if (this.savedConnDropdown && !this.savedConnDropdown.contains(e.target) && e.target !== this.savedConnBtn) {
        this.savedConnDropdown.hidden = true;
      }
    });

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this.hideNewSessionModal();
        if (this.savedConnDropdown) this.savedConnDropdown.hidden = true;
      }
    });
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

    this.statusHeadline.textContent = 'Connecting...';
    this.statusDetail.textContent = wsUrl;

    this.ws = new WebSocket(wsUrl);

    this.ws.onopen = () => {
      console.log('WebSocket connected');
      this.statusHeadline.textContent = 'Connected';
      this.statusDetail.textContent = 'Ready';
      // Auto-connect local shell
      this.autoConnectLocal();
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
      this.statusHeadline.textContent = 'Disconnected';
      this.statusDetail.textContent = 'Reconnecting...';
      setTimeout(() => {
        if (this.isLoggedIn) this.connectWebSocket();
      }, 3000);
    };

    this.ws.onerror = (err) => {
      console.error('WebSocket error:', err);
    };
  }

  autoConnectLocal() {
    this.ws.send(JSON.stringify({
      type: 'create',
      protocol: 'local',
      cols: 80,
      rows: 24,
    }));
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
    }
  }

  hideSettingsModal() {
    log.info('hideSettingsModal called');
    const modal = document.getElementById('settingsModal');
    if (modal) {
      modal.setAttribute('hidden', '');
      modal.style.display = 'none';
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

    if (protocol === 'local') {
      this.remoteFields.style.display = 'none';
      this.localFields.style.display = 'block';
    } else {
      this.remoteFields.style.display = 'block';
      this.localFields.style.display = 'none';
      this.sessionPort.placeholder = protocol === 'ssh' ? '22' : '23';
    }
  }

  createSessionFromModal() {
    const options = {
      type: 'create',
      protocol: this.selectedProtocol,
      cols: 80,
      rows: 24,
    };

    if (this.selectedProtocol === 'local') {
      options.shell = this.sessionShell.value || '/bin/bash';
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

  onSessionCreated(sessionId, protocol) {
    this.createTerminal(sessionId, protocol);

    const host = this.sessionHost.value || 'local';
    this.statusHeadline.textContent = 'Connected';
    this.statusDetail.textContent = protocol === 'local' ? 'Local Shell' : `${host}:${this.sessionPort.value || 22}`;

    // Clear form
    if (this.connectionName) this.connectionName.value = '';
    this.sessionHost.value = '';
    this.sessionPort.value = '';
    this.sessionUsername.value = '';
    this.sessionPassword.value = '';
  }

  createTerminal(sessionId, protocol) {
    const terminal = new Terminal({
      theme: {
        background: '#060b14',
        foreground: '#e6edf7',
        cursor: '#55c3ff',
        cursorAccent: '#060b14',
        selectionBackground: 'rgba(85, 195, 255, 0.3)',
      },
      fontFamily: '"MonaspiceAr NFM Medium", "MonaspiceAr NFM", monospace',
      fontSize: 14,
      lineHeight: 1.2,
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

    setTimeout(() => fitAddon.fit(), 100);

    // Store terminal
    this.terminals.set(sessionId, {
      terminal,
      fitAddon,
      protocol,
      container,
    });

    this.activeSessionId = sessionId;

    // Handle input
    terminal.onData((data) => {
      if (this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: 'input', sessionId, data }));
      }
    });

    // Handle resize
    terminal.onResize(({ cols, rows }) => {
      if (this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: 'resize', sessionId, cols, rows }));
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
    this.statusHeadline.textContent = 'Disconnected';
  }

  onSessionError(sessionId, message) {
    console.error('Session error:', message);
    this.statusHeadline.textContent = 'Error';
    this.statusDetail.textContent = message;

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
            <span class="session-tab-title">${session.protocol.toUpperCase()}</span>
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
      this.statusHeadline.textContent = 'Ready';
      this.statusDetail.textContent = 'Click + to connect';
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
      const icon = conn.protocol === 'ssh' ? '🔒' : conn.protocol === 'telnet' ? '📡' : '💻';
      return `
        <div class="saved-connection-item" data-connection-id="${conn.id}">
          <div class="saved-connection-icon">${icon}</div>
          <div class="saved-connection-info">
            <div class="saved-connection-name">${this.escapeHtml(conn.name)}</div>
            <div class="saved-connection-meta">${conn.protocol.toUpperCase()} • ${conn.host || 'local'}${conn.port ? ':' + conn.port : ''}</div>
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
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  window.app = new WebTerm();
});
