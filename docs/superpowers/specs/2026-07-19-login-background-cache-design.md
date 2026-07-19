# 登录页背景图缓存优化 — 设计文档

**日期**: 2026-07-19
**状态**: 已批准
**影响范围**: `src/server.ts`, `public/index.html`

## 问题陈述

当前登录页面（及登录后的应用页面）每次刷新都会重新下载所有静态资源，
尤其是用户上传的背景图（位于 `/data/backgrounds/`，单文件 1–4 MB）。
这给浏览器和网络带来不必要的压力，导致：

1. 登录页打开速度慢，背景图延迟出现。
2. 每次刷新产生数 MB 的重复网络流量。
3. 服务器带宽被无谓消耗。

## 根因分析

通过代码审查发现三个独立成因：

### 成因 1：静态资源统一的 no-cache 策略

`src/server.ts:31-39`：

```ts
const staticOpts = {
  etag: true,
  lastModified: true,
  maxAge: 0,
  setHeaders: (res: Response) => {
    res.setHeader('Cache-Control', 'no-cache');
  },
};
app.use(express.static(path.join(process.cwd(), 'public'), staticOpts));
```

`setHeaders` 对**所有**静态文件（HTML、JS、CSS、字体、图片、favicon）
统一设置 `Cache-Control: no-cache`，未按资源类型区分。

### 成因 2：index.html 中的激进 meta 缓存指令

`public/index.html:13-14`：

```html
<meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate">
<meta http-equiv="Pragma" content="no-cache">
```

这两个 `<meta http-equiv>` 标签会指示浏览器在加载页面及其子资源时
**完全跳过缓存**（`no-store` 比 `no-cache` 更激进，禁止任何缓存存储）。
它与真正的 HTTP 响应头冲突，且语义过于宽泛。

### 成因 3：上传背景目录无缓存配置

`src/server.ts:46`：

```ts
app.use('/backgrounds', express.static(path.join(__dirname, '../data/backgrounds')));
```

未传任何 `staticOpts`，意味着 Express 默认行为（无 `Cache-Control`），
浏览器只能依赖启发式缓存，行为不可预测。

### 登录页背景加载路径

尽管问题主要在缓存策略，理解登录页为什么会加载大图很重要：

- `src/routes/api.ts:100` 的 `GET /api/settings` **没有 `requireAuth`**。
- `public/js/app.js:154` 在初始化时即调用 `loadSettings()`。
- `applySettings()` 在 `app.js:1291` 调用 `applyBackground(settings.backgroundImage)`。
- `applyBackground()` 在 `app.js:1658` 设置 `document.body.style.backgroundImage`。

因此**登录页（未登录状态）也会加载已保存的背景图**。这是预期行为
（用户已确认保留），只需保证浏览器能缓存。

## 目标与非目标

### 目标

1. 让浏览器永久缓存不变的静态资源（图片、字体、带版本号的 JS/CSS）。
2. HTML 入口文件保持每次重新验证（`no-cache` + ETag → 304）。
3. 修改后用户首次刷新即可生效，零数据迁移。

### 非目标

- 不改变上传文件名生成策略（已含 `Date.now()` 时间戳，天然唯一）。
- 不修改 DB schema、URL 设计、前端代码。
- 不引入构建步骤（内容哈希文件名）。
- 不改变登录页是否显示背景图（保留显示）。

## 设计：分层缓存策略

### 按资源类型分发 Cache-Control

| 资源类型 | Cache-Control 响应头 | 理由 |
|---------|---------------------|------|
| `/index.html` | `no-cache` | 入口文件需感知新版本；ETag 让条件请求 304 |
| JS / CSS（URL 含 `?v=N`） | `public, max-age=31536000, immutable` | 已有手动版本号，文件变更会 bump |
| 字体 `.otf` / `.woff2` | `public, max-age=31536000, immutable` | 文件名不变 |
| 背景图 `.png/.jpg/.jpeg/.webp/.gif/.svg` | `public, max-age=31536000, immutable` | 上传 URL 含时间戳，预设 SVG 极少变 |
| favicon `.ico/.svg/.png` | `public, max-age=86400` | 已有 `?v=2`，1 天折中（Chrome favicon 缓存特殊） |
| 其他默认 | `no-cache` | 保守策略，保留 ETag 验证 |

`immutable` 关键字告诉浏览器：资源在 `max-age` 期内不会变，
**即使用户按 F5 刷新也不发条件请求**。这是节省带宽的关键。

### 修改 1：`src/server.ts` — `setHeaders` 函数

把固定 `no-cache` 改为根据请求路径扩展名分发：

```ts
const STATIC_MAX_AGE = 31536000; // 1 year

function setStaticCacheHeaders(res: Response, filePath: string) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.html') {
    res.setHeader('Cache-Control', 'no-cache');
    return;
  }
  if (['.js', '.css', '.otf', '.woff', '.woff2', '.ttf'].includes(ext)) {
    res.setHeader('Cache-Control', `public, max-age=${STATIC_MAX_AGE}, immutable`);
    return;
  }
  if (['.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg'].includes(ext)) {
    res.setHeader('Cache-Control', `public, max-age=${STATIC_MAX_AGE}, immutable`);
    return;
  }
  if (['.ico'].includes(ext)) {
    res.setHeader('Cache-Control', 'public, max-age=86400');
    return;
  }
  res.setHeader('Cache-Control', 'no-cache');
}
```

注意：Express 的 `express.static` 在 `setHeaders(res, path, stat)` 回调中
会传入完整文件路径，可直接用 `path.extname()` 判断。

### 修改 2：`public/index.html` — 移除 meta http-equiv

删除 `:13-14` 两行：

```html
<!-- 删除 -->
<meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate">
<meta http-equiv="Pragma" content="no-cache">
```

响应头已由 `server.ts` 控制，meta 标签冗余且有害。

### 修改 3：`server.ts:46` — 上传背景目录的缓存头

把 `express.static(path.join(__dirname, '../data/backgrounds'))` 改为
传入与 `public` 一致的 `staticOpts`（含相同的 `setStaticCacheHeaders` 函数
和 `etag: true, lastModified: true`）。

由于上传文件名含 `Date.now()` 时间戳，同名重传不会发生 —— 每次上传都是新 URL，
`immutable` 完全安全。

## 实现细节

### `staticOpts` 结构（修改后）

```ts
const staticOpts = {
  etag: true,
  lastModified: true,
  maxAge: 0, // 由 setHeaders 显式控制
  setHeaders: (res: Response, filePath: string) => {
    setStaticCacheHeaders(res, filePath);
  },
};
```

`maxAge: 0` 保留，因为 `setHeaders` 会显式覆盖。Express 的 `maxAge` 选项
只是设置默认 `Cache-Control`，被 `setHeaders` 覆盖后无效。

### 预设 SVG 更新流程

预设 SVG 文件（`/backgrounds/preset-*.svg`）URL 不带版本号。
若未来更新内容，需要手动 bump `index.html` 中的 `?v=N`（目前 favicon 已用此模式）。
这是已知约束，但发生频率极低，可接受。

## 验证计划

### 命令行验证

```bash
# 1. HTML 应为 no-cache
curl -I http://localhost:3000/
# 期望: cache-control: no-cache

# 2. 首次请求图片 — 应为 immutable 长缓存 + ETag
curl -I http://localhost:3000/backgrounds/preset-forest.svg
# 期望: cache-control: public, max-age=31536000, immutable
#       etag: "..."

# 3. 条件请求 — 应返回 304
curl -I -H "If-None-Match: <上一步的 etag>" http://localhost:3000/backgrounds/preset-forest.svg
# 期望: HTTP/1.1 304 Not Modified
#       响应体为空

# 4. JS 应为 immutable
curl -I "http://localhost:3000/js/app.js?v=12"
# 期望: cache-control: public, max-age=31536000, immutable
```

### 浏览器验证

1. 打开 DevTools → Network 面板。
2. 首次加载登录页：所有资源 `200` 正常下载。
3. F5 刷新：HTML 为 `304`，JS/CSS/图片显示 `(disk cache)` 或 `(memory cache)`，Size 为 0。
4. Ctrl+F5 强制刷新：所有资源重新下载（因 `immutable` 在强制刷新下被忽略，这是浏览器标准行为）。
5. 登录后再退出再登录：背景图不重新下载。

### 回归测试

- 登录功能正常。
- 上传新背景后立即可见（新 URL，新请求）。
- 删除背景后再次上传同名文件：URL 不同（时间戳不同），不冲突。
- 主题切换、字体加载、favicon 显示均正常。

## 风险与缓解

| 风险 | 概率 | 缓解 |
|------|------|------|
| 预设 SVG 更新后用户看不到新版本 | 低 | 更新时手动 bump `?v=N` |
| 服务端代码改动引入语法错误 | 低 | `npm run build` 类型检查 + 手动启动验证 |
| 用户在另一台机器上传同名文件 | 实际不存在 | 上传时间戳保证 URL 唯一 |
| `immutable` 导致开发期看不到改动 | 中 | 开发用 `npm run dev`（tsx watch），浏览器 DevTools 选 "Disable cache" |

## 影响范围汇总

- **改动文件**: `src/server.ts`, `public/index.html`
- **不改**: DB schema、上传逻辑、URL 设计、前端业务代码、package.json
- **向后兼容**: 完全兼容，旧浏览器忽略 `immutable` 关键字不影响功能

## 非目标再次强调（防止范围蔓延）

- 不实现 Service Worker / Cache API（YAGNI）
- 不引入构建工具生成内容哈希文件名（YAGNI）
- 不改变 `/api/settings` 的鉴权（用户确认保留登录页背景显示）
- 不添加 HTTP/2 push 或 preload hint（YAGNI）
