// Theme Manager - handles loading and applying CSS variable themes

class ThemeManager {
  constructor() {
    this.themes = new Map();
    this.currentTheme = null;
    this.currentTerminalTheme = null;
  }

  async init() {
    // Load available themes
    await this.loadThemes();

    // Load saved preference
    const savedTheme = localStorage.getItem('webterm-theme') || 'default';
    await this.applyTheme(savedTheme);
  }

  async loadThemes() {
    try {
      // Load default theme
      const defaultRes = await fetch('/themes/default.json');
      if (defaultRes.ok) {
        const defaultTheme = await defaultRes.json();
        this.themes.set('default', defaultTheme);
      }

      // Load catppuccin mocha
      const catppuccinRes = await fetch('/themes/catppuccin-mocha.json');
      if (catppuccinRes.ok) {
        const catppuccinTheme = await catppuccinRes.json();
        this.themes.set('catppuccin-mocha', catppuccinTheme);
      }
    } catch (err) {
      console.error('Failed to load themes:', err);
    }
  }

  getThemeList() {
    return Array.from(this.themes.values()).map(t => ({
      id: t.id,
      name: t.name
    }));
  }

  async applyTheme(themeId) {
    const theme = this.themes.get(themeId);
    if (!theme) {
      console.warn('Theme not found:', themeId);
      return;
    }

    // Apply CSS variables
    const root = document.documentElement;
    for (const [key, value] of Object.entries(theme.variables)) {
      root.style.setProperty(key, value);
    }

    this.currentTheme = themeId;
    this.currentTerminalTheme = theme.terminal;

    // Save preference
    localStorage.setItem('webterm-theme', themeId);

    console.log('Theme applied:', theme.name);
  }

  getTerminalTheme() {
    return this.currentTerminalTheme || {
      background: '#060b14',
      foreground: '#e6edf7',
      cursor: '#55c3ff',
      cursorAccent: '#060b14',
      selectionBackground: 'rgba(85, 195, 255, 0.3)'
    };
  }
}

// Export singleton
window.themeManager = new ThemeManager();
