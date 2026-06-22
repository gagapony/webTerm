# Settings Panel Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the WebTerm settings panel to support Catppuccin themes, background images, transparency effects, and font size adjustment.

**Architecture:** Extend existing settings modal with tab-based navigation. Use CSS variables for theme switching. Store backgrounds on server with SQLite metadata. Persist user preferences in localStorage.

**Tech Stack:** HTML, CSS, JavaScript (vanilla), Express.js, SQLite (better-sqlite3), Multer (file upload)

---

## File Structure

```
webTerm/
├── public/
│   ├── index.html                    # Update settings modal HTML
│   ├── css/
│   │   └── term.css                  # Add theme CSS variables and new styles
│   ├── js/
│   │   └── app.js                    # Add settings logic
│   └── backgrounds/                  # NEW: Preset background images
│       ├── preset-mountain.jpg
│       ├── preset-ocean.jpg
│       └── preset-forest.jpg
├── src/
│   ├── server.ts                     # Add background API routes
│   └── routes/
│       └── backgrounds.ts            # NEW: Background CRUD routes
├── data/
│   └── backgrounds/                  # NEW: User uploaded backgrounds
└── docs/
    └── superpowers/
        ├── specs/
        │   └── 2026-06-17-settings-panel-redesign.md
        └── plans/
            └── 2026-06-17-settings-panel-redesign.md  # This file
```

---

## Task 1: Add Catppuccin Theme CSS Variables

**Files:**
- Modify: `public/css/term.css`

- [ ] **Step 1: Add CSS variables to :root**

Add the following CSS variables at the top of the `:root` selector in `term.css`:

```css
:root {
  /* Catppuccin Mocha (Default) */
  --ctp-rosewater: #f5e0dc;
  --ctp-flamingo: #f2cdcd;
  --ctp-pink: #f5c2e7;
  --ctp-mauve: #cba6f7;
  --ctp-red: #f38ba8;
  --ctp-maroon: #eba0ac;
  --ctp-peach: #fab387;
  --ctp-yellow: #f9e2af;
  --ctp-green: #a6e3a1;
  --ctp-teal: #94e2d5;
  --ctp-sky: #89dceb;
  --ctp-sapphire: #74c7ec;
  --ctp-blue: #89b4fa;
  --ctp-lavender: #b4befe;
  --ctp-text: #cdd6f4;
  --ctp-subtext1: #bac2de;
  --ctp-subtext0: #a6adc8;
  --ctp-overlay2: #9399b2;
  --ctp-overlay1: #7f849c;
  --ctp-overlay0: #6c7086;
  --ctp-surface2: #585b70;
  --ctp-surface1: #45475a;
  --ctp-surface0: #313244;
  --ctp-base: #1e1e2e;
  --ctp-mantle: #181825;
  --ctp-crust: #11111b;

  /* Theme-specific overrides */
  --bg: var(--ctp-base);
  --bg-top: var(--ctp-mantle);
  --panel: var(--ctp-surface0);
  --panel-2: var(--ctp-surface1);
  --panel-3: var(--ctp-surface2);
  --line: rgba(148, 163, 184, 0.14);
  --line-strong: rgba(148, 163, 184, 0.28);
  --text: var(--ctp-text);
  --muted: var(--ctp-overlay1);
  --accent: var(--ctp-blue);
  --accent-2: var(--ctp-sapphire);
  --success: var(--ctp-green);
  --warn: var(--ctp-yellow);
  --danger: var(--ctp-red);

  /* Transparency & Blur */
  --terminal-opacity: 0.85;
  --blur-strength: 12px;
}
```

- [ ] **Step 2: Add Macchiato theme variant**

Add the following CSS rule after `:root`:

```css
[data-theme="catppuccin-macchiato"] {
  --ctp-rosewater: #f4dbd6;
  --ctp-flamingo: #f0c6c6;
  --ctp-pink: #f5bde6;
  --ctp-mauve: #c6a0f6;
  --ctp-red: #ed8796;
  --ctp-maroon: #ee99a0;
  --ctp-peach: #f5a97f;
  --ctp-yellow: #eed49f;
  --ctp-green: #a6da95;
  --ctp-teal: #8bd5ca;
  --ctp-sky: #91d7e3;
  --ctp-sapphire: #7dc4e4;
  --ctp-blue: #8aadf4;
  --ctp-lavender: #b7bdf8;
  --ctp-text: #cad3f5;
  --ctp-subtext1: #b8c0e0;
  --ctp-subtext0: #a5adcb;
  --ctp-overlay2: #939ab7;
  --ctp-overlay1: #8087a2;
  --ctp-overlay0: #6e738d;
  --ctp-surface2: #5b6078;
  --ctp-surface1: #494d64;
  --ctp-surface0: #363a4f;
  --ctp-base: #24273a;
  --ctp-mantle: #1e2030;
  --ctp-crust: #181926;
}
```

- [ ] **Step 3: Add Frappe theme variant**

Add the following CSS rule after the Macchiato variant:

```css
[data-theme="catppuccin-frappe"] {
  --ctp-rosewater: #f2d5cf;
  --ctp-flamingo: #eebebe;
  --ctp-pink: #f4b8e4;
  --ctp-mauve: #ca9ee6;
  --ctp-red: #e78284;
  --ctp-maroon: #ea999c;
  --ctp-peach: #ef9f76;
  --ctp-yellow: #e5c890;
  --ctp-green: #a6d189;
  --ctp-teal: #81c8be;
  --ctp-sky: #99d1db;
  --ctp-sapphire: #85c1dc;
  --ctp-blue: #8caaee;
  --ctp-lavender: #babbf1;
  --ctp-text: #c6d0f5;
  --ctp-subtext1: #b5bfe2;
  --ctp-subtext0: #a5adce;
  --ctp-overlay2: #949cbb;
  --ctp-overlay1: #838ba7;
  --ctp-overlay0: #737994;
  --ctp-surface2: #626880;
  --ctp-surface1: #51576d;
  --ctp-surface0: #414559;
  --ctp-base: #303446;
  --ctp-mantle: #292c3c;
  --ctp-crust: #232634;
}
```

- [ ] **Step 4: Add Latte theme variant**

Add the following CSS rule after the Frappe variant:

```css
[data-theme="catppuccin-latte"] {
  --ctp-rosewater: #dc8a78;
  --ctp-flamingo: #dd7878;
  --ctp-pink: #ea76cb;
  --ctp-mauve: #8839ef;
  --ctp-red: #d20f39;
  --ctp-maroon: #e64553;
  --ctp-peach: #fe640b;
  --ctp-yellow: #df8e1d;
  --ctp-green: #40a02b;
  --ctp-teal: #179299;
  --ctp-sky: #04a5e5;
  --ctp-sapphire: #209fb5;
  --ctp-blue: #1e66f5;
  --ctp-lavender: #7287fd;
  --ctp-text: #4c4f69;
  --ctp-subtext1: #5c5f77;
  --ctp-subtext0: #6c6f85;
  --ctp-overlay2: #7c7f93;
  --ctp-overlay1: #8c8fa1;
  --ctp-overlay0: #9ca0b0;
  --ctp-surface2: #acb0be;
  --ctp-surface1: #bcc0cc;
  --ctp-surface0: #ccd0da;
  --ctp-base: #eff1f5;
  --ctp-mantle: #e6e9ef;
  --ctp-crust: #dce0e8;
}
```

- [ ] **Step 5: Update existing color references**

Find and replace hardcoded color values in `term.css` with CSS variables. Example:

```css
/* Before */
body {
  background: #060b14;
  color: #e6edf7;
}

/* After */
body {
  background: var(--bg);
  color: var(--text);
}
```

- [ ] **Step 6: Commit changes**

```bash
git add public/css/term.css
git commit -m "feat: add Catppuccin theme CSS variables"
```

---

## Task 2: Create Settings Tabs HTML Structure

**Files:**
- Modify: `public/index.html`

- [ ] **Step 1: Update settings modal HTML**

Replace the existing settings modal HTML (lines 230-271) with the new tabbed structure:

```html
<!-- Settings Modal -->
<div class="settings-modal" id="settingsModal" hidden>
  <div class="settings-scrim" id="settingsScrim"></div>
  <div class="settings-dialog">
    <div class="settings-header">
      <div class="settings-copy">
        <span class="settings-kicker">SETTINGS</span>
        <h2 class="settings-title">Settings</h2>
      </div>
      <button class="settings-close-button" id="settingsClose">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="18" y1="6" x2="6" y2="18"></line>
          <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>
      </button>
    </div>

    <!-- Settings Tabs -->
    <div class="settings-tabs">
      <button class="settings-tab is-active" data-tab="appearance">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="5"></circle>
          <line x1="12" y1="1" x2="12" y2="3"></line>
          <line x1="12" y1="21" x2="12" y2="23"></line>
          <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
          <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
          <line x1="1" y1="12" x2="3" y2="12"></line>
          <line x1="21" y1="12" x2="23" y2="12"></line>
          <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line>
          <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>
        </svg>
        <span>Appearance</span>
      </button>
      <button class="settings-tab" data-tab="background">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
          <circle cx="8.5" cy="8.5" r="1.5"></circle>
          <polyline points="21 15 16 10 5 21"></polyline>
        </svg>
        <span>Background</span>
      </button>
    </div>

    <div class="settings-body">
      <!-- Appearance Tab Content -->
      <div class="settings-tab-content is-active" data-tab-content="appearance">
        <!-- Theme Selection -->
        <div class="settings-section">
          <h3 class="settings-section-title">Theme</h3>
          <div class="theme-grid">
            <div class="theme-option is-active" data-theme="catppuccin-mocha">
              <div class="theme-preview" style="background: #1e1e2e;">
                <div class="theme-preview-accent" style="background: #89b4fa;"></div>
              </div>
              <span>Mocha</span>
            </div>
            <div class="theme-option" data-theme="catppuccin-macchiato">
              <div class="theme-preview" style="background: #24273a;">
                <div class="theme-preview-accent" style="background: #8aadf4;"></div>
              </div>
              <span>Macchiato</span>
            </div>
            <div class="theme-option" data-theme="catppuccin-frappe">
              <div class="theme-preview" style="background: #303446;">
                <div class="theme-preview-accent" style="background: #8caaee;"></div>
              </div>
              <span>Frappe</span>
            </div>
            <div class="theme-option" data-theme="catppuccin-latte">
              <div class="theme-preview" style="background: #eff1f5;">
                <div class="theme-preview-accent" style="background: #1e66f5;"></div>
              </div>
              <span>Latte</span>
            </div>
            <div class="theme-option" data-theme="custom">
              <div class="theme-preview theme-preview-custom">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <circle cx="12" cy="12" r="10"></circle>
                  <line x1="12" y1="8" x2="12" y2="16"></line>
                  <line x1="8" y1="12" x2="16" y2="12"></line>
                </svg>
              </div>
              <span>Custom</span>
            </div>
          </div>
        </div>

        <!-- Custom Theme Colors (hidden by default) -->
        <div class="settings-section custom-theme-section" hidden>
          <h3 class="settings-section-title">Custom Colors</h3>
          <div class="color-pickers-grid">
            <div class="compact-field">
              <label class="toolbar-label">BACKGROUND</label>
              <input type="color" class="toolbar-input color-picker" id="customBase" value="#1e1e2e">
            </div>
            <div class="compact-field">
              <label class="toolbar-label">TEXT</label>
              <input type="color" class="toolbar-input color-picker" id="customText" value="#cdd6f4">
            </div>
            <div class="compact-field">
              <label class="toolbar-label">ACCENT</label>
              <input type="color" class="toolbar-input color-picker" id="customAccent" value="#89b4fa">
            </div>
            <div class="compact-field">
              <label class="toolbar-label">SURFACE</label>
              <input type="color" class="toolbar-input color-picker" id="customSurface" value="#313244">
            </div>
          </div>
        </div>

        <!-- Font Size -->
        <div class="settings-section">
          <h3 class="settings-section-title">Font</h3>
          <div class="compact-field">
            <label class="toolbar-label">FONT SIZE</label>
            <div class="slider-container">
              <input type="range" class="toolbar-input" id="fontSizeSlider" min="10" max="24" value="14">
              <span class="slider-value" id="fontSizeValue">14px</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Background Tab Content -->
      <div class="settings-tab-content" data-tab-content="background">
        <!-- Preset Images -->
        <div class="settings-section">
          <h3 class="settings-section-title">Preset Images</h3>
          <div class="bg-preset-grid" id="bgPresetGrid">
            <!-- Populated by JavaScript -->
          </div>
        </div>

        <!-- Uploaded Images -->
        <div class="settings-section">
          <h3 class="settings-section-title">Uploaded Images</h3>
          <div class="bg-uploaded-grid" id="bgUploadedGrid">
            <!-- Populated by JavaScript -->
          </div>
          <div class="bg-upload-area" id="bgUploadArea">
            <input type="file" id="bgFileInput" accept="image/*" hidden>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
              <polyline points="17 8 12 3 7 8"></polyline>
              <line x1="12" y1="3" x2="12" y2="15"></line>
            </svg>
            <span>Upload Image</span>
            <small>or drag & drop</small>
          </div>
        </div>

        <!-- URL Input -->
        <div class="settings-section">
          <h3 class="settings-section-title">From URL</h3>
          <div class="bg-url-input">
            <input type="text" class="toolbar-input" id="bgUrlInput" placeholder="Enter image URL...">
            <button class="chrome-button" id="bgUrlApply">Apply</button>
          </div>
        </div>

        <!-- Transparency & Blur -->
        <div class="settings-section">
          <h3 class="settings-section-title">Effects</h3>
          <div class="compact-field">
            <label class="toolbar-label">TERMINAL OPACITY</label>
            <div class="slider-container">
              <input type="range" min="0" max="100" value="85" id="opacitySlider" class="toolbar-input">
              <span class="slider-value" id="opacityValue">85%</span>
            </div>
          </div>
          <div class="compact-field">
            <label class="toolbar-label">BLUR STRENGTH</label>
            <div class="slider-container">
              <input type="range" min="0" max="20" value="12" id="blurSlider" class="toolbar-input">
              <span class="slider-value" id="blurValue">12px</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="settings-footer">
      <p class="settings-footer-note"></p>
      <div class="settings-footer-actions">
        <button class="chrome-button" id="settingsCancel">Cancel</button>
        <button class="chrome-button is-primary" id="settingsSave">Save</button>
      </div>
    </div>
  </div>
</div>
```

- [ ] **Step 2: Add settings tab CSS styles**

Add the following CSS to `term.css`:

```css
/* Settings Tabs */
.settings-tabs {
  display: flex;
  gap: 4px;
  padding: 8px 20px 0;
  border-bottom: 1px solid var(--line);
}

.settings-tab {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  border: 1px solid transparent;
  border-bottom: 0;
  border-radius: 8px 8px 0 0;
  background: transparent;
  color: var(--muted);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
}

.settings-tab:hover {
  color: var(--text);
  background: rgba(255, 255, 255, 0.05);
}

.settings-tab.is-active {
  color: var(--accent);
  background: var(--panel);
  border-color: var(--line);
}

.settings-tab-content {
  display: none;
}

.settings-tab-content.is-active {
  display: block;
}

/* Theme Grid */
.theme-grid {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 10px;
}

.theme-option {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 10px;
  border: 2px solid var(--line);
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.theme-option:hover {
  border-color: var(--accent);
  background: rgba(255, 255, 255, 0.05);
}

.theme-option.is-active {
  border-color: var(--accent);
  background: rgba(137, 180, 250, 0.1);
}

.theme-preview {
  width: 100%;
  height: 40px;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.theme-preview-accent {
  width: 20px;
  height: 20px;
  border-radius: 50%;
}

.theme-preview-custom {
  background: linear-gradient(135deg, #1e1e2e, #89b4fa);
}

.theme-option span {
  font-size: 10px;
  font-weight: 600;
  color: var(--text);
}

/* Color Pickers Grid */
.color-pickers-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 10px;
}

.color-picker {
  height: 40px;
  padding: 4px;
  cursor: pointer;
}

/* Slider Container */
.slider-container {
  display: flex;
  align-items: center;
  gap: 10px;
}

.slider-container input[type="range"] {
  flex: 1;
  height: 6px;
}

.slider-value {
  min-width: 40px;
  text-align: right;
  font-size: 12px;
  font-weight: 600;
  color: var(--text);
}

/* Background Grid */
.bg-preset-grid,
.bg-uploaded-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
}

.bg-preset-item,
.bg-uploaded-item {
  position: relative;
  aspect-ratio: 16/9;
  border: 2px solid var(--line);
  border-radius: 8px;
  overflow: hidden;
  cursor: pointer;
  transition: all 0.2s ease;
}

.bg-preset-item:hover,
.bg-uploaded-item:hover {
  border-color: var(--accent);
}

.bg-preset-item.is-active,
.bg-uploaded-item.is-active {
  border-color: var(--accent);
  box-shadow: 0 0 0 2px rgba(137, 180, 250, 0.3);
}

.bg-preset-item img,
.bg-uploaded-item img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.bg-preset-item span {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  padding: 4px 8px;
  background: rgba(0, 0, 0, 0.7);
  color: white;
  font-size: 10px;
  font-weight: 600;
}

.bg-delete-btn {
  position: absolute;
  top: 4px;
  right: 4px;
  width: 20px;
  height: 20px;
  border: 0;
  border-radius: 50%;
  background: rgba(243, 139, 168, 0.8);
  color: white;
  font-size: 12px;
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.2s ease;
}

.bg-uploaded-item:hover .bg-delete-btn {
  opacity: 1;
}

/* Upload Area */
.bg-upload-area {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 20px;
  border: 2px dashed var(--line);
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.bg-upload-area:hover {
  border-color: var(--accent);
  background: rgba(137, 180, 250, 0.05);
}

.bg-upload-area svg {
  color: var(--muted);
}

.bg-upload-area span {
  font-size: 12px;
  font-weight: 600;
  color: var(--text);
}

.bg-upload-area small {
  font-size: 10px;
  color: var(--muted);
}

/* URL Input */
.bg-url-input {
  display: flex;
  gap: 10px;
}

.bg-url-input input {
  flex: 1;
}

/* Settings Section */
.settings-section {
  margin-bottom: 20px;
}

.settings-section-title {
  margin: 0 0 12px 0;
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--muted);
}
```

- [ ] **Step 3: Commit changes**

```bash
git add public/index.html public/css/term.css
git commit -m "feat: add settings tabs HTML structure and styles"
```

---

## Task 3: Implement Settings Tab Switching Logic

**Files:**
- Modify: `public/js/app.js`

- [ ] **Step 1: Add tab switching method to WebTerm class**

Add the following method to the `WebTerm` class:

```javascript
initSettingsTabs() {
  const tabs = document.querySelectorAll('.settings-tab');
  const contents = document.querySelectorAll('.settings-tab-content');

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const targetTab = tab.dataset.tab;

      // Update tab active states
      tabs.forEach(t => t.classList.remove('is-active'));
      tab.classList.add('is-active');

      // Update content visibility
      contents.forEach(content => {
        content.classList.toggle('is-active', content.dataset.tabContent === targetTab);
      });
    });
  });
}
```

- [ ] **Step 2: Add theme selection method**

Add the following method to the `WebTerm` class:

```javascript
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
    });
  });
}

applyTheme(theme) {
  if (theme === 'custom') {
    const base = document.getElementById('customBase')?.value || '#1e1e2e';
    const text = document.getElementById('customText')?.value || '#cdd6f4';
    const accent = document.getElementById('customAccent')?.value || '#89b4fa';
    const surface = document.getElementById('customSurface')?.value || '#313244';

    document.documentElement.style.setProperty('--ctp-base', base);
    document.documentElement.style.setProperty('--ctp-text', text);
    document.documentElement.style.setProperty('--ctp-accent', accent);
    document.documentElement.style.setProperty('--ctp-surface0', surface);
    document.documentElement.removeAttribute('data-theme');
  } else {
    document.documentElement.setAttribute('data-theme', theme);
    // Reset custom properties
    document.documentElement.style.removeProperty('--ctp-base');
    document.documentElement.style.removeProperty('--ctp-text');
    document.documentElement.style.removeProperty('--ctp-accent');
    document.documentElement.style.removeProperty('--ctp-surface0');
  }

  this.currentTheme = theme;
}
```

- [ ] **Step 3: Add custom theme color picker listeners**

Add the following method to the `WebTerm` class:

```javascript
initCustomThemePickers() {
  const pickers = ['customBase', 'customText', 'customAccent', 'customSurface'];

  pickers.forEach(id => {
    const picker = document.getElementById(id);
    if (picker) {
      picker.addEventListener('input', () => {
        if (this.currentTheme === 'custom') {
          this.applyTheme('custom');
        }
      });
    }
  });
}
```

- [ ] **Step 4: Add slider listeners**

Add the following method to the `WebTerm` class:

```javascript
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
```

- [ ] **Step 5: Add settings persistence methods**

Add the following methods to the `WebTerm` class:

```javascript
loadSettings() {
  const saved = localStorage.getItem('webterm-settings');
  if (saved) {
    const settings = JSON.parse(saved);

    // Apply theme
    if (settings.theme) {
      this.applyTheme(settings.theme);

      // Update UI
      const themeOption = document.querySelector(`[data-theme="${settings.theme}"]`);
      if (themeOption) {
        document.querySelectorAll('.theme-option').forEach(o => o.classList.remove('is-active'));
        themeOption.classList.add('is-active');
      }

      // Show custom section if needed
      const customThemeSection = document.querySelector('.custom-theme-section');
      if (customThemeSection) {
        customThemeSection.hidden = settings.theme !== 'custom';
      }
    }

    // Apply custom colors
    if (settings.customColors) {
      const { base, text, accent, surface0 } = settings.customColors;
      if (document.getElementById('customBase')) document.getElementById('customBase').value = base;
      if (document.getElementById('customText')) document.getElementById('customText').value = text;
      if (document.getElementById('customAccent')) document.getElementById('customAccent').value = accent;
      if (document.getElementById('customSurface')) document.getElementById('customSurface').value = surface0;
    }

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
}

saveSettings() {
  const settings = {
    theme: this.currentTheme || 'catppuccin-mocha',
    customColors: this.currentTheme === 'custom' ? {
      base: document.getElementById('customBase')?.value || '#1e1e2e',
      text: document.getElementById('customText')?.value || '#cdd6f4',
      accent: document.getElementById('customAccent')?.value || '#89b4fa',
      surface0: document.getElementById('customSurface')?.value || '#313244'
    } : null,
    fontSize: this.currentFontSize || 14,
    backgroundImage: this.currentBackground || null,
    terminalOpacity: this.currentOpacity !== undefined ? this.currentOpacity : 0.85,
    blurStrength: this.currentBlurStrength || 12
  };

  localStorage.setItem('webterm-settings', JSON.stringify(settings));
}
```

- [ ] **Step 6: Update init method to call new initializers**

Update the `init()` method in the `WebTerm` class:

```javascript
init() {
  log.info('WebTerm init called');
  this.bindElements();
  this.bindEvents();
  this.checkAuth();

  // Initialize settings
  this.currentTheme = 'catppuccin-mocha';
  this.currentFontSize = 14;
  this.currentOpacity = 0.85;
  this.currentBlurStrength = 12;
  this.currentBackground = null;

  this.initSettingsTabs();
  this.initThemeSelector();
  this.initCustomThemePickers();
  this.initSliders();
  this.loadSettings();
}
```

- [ ] **Step 7: Update settings save button**

Update the settings save button event listener in `bindEvents()`:

```javascript
settingsSave?.addEventListener('click', () => {
  log.info('Settings saved');
  this.saveSettings();
  this.hideSettingsModal();
});
```

- [ ] **Step 8: Commit changes**

```bash
git add public/js/app.js
git commit -m "feat: implement settings tab switching and persistence"
```

---

## Task 4: Create Background Image API Endpoints

**Files:**
- Create: `src/routes/backgrounds.ts`
- Modify: `src/server.ts`

- [ ] **Step 1: Install multer for file uploads**

```bash
npm install multer @types/multer
```

- [ ] **Step 2: Create backgrounds route file**

Create `src/routes/backgrounds.ts`:

```typescript
import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { db } from '../config';

const router = Router();

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../../data/backgrounds');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const timestamp = Date.now();
    const ext = path.extname(file.originalname);
    cb(null, `${timestamp}-${file.originalname}`);
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only JPEG, PNG, GIF, and WebP are allowed.'));
    }
  }
});

// Create backgrounds table if it doesn't exist
db.exec(`
  CREATE TABLE IF NOT EXISTS backgrounds (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    filename TEXT NOT NULL,
    original_name TEXT,
    mime_type TEXT,
    size INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

// GET /api/backgrounds - List all backgrounds
router.get('/', (req: Request, res: Response) => {
  try {
    const backgrounds = db.prepare('SELECT * FROM backgrounds ORDER BY created_at DESC').all();
    res.json(backgrounds);
  } catch (error) {
    console.error('Error fetching backgrounds:', error);
    res.status(500).json({ error: 'Failed to fetch backgrounds' });
  }
});

// POST /api/backgrounds/upload - Upload a new background
router.post('/upload', upload.single('image'), (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const { filename, originalname, mimetype, size } = req.file;

    const result = db.prepare(
      'INSERT INTO backgrounds (filename, original_name, mime_type, size) VALUES (?, ?, ?, ?)'
    ).run(filename, originalname, mimetype, size);

    res.json({
      id: result.lastInsertRowid,
      filename,
      original_name: originalname,
      url: `/backgrounds/${filename}`
    });
  } catch (error) {
    console.error('Error uploading background:', error);
    res.status(500).json({ error: 'Failed to upload background' });
  }
});

// DELETE /api/backgrounds/:id - Delete a background
router.delete('/:id', (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // Get the background record
    const background = db.prepare('SELECT * FROM backgrounds WHERE id = ?').get(id) as any;

    if (!background) {
      return res.status(404).json({ error: 'Background not found' });
    }

    // Delete the file
    const filePath = path.join(__dirname, '../../data/backgrounds', background.filename);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    // Delete the record
    db.prepare('DELETE FROM backgrounds WHERE id = ?').run(id);

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting background:', error);
    res.status(500).json({ error: 'Failed to delete background' });
  }
});

export default router;
```

- [ ] **Step 3: Update server.ts to use backgrounds route**

Add the following import and route to `src/server.ts`:

```typescript
import backgroundsRouter from './routes/backgrounds';

// ... existing code ...

// Add this line with other route registrations
app.use('/api/backgrounds', backgroundsRouter);

// Serve uploaded backgrounds
app.use('/backgrounds', express.static(path.join(__dirname, '../data/backgrounds')));
```

- [ ] **Step 4: Commit changes**

```bash
git add src/routes/backgrounds.ts src/server.ts package.json package-lock.json
git commit -m "feat: add background image upload API endpoints"
```

---

## Task 5: Implement Background Image Management UI

**Files:**
- Modify: `public/js/app.js`

- [ ] **Step 1: Add background management methods**

Add the following methods to the `WebTerm` class:

```javascript
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
    { id: 'mountain', name: 'Mountain', url: '/backgrounds/preset-mountain.jpg' },
    { id: 'ocean', name: 'Ocean', url: '/backgrounds/preset-ocean.jpg' },
    { id: 'forest', name: 'Forest', url: '/backgrounds/preset-forest.jpg' }
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
    <div class="bg-uploaded-item" data-id="${bg.id}" data-url="/backgrounds/${bg.filename}">
      <img src="/backgrounds/${bg.filename}" alt="${bg.original_name}" loading="lazy">
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

applyBackground(background) {
  if (!background) {
    document.body.style.backgroundImage = '';
    return;
  }

  const url = background.value || background;
  document.body.style.backgroundImage = `url(${url})`;
  document.body.style.backgroundSize = 'cover';
  document.body.style.backgroundPosition = 'center';
  document.body.style.backgroundAttachment = 'fixed';
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
```

- [ ] **Step 2: Update init method to call background initializers**

Update the `init()` method:

```javascript
init() {
  log.info('WebTerm init called');
  this.bindElements();
  this.bindEvents();
  this.checkAuth();

  // Initialize settings
  this.currentTheme = 'catppuccin-mocha';
  this.currentFontSize = 14;
  this.currentOpacity = 0.85;
  this.currentBlurStrength = 12;
  this.currentBackground = null;

  this.initSettingsTabs();
  this.initThemeSelector();
  this.initCustomThemePickers();
  this.initSliders();
  this.initBackgroundUpload();
  this.loadSettings();

  // Load backgrounds when settings modal opens
  this.settingsBtn?.addEventListener('click', () => {
    this.renderPresetBackgrounds();
    this.loadBackgrounds();
  });
}
```

- [ ] **Step 3: Add CSS for dragover state**

Add to `term.css`:

```css
.bg-upload-area.is-dragover {
  border-color: var(--accent);
  background: rgba(137, 180, 250, 0.1);
}

.bg-empty-message {
  grid-column: 1 / -1;
  text-align: center;
  padding: 20px;
  color: var(--muted);
  font-size: 12px;
}
```

- [ ] **Step 4: Create preset background images**

Create placeholder images for presets:

```bash
mkdir -p public/backgrounds
```

Create simple placeholder images or use actual images. For now, create a simple script to generate placeholder SVGs:

```bash
cat > public/backgrounds/preset-mountain.jpg << 'EOF'
[Placeholder for mountain background image]
EOF

cat > public/backgrounds/preset-ocean.jpg << 'EOF'
[Placeholder for ocean background image]
EOF

cat > public/backgrounds/preset-forest.jpg << 'EOF'
[Placeholder for forest background image]
EOF
```

Note: In production, replace these with actual background images.

- [ ] **Step 5: Commit changes**

```bash
git add public/js/app.js public/css/term.css public/backgrounds/
git commit -m "feat: implement background image management UI"
```

---

## Task 6: Update New Session Modal Structure

**Files:**
- Modify: `public/index.html`

- [ ] **Step 1: Update New Session modal HTML**

Update the New Session modal to match the Settings modal structure:

```html
<!-- New Session Modal -->
<div class="settings-modal" data-open="false" id="newSessionModal" hidden>
  <div class="settings-scrim" id="newSessionScrim"></div>
  <div class="settings-dialog">
    <div class="settings-header">
      <div class="settings-copy">
        <span class="settings-kicker">SESSION</span>
        <h2 class="settings-title">New Terminal Session</h2>
        <p class="settings-subtitle">Create a new SSH, Telnet, or local shell connection.</p>
      </div>
      <button class="settings-close-button" id="newSessionClose">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="18" y1="6" x2="6" y2="18"></line>
          <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>
      </button>
    </div>
    <div class="settings-body">
      <div class="settings-grid">
        <div class="compact-field">
          <label class="toolbar-label">CONNECTION NAME</label>
          <input type="text" class="toolbar-input" id="connectionName" placeholder="My Server" autocomplete="off">
        </div>
        <div class="settings-transport">
          <div class="settings-transport-copy">
            <span class="toolbar-label">PROTOCOL</span>
          </div>
          <div class="workspace-switcher">
            <button class="workspace-chip is-active" data-protocol="ssh">SSH</button>
            <button class="workspace-chip" data-protocol="telnet">Telnet</button>
            <button class="workspace-chip" data-protocol="local">Local</button>
          </div>
        </div>
        <div id="remoteFields">
          <div class="compact-field">
            <label class="toolbar-label">HOST</label>
            <input type="text" class="toolbar-input" id="sessionHost" placeholder="192.168.1.100" autocomplete="off">
          </div>
          <div class="compact-field">
            <label class="toolbar-label">PORT</label>
            <input type="number" class="toolbar-input" id="sessionPort" placeholder="22" autocomplete="off">
          </div>
          <div class="compact-field" id="usernameField">
            <label class="toolbar-label">USERNAME</label>
            <input type="text" class="toolbar-input" id="sessionUsername" placeholder="root" autocomplete="off">
          </div>
          <div class="compact-field" id="passwordField">
            <label class="toolbar-label">PASSWORD</label>
            <input type="password" class="toolbar-input" id="sessionPassword" placeholder="••••••••" autocomplete="off">
          </div>
        </div>
        <div id="localFields" style="display: none;">
          <div class="compact-field">
            <label class="toolbar-label">SHELL</label>
            <input type="text" class="toolbar-input" id="sessionShell" placeholder="/bin/bash" autocomplete="off">
          </div>
        </div>
      </div>
    </div>
    <div class="settings-footer">
      <p class="settings-footer-note" id="connectionStatus"></p>
      <div class="settings-footer-actions">
        <button class="chrome-button" id="saveConnectionBtn">Save</button>
        <button class="chrome-button" id="newSessionCancel">Cancel</button>
        <button class="chrome-button is-primary" id="connectBtn">Connect</button>
      </div>
    </div>
  </div>
</div>
```

- [ ] **Step 2: Commit changes**

```bash
git add public/index.html
git commit -m "refactor: update New Session modal to match Settings structure"
```

---

## Task 7: Remove Recording-Related Code

**Files:**
- Modify: `public/js/app.js`
- Modify: `public/css/term.css`

- [ ] **Step 1: Remove recording UI from session tabs**

In `app.js`, update the `updateSessionTabs()` method to remove recording button:

```javascript
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
```

- [ ] **Step 2: Remove recording CSS styles (optional)**

You can leave the recording CSS styles in place for future use, or remove them to reduce CSS size. The styles won't affect functionality.

- [ ] **Step 3: Commit changes**

```bash
git add public/js/app.js
git commit -m "refactor: remove recording UI from session tabs"
```

---

## Task 8: Final Testing and Cleanup

- [ ] **Step 1: Test theme switching**

1. Open the application
2. Click the Settings button
3. Switch between different Catppuccin themes
4. Verify colors change correctly
5. Test custom theme with color pickers
6. Save settings and refresh page to verify persistence

- [ ] **Step 2: Test background image upload**

1. Open Settings > Background tab
2. Click "Upload Image" and select an image
3. Verify image appears in uploaded grid
4. Click on the image to apply it as background
5. Refresh page to verify persistence

- [ ] **Step 3: Test transparency and blur**

1. Open Settings > Background tab
2. Adjust Terminal Opacity slider
3. Verify terminal background becomes transparent
4. Adjust Blur Strength slider
5. Verify topbar and modals have blur effect

- [ ] **Step 4: Test New Session modal**

1. Click "New Session" button
2. Verify modal structure matches Settings style
3. Test all protocol options
4. Verify form submission works

- [ ] **Step 5: Run build**

```bash
npm run build
```

Verify no TypeScript errors.

- [ ] **Step 6: Final commit**

```bash
git add -A
git commit -m "feat: complete settings panel redesign with Catppuccin themes"
```

---

## Summary

This implementation plan covers:

1. **Catppuccin Theme System** - 4 variants (Mocha, Macchiato, Frappe, Latte) + custom theme support
2. **Settings Tabs** - Appearance and Background tabs with proper switching
3. **Background Image Management** - Preset images, upload, URL input
4. **Transparency & Blur Effects** - Terminal opacity and glassmorphism
5. **Settings Persistence** - localStorage for user preferences
6. **New Session Modal Alignment** - Consistent structure with Settings
7. **Recording Removal** - Clean up unused recording UI

Total tasks: 8
Estimated time: 2-3 hours
