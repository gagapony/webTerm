# 统一组件背景色

日期: 2026-06-18

## 目标

所有面板类组件（session bar、弹窗、下拉面板）统一使用 topbar 的背景公式：

```css
background:
    linear-gradient(
      180deg,
      color-mix(in srgb, var(--bg) calc(var(--terminal-opacity) * 100%), transparent),
      color-mix(in srgb, var(--bg-top) calc(var(--terminal-opacity) * 98%), transparent)),
    var(--bg);
backdrop-filter: blur(var(--blur-strength));
```

## 需要修改的组件

| 组件 | 当前值 | 改为 |
|------|--------|------|
| `.session-tabs-bar` | `--bg-top` 50% | topbar 公式 |
| `.status-dropdown` | `--bg` 96% | topbar 公式 |
| `.saved-connections-dropdown` (inline HTML) | 硬编码 `rgba(7,12,22,0.98)` | 移到 term.css，用 topbar 公式 |
| `.settings-dialog` | 渐变但第二停靠点是 `*96%` | 统一为 `*98%` |
| `.settings-scrim` | `--bg-top` 62% + blur 8px | `--bg-top` 85% + blur 12px |
| `.settings-footer` | `--bg-top` 72% | topbar 公式 |
| `.recording-menu` | `--bg-top` 渐变 ~98% | topbar 公式 |
| `.terminal-pane` | 需要检查 | topbar 公式 |

## 不修改

- `.compact-field`：输入框容器，不需要玻璃效果
- `.session-tab`：pill 形标签，保持当前设计
- `body.has-background` 下的覆盖：保持现有逻辑

## 涉及文件

- `public/css/term.css`：所有样式修改
- `public/index.html`：移除 saved-connections-dropdown 的 inline style
