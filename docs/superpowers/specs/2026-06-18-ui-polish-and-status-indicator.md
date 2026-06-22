# UI 圆角统一、按钮去蓝、状态指示器改造、Shell 自动检测

日期: 2026-06-18

## 概述

四项 UI/UX 改进：
1. 所有按钮、输入框、终端窗口统一使用 6px 圆角
2. 所有按钮去掉蓝色高亮，风格统一为中性面板背景
3. 连接状态从左上角文本改为右上角带颜色光晕的图标 + 下拉信息面板
4. Shell 路径自动检测，去掉写死的 `/bin/bash`

## 涉及文件

| 文件 | 改动类型 |
|------|----------|
| `public/css/term.css` | CSS 圆角、按钮样式、状态图标样式、下拉面板样式 |
| `public/index.html` | 移除 status-stack、添加状态图标按钮和下拉面板 HTML |
| `public/js/app.js` | 状态管理逻辑、下拉面板交互、shell 检测逻辑 |
| `src/protocols/local.ts` | 新增 shell 检测接口（返回实际使用的 shell 路径） |
| `src/routes/ws.ts` | 处理新消息类型或扩展 create 响应 |

## 1. 圆角统一为 6px

### 改动点

- `.toolbar-button`（`term.css` 约 1247 行）：`border-radius: 9px` → `6px`
- `.compact-field`（`term.css` 约 5104 行）：`border-radius: 14px` → `6px`
- `.terminal-frame`（`term.css` 约 1335 行）：`border-radius: 20px` → `6px`

### 不改动

- `.workspace-chip`：保持 pill 形状（完全圆角），这是协议选择器的设计语言
- `.session-tab`：保持 pill 形状，tab 标签需要保持当前设计

## 2. 按钮去掉蓝色高亮

### 当前问题

`.is-primary` 类使用 `--accent`（Catppuccin 蓝色）渐变背景，导致"连接"、"保存"等按钮呈现蓝色高亮。`.workspace-chip.is-active` 也使用 accent 渐变。

### 改动方案

**`.is-primary` 按钮**（`.chrome-button.is-primary`、`.toolbar-button.is-primary`）：
- 背景：从 accent 渐变改为与 `.is-secondary` 相同的面板背景 `color-mix(in srgb, var(--panel) 82%, transparent)`
- 边框：使用 `var(--line-strong)` 而非 accent 色
- 通过 `font-weight: 600` 区分主要操作

**`.workspace-chip.is-active`**：
- 从 accent 渐变改为面板背景 + 边框高亮
- 保持 `font-weight: 600` 表示选中状态

**统一按钮风格**：
- 所有按钮共享同一套背景/边框变量
- 主要操作通过字重区分，不用颜色区分
- 保持 hover 和 active 状态的微交互

## 3. 连接状态指示器

### 移除

- 从 `.masthead` 中移除 `.status-stack`（`statusHeadline` + `statusDetail`）
- 保留 masthead 中的品牌名称

### 新增

**状态图标按钮**（右上角工具栏，设置按钮左侧）：

```html
<button id="statusBtn" class="toolbar-button is-icon-only status-indicator" title="Connection Status">
  <span class="status-dot" id="statusDot"></span>
</button>
```

**状态颜色**：

| 状态 | 颜色 | 光晕 |
|------|------|------|
| 已连接 (Connected) | 绿色 `--ctp-green` | `box-shadow: 0 0 8px` |
| 连接中 (Connecting) | 蓝色 `--ctp-blue` | `box-shadow: 0 0 8px`，带脉冲动画 |
| 已断开 (Disconnected) | 红色 `--ctp-red` | `box-shadow: 0 0 8px` |
| 异常/错误 (Error) | 黄色 `--ctp-yellow` | `box-shadow: 0 0 8px` |

**下拉面板**（点击状态图标弹出）：

```html
<div id="statusDropdown" class="status-dropdown" hidden>
  <div class="status-dropdown-row">
    <span class="status-dropdown-label">状态</span>
    <span class="status-dropdown-value" id="dropdownState">已连接</span>
  </div>
  <div class="status-dropdown-row">
    <span class="status-dropdown-label">协议</span>
    <span class="status-dropdown-value" id="dropdownProtocol">Local Shell</span>
  </div>
  <div class="status-dropdown-row">
    <span class="status-dropdown-label">目标</span>
    <span class="status-dropdown-value" id="dropdownTarget">/bin/bash</span>
  </div>
  <div class="status-dropdown-row">
    <span class="status-dropdown-label">连接时间</span>
    <span class="status-dropdown-value" id="dropdownTime">14:32:05</span>
  </div>
</div>
```

- 样式：与 saved connections 下拉面板风格一致
- 定位：紧贴状态图标下方，右对齐
- 点击外部区域自动关闭

### JS 改动

- 移除所有 `this.statusHeadline.textContent = ...` 和 `this.statusDetail.textContent = ...` 调用
- 新增 `updateStatus(state, detail)` 方法，统一更新：
  - 状态图标的颜色 class（`status-connected`、`status-connecting`、`status-disconnected`、`status-error`）
  - 下拉面板中的各项值
  - 记录连接建立时间
- 状态图标按钮绑定 click 事件切换下拉面板显示/隐藏
- 点击面板外部关闭面板

## 4. Shell 自动检测

### 前端改动

**输入框 placeholder**（`index.html` 约 217 行）：
- 从 `placeholder="/bin/bash"` 改为 `placeholder="Auto-detect"`

**JS 发送逻辑**（`app.js` 约 476 行）：
- 只有用户手动输入了 shell 路径时才发送 `shell` 参数
- 空值时不发送，让后端自动检测

**状态面板显示**：
- 后端返回实际使用的 shell 路径，在下拉面板的"目标"行显示

### 后端改动

**`src/protocols/local.ts`**：
- `spawn()` 方法在确定 shell 后，通过回调或事件通知调用方实际使用的 shell 路径
- session-manager 在 `onSessionCreated` 响应中包含实际 shell 路径

**`src/routes/ws.ts`**：
- `create` 消息的响应中增加 `shell` 字段，返回实际使用的 shell 路径

**`src/services/session-manager.ts`**：
- `createLocalSession` 返回值中包含实际 shell 路径
- 通过 WebSocket 发送给前端

## 验收标准

1. 所有按钮、输入框、终端窗口圆角为 6px（协议选择器和 tab 保持 pill 形除外）
2. 没有任何按钮使用蓝色/accent 色渐变背景
3. 右上角状态图标颜色正确反映连接状态
4. 点击状态图标弹出下拉面板，显示当前连接信息
5. 下拉面板点击外部可关闭
6. Local Shell 不输入路径时自动检测系统 shell
7. placeholder 显示 "Auto-detect" 而非 "/bin/bash"
8. 所有主题下样式一致
