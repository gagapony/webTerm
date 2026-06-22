# Settings Panel Redesign - Design Spec

**Date:** 2026-06-17
**Status:** Approved
**Author:** Claude (Brainstorming Session)

---

## Overview

Redesign the WebTerm settings panel to support:
- Catppuccin theme system (4 variants + custom)
- Background image management (presets, upload, URL)
- Terminal transparency and glassmorphism effects
- Font size adjustment

## Requirements

### Functional Requirements

1. **Settings Panel Structure**
   - Two tabs: "Appearance" and "Background"
   - Consistent with existing "New Session" modal style
   - Settings button in top-right corner (already exists)

2. **Appearance Tab**
   - Theme selection: Catppuccin Mocha, Macchiato, Frappe, Latte
   - Custom theme colors (color pickers for base, text, accent, surface)
   - Font size slider (10px - 24px, default 14px)

3. **Background Tab**
   - Preset image grid (2x3 thumbnails)
   - User uploaded images (with delete button)
   - Upload button (drag & drop or click)
   - URL input field + Apply button
   - Terminal opacity slider (0-100%, default 85%)
   - Blur strength slider (0-20px, default 12px)

4. **Background Image Storage**
   - Upload to `/data/backgrounds/` directory
   - API endpoints for CRUD operations
   - Store metadata in SQLite database

5. **New Session Modal Optimization**
   - Align structure with Settings modal
   - Use consistent `compact-field` components
   - Match footer button layout

### Non-Functional Requirements

- Settings persisted in localStorage
- Background images stored on server
- Theme changes applied instantly via CSS variables
- Responsive design for mobile

---

## Architecture

### Component Structure

```
settingsModal
├── settings-header
│   ├── settings-copy (kicker, title)
│   └── settings-close-button
├── settings-tabs (NEW)
│   ├── tab-appearance
│   └── tab-background
├── settings-body
│   ├── tab-content-appearance (NEW)
│   │   ├── Theme selector (4 Catppuccin variants)
│   │   ├── Custom theme colors (conditional)
│   │   └── Font size slider
│   └── tab-content-background (NEW)
│       ├── Preset images grid
│       ├── Uploaded images grid
│       ├── Upload button
│       ├── URL input
│       ├── Terminal opacity slider
│       └── Blur strength slider
└── settings-footer
    ├── settings-footer-note
    └── settings-footer-actions (Cancel, Save)
```

### Data Flow

```
User Action → Update localStorage → Apply CSS Variables → UI Updates
                                    ↓
                          (Background images) → Server API → File Storage
```

---

## Theme System

### Catppuccin Color Palettes

| Variant | Base | Text | Accent | Surface0 | Surface1 |
|---------|------|------|--------|----------|----------|
| Mocha | #1e1e2e | #cdd6f4 | #89b4fa | #313244 | #45475a |
| Macchiato | #24273a | #cad3f5 | #8aadf4 | #363a4f | #494d64 |
| Frappe | #303446 | #c6d0f5 | #8caaee | #414559 | #51576d |
| Latte | #eff1f5 | #4c4f69 | #1e66f5 | #ccd0da | #bcc0cc |

### CSS Variables Implementation

```css
:root {
  /* Default (Mocha) */
  --ctp-base: #1e1e2e;
  --ctp-text: #cdd6f4;
  --ctp-accent: #89b4fa;
  --ctp-surface0: #313244;
  --ctp-surface1: #45475a;
  --ctp-surface2: #585b70;
  --ctp-overlay0: #6c7086;
  --ctp-overlay1: #7f849c;
  --ctp-overlay2: #9399b2;
  --ctp-green: #a6e3a1;
  --ctp-red: #f38ba8;
  --ctp-yellow: #f9e2af;
  --ctp-blue: #89b4fa;
}

[data-theme="catppuccin-macchiato"] {
  --ctp-base: #24273a;
  --ctp-text: #cad3f5;
  --ctp-accent: #8aadf4;
  /* ... */
}

[data-theme="catppuccin-frappe"] {
  --ctp-base: #303446;
  --ctp-text: #c6d0f5;
  --ctp-accent: #8caaee;
  /* ... */
}

[data-theme="catppuccin-latte"] {
  --ctp-base: #eff1f5;
  --ctp-text: #4c4f69;
  --ctp-accent: #1e66f5;
  /* ... */
}
```

### Custom Theme

When user selects "Custom", show color pickers:
- Background color
- Text color
- Accent color
- Surface color

Stored as:
```javascript
{
  theme: 'custom',
  customColors: {
    base: '#1a1b26',
    text: '#c0caf5',
    accent: '#7aa2f7',
    surface0: '#24283b'
  }
}
```

---

## Background Image System

### Storage Structure

```
data/
├── backgrounds/
│   ├── preset-mountain.jpg
│   ├── preset-ocean.jpg
│   └── preset-forest.jpg
└── webterm.db (backgrounds table)
```

### Database Schema

```sql
CREATE TABLE backgrounds (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  filename TEXT NOT NULL,
  original_name TEXT,
  mime_type TEXT,
  size INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/backgrounds` | List all backgrounds |
| POST | `/api/backgrounds/upload` | Upload image file |
| DELETE | `/api/backgrounds/:id` | Delete background |
| GET | `/backgrounds/:filename` | Serve image file |

### Upload Flow

1. User clicks upload or drags image
2. Frontend sends `POST /api/backgrounds/upload` with FormData
3. Server saves to `/data/backgrounds/{timestamp}-{filename}`
4. Server inserts record into database
5. Returns `{ id, filename, url }`
6. Frontend adds to grid

### UI Components

**Preset Images Grid:**
```html
<div class="bg-preset-grid">
  <div class="bg-preset-item" data-preset="mountain">
    <img src="/backgrounds/preset-mountain.jpg" alt="Mountain">
    <span>Mountain</span>
  </div>
  <!-- ... -->
</div>
```

**Uploaded Images Grid:**
```html
<div class="bg-uploaded-grid">
  <div class="bg-uploaded-item" data-id="1">
    <img src="/backgrounds/1718xxx-image.jpg" alt="image.jpg">
    <button class="bg-delete-btn">×</button>
  </div>
  <!-- ... -->
</div>
```

**Upload Area:**
```html
<div class="bg-upload-area">
  <input type="file" id="bgFileInput" accept="image/*" hidden>
  <button class="bg-upload-btn">Upload Image</button>
  <span class="bg-upload-hint">or drag & drop</span>
</div>
```

**URL Input:**
```html
<div class="bg-url-input">
  <input type="text" placeholder="Enter image URL..." class="toolbar-input">
  <button class="chrome-button">Apply</button>
</div>
```

---

## Transparency & Blur Effects

### Terminal Opacity

- CSS Variable: `--terminal-opacity`
- Range: 0 (fully transparent) to 1 (fully opaque)
- Default: 0.85

```css
.terminal-viewport {
  background: rgba(6, 11, 20, var(--terminal-opacity));
}
```

### Blur Strength (Glassmorphism)

- CSS Variable: `--blur-strength`
- Range: 0px to 20px
- Default: 12px

```css
.topbar,
.settings-modal .settings-dialog {
  backdrop-filter: blur(var(--blur-strength));
}
```

### Slider UI

```html
<div class="compact-field">
  <label class="toolbar-label">TERMINAL OPACITY</label>
  <div class="slider-container">
    <input type="range" min="0" max="100" value="85"
           id="opacitySlider" class="toolbar-input">
    <span class="slider-value" id="opacityValue">85%</span>
  </div>
</div>
```

---

## New Session Modal Alignment

### Changes Required

1. Update footer layout to match Settings modal
2. Use consistent `compact-field` styling
3. Add `settings-kicker` and `settings-subtitle` if missing

### Target Structure

```html
<div class="settings-modal" id="newSessionModal">
  <div class="settings-scrim"></div>
  <div class="settings-dialog">
    <div class="settings-header">
      <div class="settings-copy">
        <span class="settings-kicker">SESSION</span>
        <h2 class="settings-title">New Terminal Session</h2>
        <p class="settings-subtitle">Create a new SSH, Telnet, or local shell connection.</p>
      </div>
      <button class="settings-close-button">×</button>
    </div>
    <div class="settings-body">
      <!-- Form fields using compact-field -->
    </div>
    <div class="settings-footer">
      <p class="settings-footer-note"></p>
      <div class="settings-footer-actions">
        <button class="chrome-button">Save</button>
        <button class="chrome-button">Cancel</button>
        <button class="chrome-button is-primary">Connect</button>
      </div>
    </div>
  </div>
</div>
```

---

## Settings Persistence

### localStorage Schema

```javascript
{
  "webterm-settings": {
    "theme": "catppuccin-mocha",      // or "custom"
    "customColors": null,              // { base, text, accent, surface0 }
    "fontSize": 14,
    "backgroundImage": null,           // { type: "preset"|"uploaded"|"url", value: "..." }
    "terminalOpacity": 0.85,
    "blurStrength": 12
  }
}
```

### Load on Startup

```javascript
function loadSettings() {
  const saved = localStorage.getItem('webterm-settings');
  if (saved) {
    const settings = JSON.parse(saved);
    applyTheme(settings.theme, settings.customColors);
    applyFontSize(settings.fontSize);
    applyBackground(settings.backgroundImage);
    applyOpacity(settings.terminalOpacity);
    applyBlur(settings.blurStrength);
  }
}
```

### Save on Change

```javascript
function saveSettings() {
  const settings = {
    theme: currentTheme,
    customColors: currentCustomColors,
    fontSize: currentFontSize,
    backgroundImage: currentBackground,
    terminalOpacity: currentOpacity,
    blurStrength: currentBlur
  };
  localStorage.setItem('webterm-settings', JSON.stringify(settings));
}
```

---

## Implementation Checklist

- [ ] Add CSS variables for Catppuccin themes
- [ ] Create settings tabs UI component
- [ ] Implement Appearance tab
  - [ ] Theme selector
  - [ ] Custom theme color pickers
  - [ ] Font size slider
- [ ] Implement Background tab
  - [ ] Preset images grid
  - [ ] Upload functionality
  - [ ] URL input
  - [ ] Terminal opacity slider
  - [ ] Blur strength slider
- [ ] Create background API endpoints
- [ ] Create backgrounds database table
- [ ] Update New Session modal structure
- [ ] Add localStorage persistence
- [ ] Apply settings on page load

---

## Files to Modify

1. `public/index.html` - Update settings modal HTML
2. `public/css/term.css` - Add theme CSS variables and new styles
3. `public/js/app.js` - Add settings logic
4. `src/server.ts` - Add background API routes
5. `src/routes/backgrounds.ts` - New file for background routes

---

## Notes

- Remove recording-related code from session tabs (as requested)
- Ensure all sliders have real-time preview
- Background images should be lazy-loaded for performance
- Consider image size limits for uploads (e.g., 5MB)
