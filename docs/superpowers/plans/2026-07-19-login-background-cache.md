# 登录页背景图缓存优化 — 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让浏览器按资源类型分别缓存静态文件，HTML 每次验证（ETag 304），图片/字体/JS/CSS 永久缓存（`immutable, max-age=31536000`），消除登录页背景图每次刷新重新下载的问题。

**Architecture:** 在 `express.static` 的 `setHeaders` 回调中按文件扩展名分发不同的 `Cache-Control` 响应头；删除 `index.html` 中冲突的 `<meta http-equiv>` 缓存指令；为上传背景目录补上相同的 `setHeaders` 配置。

**Tech Stack:** Express 4 / TypeScript / Node.js

**Spec:** `docs/superpowers/specs/2026-07-19-login-background-cache-design.md`

## Global Constraints

- 静态资源根目录: `public/`
- 上传背景目录: `data/backgrounds/`（服务端路径 `../data/backgrounds`）
- 不变资源的缓存期: `31536000` 秒（1 年）
- HTML 缓存策略: `no-cache`（保留 ETag 条件请求）
- favicon 缓存策略: `public, max-age=86400`（1 天折中）
- 关键字 `immutable` 必须出现在长缓存资源的响应头
- 现有缓存控制注释（`server.ts:28-30`）需要更新为新策略的说明
- 项目无单元测试框架（仅 `tsc` 类型检查 + 手动验证），所有"测试"为命令行 `curl` + 浏览器验证
- TypeScript 构建命令: `npm run build`（产出 `dist/server.js`）

## File Structure

**修改 2 个文件，不新增文件：**

- `src/server.ts` — 把固定 `Cache-Control: no-cache` 改为按扩展名分发；为上传背景目录补上相同的 `staticOpts`。
- `public/index.html` — 删除两行冲突的 `<meta http-equiv>` 缓存指令。

**不创建任何新文件**，不引入新依赖，不改 `package.json`。

---

### Task 1: 在 server.ts 中实现按扩展名分发的 setStaticCacheHeaders 函数

**Files:**
- Modify: `src/server.ts:1-13`（imports 区，确保 `path` 已导入）和 `src/server.ts:28-46`（staticOpts 与两个 express.static 调用）

**Interfaces:**
- Consumes: Node.js `path` 模块（已在 `server.ts:5` 导入）、Express 的 `Response` 类型（已在 `:2` 导入）
- Produces: 一个模块级常量 `staticOpts`（含 `setHeaders` 回调），在两处 `express.static` 调用中复用

- [ ] **Step 1: 阅读当前 server.ts 的 static 配置**

Run: `read /home/gabriel/Documents/webTerm/src/server.ts`

确认第 28–46 行的当前实现：

```ts
  // Static files — serve with Cache-Control: no-cache so browsers always
  // revalidate via ETag/Last-Modified. Prevents stale cached JS/HTML from
  // running old code after a deploy (e.g. the autoConnectLocal regression).
  const staticOpts = {
    etag: true,
    lastModified: true,
    maxAge: 0,
    setHeaders: (res: Response) => {
      res.setHeader('Cache-Control', 'no-cache');
    },
  };
  app.use(express.static(path.join(process.cwd(), 'public'), staticOpts));

  // API routes
  app.use('/api', apiRoutes);
  app.use('/api/backgrounds', backgroundsRouter);

  // Serve uploaded backgrounds
  app.use('/backgrounds', express.static(path.join(__dirname, '../data/backgrounds')));
```

- [ ] **Step 2: 替换 staticOpts 块和上传背景的 express.static 调用**

用以下完整代码替换 `src/server.ts` 第 28–46 行（从注释 `// Static files` 开始到 `express.static(path.join(__dirname, '../data/backgrounds'))` 行结束）：

```ts
  // Static files — layered cache strategy:
  //   HTML        → no-cache            (always revalidate via ETag/Last-Modified)
  //   JS/CSS/font → 1y immutable        (URL carries ?v=N cache-buster)
  //   images      → 1y immutable        (uploads include timestamp in filename)
  //   favicon     → 1 day               (Chrome's favicon cache is quirky)
  //   default     → no-cache            (conservative)
  const STATIC_MAX_AGE = 31536000; // 1 year in seconds

  function setStaticCacheHeaders(res: Response, filePath: string): void {
    const ext = path.extname(filePath).toLowerCase();
    if (ext === '.html') {
      res.setHeader('Cache-Control', 'no-cache');
    } else if (['.js', '.css', '.otf', '.woff', '.woff2', '.ttf'].includes(ext)) {
      res.setHeader('Cache-Control', `public, max-age=${STATIC_MAX_AGE}, immutable`);
    } else if (['.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg'].includes(ext)) {
      res.setHeader('Cache-Control', `public, max-age=${STATIC_MAX_AGE}, immutable`);
    } else if (ext === '.ico') {
      res.setHeader('Cache-Control', 'public, max-age=86400');
    } else {
      res.setHeader('Cache-Control', 'no-cache');
    }
  }

  const staticOpts = {
    etag: true,
    lastModified: true,
    maxAge: 0,
    setHeaders: (res: Response, filePath: string) => {
      setStaticCacheHeaders(res, filePath);
    },
  };
  app.use(express.static(path.join(process.cwd(), 'public'), staticOpts));

  // API routes
  app.use('/api', apiRoutes);
  app.use('/api/backgrounds', backgroundsRouter);

  // Serve uploaded backgrounds (same layered cache strategy — filenames
  // include a Date.now() timestamp so immutable caching is safe).
  app.use('/backgrounds', express.static(path.join(__dirname, '../data/backgrounds'), staticOpts));
```

- [ ] **Step 3: 运行类型检查**

Run: `npm run build`
Expected: 编译成功，无 TypeScript 错误。如失败，检查 `Response` 类型和 `path.extname` 的导入。

- [ ] **Step 4: 启动服务器并验证响应头**

Run: `npm start`（在另一个终端，保持运行）

然后运行以下 curl 命令验证：

```bash
# HTML 应为 no-cache
curl -sI http://localhost:3000/ | grep -i cache-control
```
Expected: `cache-control: no-cache`

```bash
# 预设 SVG 应为 immutable 长缓存
curl -sI http://localhost:3000/backgrounds/preset-forest.svg | grep -i cache-control
```
Expected: `cache-control: public, max-age=31536000, immutable`

```bash
# 记下 ETag 用于下一步
curl -sI http://localhost:3000/backgrounds/preset-forest.svg | grep -i etag
```

```bash
# JS 应为 immutable 长缓存
curl -sI "http://localhost:3000/js/app.js?v=12" | grep -i cache-control
```
Expected: `cache-control: public, max-age=31536000, immutable`

```bash
# 上传背景目录的图片也应为 immutable（用任意已存在的图片）
curl -sI http://localhost:3000/backgrounds/1781839997147-coffee.png | grep -i cache-control
```
Expected: `cache-control: public, max-age=31536000, immutable`

- [ ] **Step 5: 验证 ETag 条件请求返回 304**

把 Step 4 中 `<etag>` 替换为实际拿到的 ETag 值（包含引号）：

```bash
curl -sI -H "If-None-Match: <etag>" http://localhost:3000/backgrounds/preset-forest.svg | head -1
```
Expected: `HTTP/1.1 304 Not Modified`

- [ ] **Step 6: 停止服务器**

在运行 `npm start` 的终端按 `Ctrl+C`。

- [ ] **Step 7: Commit**

```bash
git add src/server.ts
git commit -m "perf: layered static cache strategy (immutable for assets, no-cache for HTML)"
```

---

### Task 2: 删除 index.html 中冲突的 meta 缓存指令

**Files:**
- Modify: `public/index.html:13-14`

**Interfaces:**
- Consumes: 无
- Produces: 移除冗余的 `meta http-equiv` 标签；响应头由 `server.ts` 完全控制

**Why this is a separate task:** Task 1 已让响应头正确，但浏览器解析到 `<meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate">` 时仍可能优先应用 meta 策略覆盖响应头（不同浏览器行为不一）。删除这两行是必须的清理步骤，独立成任务便于回溯。

- [ ] **Step 1: 阅读当前 index.html 的 head 区**

Run: `read /home/gabriel/Documents/webTerm/public/index.html` 并定位第 8–18 行。

确认存在：

```html
  <!-- Favicons: SVG first (sharp at any size, ~3KB), then ICO fallback for
       legacy browsers, then apple-touch-icon for iOS home-screen pins.
       ?v=2 is the cache-buster — bump it (v=3…) when shipping a replacement
       icon, since Chrome stashes favicons in a separate cache that survives
       hard-refresh. -->
  <meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate">
  <meta http-equiv="Pragma" content="no-cache">
  <link rel="icon" type="image/svg+xml" href="/favicon.svg?v=2">
```

- [ ] **Step 2: 删除两行 meta http-equiv**

把 `public/index.html:13-14` 这两行：

```html
  <meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate">
  <meta http-equiv="Pragma" content="no-cache">
```

完全删除（连同行尾换行）。**保留**它们上方的 favicon 注释块和下方的 `<link rel="icon" ...>` 等行。

修改后该区域应为：

```html
  <!-- Favicons: SVG first (sharp at any size, ~3KB), then ICO fallback for
       legacy browsers, then apple-touch-icon for iOS home-screen pins.
       ?v=2 is the cache-buster — bump it (v=3…) when shipping a replacement
       icon, since Chrome stashes favicons in a separate cache that survives
       hard-refresh. -->
  <link rel="icon" type="image/svg+xml" href="/favicon.svg?v=2">
```

- [ ] **Step 3: 验证文件结构完整**

Run: `grep -n "meta http-equiv" /home/gabriel/Documents/webTerm/public/index.html`
Expected: 无任何匹配输出（两行已删除）。

Run: `grep -n "favicon.svg" /home/gabriel/Documents/webTerm/public/index.html`
Expected: 输出 1 行，favicon 链接正常存在。

- [ ] **Step 4: 启动服务器做端到端验证**

Run: `npm start`（保持运行）

```bash
# 拉取首页 HTML，确认 meta http-equiv 已不存在
curl -s http://localhost:3000/ | grep -c "meta http-equiv"
```
Expected: `0`

```bash
# 确认 favicon link 仍在
curl -s http://localhost:3000/ | grep -c 'favicon.svg?v=2'
```
Expected: `1`

- [ ] **Step 5: 停止服务器**

按 `Ctrl+C`。

- [ ] **Step 6: Commit**

```bash
git add public/index.html
git commit -m "fix: remove conflicting meta http-equiv cache directives from index.html"
```

---

### Task 3: 浏览器端到端验证

**Files:**
- 无文件改动，纯验证任务

**Interfaces:**
- Consumes: Task 1 和 Task 2 的成果
- Produces: 验证报告（口头或文字记录）

**Why this is its own task:** 浏览器缓存行为无法用 curl 完整复现（`disk cache` / `memory cache` 是浏览器层概念，curl 不参与）。这一步是任务验收的关键证据，独立成任务确保不跳过。

- [ ] **Step 1: 启动服务器**

Run: `npm start`

- [ ] **Step 2: 打开 DevTools 并准备观察**

在浏览器中：
1. 打开 `http://localhost:3000/`
2. 打开 DevTools（F12）→ Network 面板
3. 勾选 "Disable cache" **取消勾选**（确保启用缓存）
4. 在 Network 面板的过滤框输入 `backgrounds` 缩小视图

- [ ] **Step 3: 首次加载观察**

刷新页面（F5）。
Expected:
- 所有资源首次加载为 `200`（如果是首次访问），Size 列显示实际字节数
- 背景图（如 `1781839997147-coffee.png`）的 Response Headers 中 `cache-control: public, max-age=31536000, immutable`

- [ ] **Step 4: 二次刷新观察**

再次刷新（F5）。
Expected:
- HTML 为 `304 Not Modified`（no-cache 策略，每次重新验证）
- 背景图、JS、CSS、字体在 Size 列显示 `(disk cache)` 或 `(memory cache)`，**0 字节网络传输**
- 不再有对 `backgrounds/*.png` 的实际网络请求

- [ ] **Step 5: 登录后再退出再登录**

1. 输入凭据登录
2. 登出（设置 → Log Out）
3. 再次到登录页
Expected:
- 背景图不重新下载（`disk cache`）
- 登录页背景图立即显示，无加载延迟

- [ ] **Step 6: 停止服务器并完成**

按 `Ctrl+C`。

如果 Step 3–5 任意一步行为异常（背景图未走缓存），回到 Task 1 检查 `setHeaders` 是否被正确触发。

- [ ] **Step 7: 推送分支或汇总（可选）**

Run: `git log --oneline -5`
Expected: 看到本计划新增的两个提交。

到此实现完成。

---

## Self-Review 结果

**1. Spec coverage（逐项对照 spec）:**

| Spec 要求 | 实现任务 |
|----------|---------|
| setHeaders 按扩展名分发 | Task 1 Step 2 |
| HTML `no-cache` | Task 1 Step 2（`ext === '.html'` 分支） |
| JS/CSS/字体 `immutable, max-age=31536000` | Task 1 Step 2 |
| 图片 `immutable, max-age=31536000` | Task 1 Step 2 |
| favicon `max-age=86400` | Task 1 Step 2 |
| 默认 `no-cache` | Task 1 Step 2 |
| 删除 index.html 两行 meta | Task 2 Step 2 |
| 上传背景目录补 staticOpts | Task 1 Step 2（最后一行） |
| 命令行验证（curl） | Task 1 Steps 4–5 |
| 浏览器验证 | Task 3 |
| 回归测试（登录/上传/删除） | Task 3 Steps 3–5 |

无遗漏。

**2. Placeholder scan:**
- 无 TBD/TODO
- 所有代码块都是可直接复制的完整代码
- 所有命令都有具体路径和预期输出
- 无"实现类似 Task N"的偷懒写法

**3. Type consistency:**
- 函数名 `setStaticCacheHeaders` 在 Task 1 Step 2 定义并在同处的 `staticOpts` 中引用，命名一致
- 参数 `(res: Response, filePath: string)` 与 Express `setHeaders` 回调签名匹配（`(res, path, stat)`，第三个参数 `stat` 我们不用，省略合法）
- 常量 `STATIC_MAX_AGE` 仅在 Task 1 内使用，无跨任务依赖

无需修改。

