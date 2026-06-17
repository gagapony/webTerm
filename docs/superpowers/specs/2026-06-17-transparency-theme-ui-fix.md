# Transparency, Theme Sync & UI Fix - Design Spec

**Date:** 2026-06-17
**Status:** Approved
**Author:** Claude (Brainstorming Session)

---

## Overview

修复三个已知问题：

1. 背景图设置后，终端 UI 和状态栏不透明（透明度滑块无效）
2. Appearance 界面布局混乱，需要重新设计
3. 终端背景色纯黑，没有跟随主题色

## Root Cause Analysis

### Issue 1: Transparency Slider No-Op

`--terminal-opacity` 和 `--blur-strength` 被 JS 设置到 `:root`，但 CSS 中**没有任何规则引用这两个变量**。

受影响元素：
- `.topbar` (`term.css:519-533`) — 背景用硬编码 `97%/95%` 的 `color-mix()`
- `.terminal-frame` (`term.css:1336-1341`) — 背景用硬编码 `98%` 的 `color-mix()`
- `.xterm-viewport` — 背景色由 xterm.js 直接渲染，不经过 CSS 变量

### Issue 2: Appearance UI 结构问题

当前 Appearance tab 内容：
- 主题网格（5 个选项）— OK
- 7 个自定义颜色选择器 — 平铺无分组
- 主题管理（含大 textarea）— 占用过多空间
- 字体滑块 — 无预览

### Issue 3: Terminal 主题不同步

`app.js:446-460` 创建 Terminal 时硬编码：
```js
theme: { background: '#060b14', foreground: '#e6edf7', cursor: '#55c3ff', ... }
```

切换 Catppuccin 主题或自定义主题时，只更新了 CSS 变量（影响 UI chrome），**从未调用 `terminal.options.theme`** 更新终端内容颜色。

---

## Fix 1: Transparency & Blur

### 目标

让 `--terminal-opacity` 和 `--blur-strength` 真正控制 UI 的透明度和模糊效果。

### 实现

#### 1a. 顶部状态栏 `.topbar`

```css
/* 当前 (term.css:519-533) */
.topbar {
  background:
    linear-gradient(180deg,
      color-mix(in srgb, var(--bg) 97%, transparent),
      color-mix(in srgb, var(--bg-top) 95%, transparent)),
    var(--bg);
  backdrop-filter: blur(14px);
}

/* 改为 */
.topbar {
  background:
    linear-gradient(180deg,
      color-mix(in srgb, var(--bg) calc(var(--terminal-opacity) * 100%), transparent),
      color-mix(in srgb, var(--bg-top) calc(var(--terminal-opacity) * 98%), transparent)),
    var(--bg);
  backdrop-filter: blur(var(--blur-strength));
}
```

#### 1b. 终端框架 `.terminal-frame`

```css
/* 当前 (term.css:1336-1341) */
.terminal-frame {
  background:
    linear-gradient(180deg,
      color-mix(in srgb, var(--bg) 98%, transparent),
      color-mix(in srgb, var(--bg-top) 98%, transparent)),
    var(--bg-top);
}

/* 改为 */
.terminal-frame {
  background:
    linear-gradient(180deg,
      color-mix(in srgb, var(--bg) calc(var(--terminal-opacity) * 100%), transparent),
      color-mix(in srgb, var(--bg-top) calc(var(--terminal-opacity) * 100%), transparent)),
    var(--bg-top);
  backdrop-filter: blur(var(--blur-strength));
}
```

#### 1c. xterm 视口透明

当有背景图时，`.xterm-viewport` 需要透明，让 body 背景图透出：

```css
/* 新增规则 */
body.has-background .xterm-viewport {
  background: transparent !important;
}
```

JS 端在 `applyBackground()` 中切换 `body` 的 `has-background` class：

```js
applyBackground(background) {
  if (!background) {
    document.body.style.backgroundImage = '';
    document.body.classList.remove('has-background');
    return;
  }
  const url = background.value || background;
  document.body.style.backgroundImage = `url(${url})`;
  document.body.style.backgroundSize = 'cover';
  document.body.style.backgroundPosition = 'center';
  document.body.style.backgroundAttachment = 'fixed';
  document.body.classList.add('has-background');
}
```

#### 1d. 终端框架在有背景图时也变透明

```css
body.has-background .terminal-frame {
  backdrop-filter: blur(var(--blur-strength));
}
```

### 影响范围

- `public/css/term.css` — 修改 `.topbar`、`.terminal-frame`，新增 `.has-background` 相关规则
- `public/js/app.js` — 修改 `applyBackground()` 添加/移除 `has-background` class

---

## Fix 2: Appearance 界面重设计

### 目标

重新组织 Appearance tab 的布局，建立清晰的视觉层次。

### 设计方案

#### 分区结构

```
┌─────────────────────────────────────┐
│  SECTION: Theme                     │
│  ┌─────┬─────┬─────┬─────┬───────┐ │
│  │Mocha│Macch│Frap │Latte│Custom │ │
│  │  ●  │  ●  │  ●  │  ●  │  🎨  │ │
│  └─────┴─────┴─────┴─────┴───────┘ │
│                                     │
│  ┌─ Custom Colors (展开区) ────────┐ │
│  │ Background  [■]  Text     [■]  │ │
│  │ Accent      [■]  Surface0 [■]  │ │
│  │ Surface1    [■]  Overlay0 [■]  │ │
│  │ Overlay1    [■]               │ │
│  └────────────────────────────────┘ │
│                                     │
│  SECTION: Saved Themes              │
│  ┌──────────────────────────┬──┬──┐ │
│  │ My Dark Theme       ▼   │📥│📤│ │
│  └──────────────────────────┴──┴──┘ │
│  [Save Current] [Import File]       │
│                                     │
│  SECTION: Font                      │
│  ═══════════●═══════ 14px           │
│  AaBbCcDd 0123 (预览)              │
└─────────────────────────────────────┘
```

#### 具体改动

**主题网格** — 保持现有 5 选项，每个选项内加色块预览圆点

**自定义颜色** — 折叠为 `<details>` 元素，仅在选中 Custom 时展开
- 分两列布局：左列为背景类（Background, Surface0, Surface1），右列为文字/强调类（Text, Accent, Overlay0, Overlay1）
- 每个 picker 旁加 hex 值显示

**主题管理** — 精简为：
- 一行：下拉选择已保存主题 + 删除按钮 + 导出按钮
- 一行：[Save Current Theme] 按钮 + [Import] 按钮
- 导入功能改为 `<input type="file">` 直接选文件，干掉 textarea

**字体** — 保留滑块，下方加一行预览文字 `"AaBbCc 0123 !@#"`

### 影响范围

- `public/index.html` — 重写 `#tab-appearance` 内部结构
- `public/css/term.css` — 新增/修改 settings section 相关样式
- `public/js/app.js` — 适配新的 DOM 结构（选择器变化）

---

## Fix 3: Terminal 主题同步

### 目标

切换主题时，终端内容颜色（包括背景色）同步更新。

### Catppuccin → xterm 映射表

每个 Catppuccin 变体需要映射到 xterm theme 对象：

```js
const XTERM_THEMES = {
  'catppuccin-mocha': {
    background: '#1e1e2e',     // ctp-base
    foreground: '#cdd6f4',     // ctp-text
    cursor: '#f5e0dc',         // ctp-rosewater
    cursorAccent: '#1e1e2e',   // ctp-base
    selectionBackground: 'rgba(88, 91, 112, 0.4)', // ctp-surface2
    // ANSI 16 色
    black:   '#45475a',  red:     '#f38ba8',
    green:   '#a6e3a1',  yellow:  '#f9e2af',
    blue:    '#89b4fa',  magenta: '#f5c2e7',
    cyan:    '#94e2d5',  white:   '#bac2de',
    brightBlack: '#585b70',  brightRed:     '#f38ba8',
    brightGreen: '#a6e3a1',  brightYellow:  '#f9e2af',
    brightBlue:  '#89b4fa',  brightMagenta: '#f5c2e7',
    brightCyan:  '#94e2d5',  brightWhite:   '#a6adc8',
  },
  'catppuccin-macchiato': {
    background: '#24273a',
    foreground: '#cad3f5',
    cursor: '#f4dbd6',
    cursorAccent: '#24273a',
    selectionBackground: 'rgba(73, 77, 100, 0.4)',
    black: '#494d64', red: '#ed8796', green: '#a6da95', yellow: '#eed49f',
    blue: '#8aadf4', magenta: '#f5bde6', cyan: '#8bd5ca', white: '#b8c0e0',
    brightBlack: '#5b6078', brightRed: '#ed8796', brightGreen: '#a6da95',
    brightYellow: '#eed49f', brightBlue: '#8aadf4', brightMagenta: '#f5bde6',
    brightCyan: '#8bd5ca', brightWhite: '#a5adcb',
  },
  'catppuccin-frappe': {
    background: '#303446',
    foreground: '#c6d0f5',
    cursor: '#f2d5cf',
    cursorAccent: '#303446',
    selectionBackground: 'rgba(81, 87, 109, 0.4)',
    black: '#51576d', red: '#e78284', green: '#a6d189', yellow: '#e5c890',
    blue: '#8caaee', magenta: '#f4b8e4', cyan: '#81c8be', white: '#b5bfe2',
    brightBlack: '#626880', brightRed: '#e78284', brightGreen: '#a6d189',
    brightYellow: '#e5c890', brightBlue: '#8caaee', brightMagenta: '#f4b8e4',
    brightCyan: '#81c8be', brightWhite: '#a5adce',
  },
  'catppuccin-latte': {
    background: '#eff1f5',
    foreground: '#4c4f69',
    cursor: '#dc8a78',
    cursorAccent: '#eff1f5',
    selectionBackground: 'rgba(188, 192, 204, 0.4)',
    black: '#bcc0cc', red: '#d20f39', green: '#40a02b', yellow: '#df8e1d',
    blue: '#1e66f5', magenta: '#ea76cb', cyan: '#179299', white: '#5c5f77',
    brightBlack: '#acb0be', brightRed: '#d20f39', brightGreen: '#40a02b',
    brightYellow: '#df8e1d', brightBlue: '#1e66f5', brightMagenta: '#ea76cb',
    brightCyan: '#179299', brightWhite: '#6c6f85',
  },
};
```

### 自定义主题的 xterm 派生

当用户选 Custom 主题时，从 7 个用户选择的颜色派生 xterm theme：

```js
function deriveXtermTheme(colors) {
  return {
    background: colors.base,
    foreground: colors.text,
    cursor: colors.accent,
    cursorAccent: colors.base,
    selectionBackground: `${colors.surface1}66`, // 加 40% alpha
    // ANSI 色：从已选颜色中近似推导
    black: colors.surface1,    red: '#f38ba8',
    green: '#a6e3a1',          yellow: '#f9e2af',
    blue: colors.accent,       magenta: '#f5c2e7',
    cyan: '#94e2d5',           white: colors.overlay1,
    brightBlack: colors.surface2, brightRed: '#f38ba8',
    brightGreen: '#a6e3a1',    brightYellow: '#f9e2af',
    brightBlue: colors.accent, brightMagenta: '#f5c2e7',
    brightCyan: '#94e2d5',     brightWhite: colors.overlay0,
  };
}
```

### 背景图模式下的透明终端

当 `body.has-background` 存在时，xterm background 设为 transparent：

```js
function applyTerminalTheme(themeName, customColors) {
  let theme;
  if (themeName === 'custom' && customColors) {
    theme = deriveXtermTheme(customColors);
  } else {
    theme = XTERM_THEMES[themeName] || XTERM_THEMES['catppuccin-mocha'];
  }

  // 有背景图时，终端背景透明
  if (document.body.classList.contains('has-background')) {
    theme = { ...theme, background: 'transparent' };
  }

  terminal.options.theme = theme;
}
```

### 调用时机

在以下时机调用 `applyTerminalTheme()`：
- 主题切换时（`applyTheme()` 和 `applyCustomThemeFromColors()`）
- 背景图变化时（`applyBackground()`）
- 页面加载时（`loadSettings()`）

### 影响范围

- `public/js/app.js` — 新增 `XTERM_THEMES` 映射、`deriveXtermTheme()`、`applyTerminalTheme()`；修改 `applyTheme()`、`applyCustomThemeFromColors()`、`applyBackground()`、`loadSettings()`

---

## Files to Modify

| File | Changes |
|------|---------|
| `public/css/term.css` | `.topbar` 和 `.terminal-frame` 使用 `--terminal-opacity` 和 `--blur-strength`；新增 `.has-background` 相关规则 |
| `public/index.html` | 重写 `#tab-appearance` 内部 HTML 结构 |
| `public/js/app.js` | `applyBackground()` 添加 class 切换；新增 xterm 主题同步逻辑；适配新 DOM 结构 |

---

## Notes

- 三个修复互相独立，可分别实现和测试
- `--terminal-opacity` 有效范围：0（全透明）到 1（全不透明）
- `--blur-strength` 有效范围：0px 到 20px
- xterm.js 的 `background: 'transparent'` 需要 xterm v5+ 支持
- Latte 是浅色主题，xterm 色板需要特别处理（已包含在映射表中）
