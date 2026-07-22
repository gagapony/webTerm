# WebTerm Go 重写 + Docker 化设计

日期：2026-07-22
状态：已批准

## 背景与目标

当前 WebTerm 后端为 Node.js/TypeScript（~1584 行），实测内存：

| 运行方式 | RSS |
|---|---|
| dev 模式（tsx watch） | ~171 MB |
| 生产模式（node dist/server.js，空闲） | ~90 MB |

内存大头是 Node/V8 运行时本身，"部分重写"无意义。目标：

1. **后端整体用 Go 重写**，全功能对齐，预期空闲 RSS ~15-25MB（降 70-80%）
2. **Docker 化**，多阶段构建 + scratch 基础镜像，预期镜像 ~10-15MB（vs Node 方案 ~250MB）

## 技术选型（全部零 cgo，完全静态二进制）

| 现有 (Node) | Go 替代 | 说明 |
|---|---|---|
| express | 标准库 `net/http`（Go 1.22+ 路由） | 零外部依赖 |
| ws | `coder/websocket` | 维护活跃、低内存 |
| ssh2 | `golang.org/x/crypto/ssh` | 密码/私钥/PTY/window-change |
| telnet-client | 手写 ~150 行 | 逐字节对齐现有 IAC/NAWS 逻辑 |
| better-sqlite3 | `modernc.org/sqlite`（纯 Go） | 直接读写现有 `data/webterm.db`，schema 一致 |
| bcrypt | `golang.org/x/crypto/bcrypt` | 同算法，现有密码哈希直接兼容 |
| express-session | 手写 ~60 行（内存 store + HMAC 签名 cookie） | cookie 名保持 `connect.sid` |
| 静态文件 | `embed.FS` 内嵌 `public/` | 单二进制部署，前端零改动 |

## 模块结构

位于本仓库 `go-server/` 子目录，Node 版保留便于并行对比验证。

```
go-server/
├── main.go        入口、HTTP 路由、静态服务（分层缓存头对齐）、优雅退出
├── config.go      环境变量：PORT/HOST/SESSION_SECRET/DB_PATH/LOG_DIR/ADMIN_USER/ADMIN_PASS/LOG_LEVEL
├── store.go       SQLite CRUD：users/connections/sessions/settings/backgrounds（含建表与 local 协议迁移）
├── auth.go        login/logout/change-password + session 中间件
├── ws.go          WS 协议：create/input/resize/close → created/output/exit/error
├── session.go     SessionManager（含 cleanupWebSocket 语义）
├── ssh.go         SSHSession（x/crypto/ssh，xterm-256color，10s readyTimeout/keepalive）
├── telnet.go      TelnetSession（IAC 协商、NAWS 窗口上报）
└── backgrounds.go multipart 上传（5MB 限制、jpeg/png/gif/webp 白名单、文件名消毒、时间戳前缀）
```

## 行为对齐清单

- **15 个 HTTP 端点**：
  - `POST /api/auth/login`、`POST /api/auth/logout`、`POST /api/auth/change-password`
  - `GET/POST /api/connections`、`PUT/DELETE /api/connections/:id`
  - `GET /api/sessions`
  - `GET /api/settings`（公开）、`PUT /api/settings`（需登录）
  - `GET /api/recordings`、`GET /api/recordings/:id/download`
  - `GET /api/backgrounds`、`POST /api/backgrounds/upload`、`DELETE /api/backgrounds/:id`
- **WS 消息格式**：客户端发 `{type: create|input|resize|close, sessionId?, data?, cols?, rows?, protocol?, host?, port?, username?, password?}`；服务端回 `{type: created|output|exit|error, sessionId?, data?, message?, protocol?}`。前端零改动。
- **静态文件缓存策略**：HTML → no-cache；js/css/字体/图片 → 1 年 immutable；favicon → 1 天；其他 → no-cache。
- **数据兼容**：现有 `data/`（SQLite、背景图、日志目录）直接复用，无迁移。
- **sessions 表记录**：创建会话插入 `active`，关闭时更新 `closed` + `ended_at`。
- **默认用户**：users 表为空时用 ADMIN_USER/ADMIN_PASS 创建。
- **优雅退出**：SIGINT/SIGTERM 关闭所有会话。
- `.cast` 录制：只有列表/下载端点（现有代码本就不产生 .cast 文件），保持一致。

## 有意行为偏差（已批准）

- **WS 鉴权修复**：Node 版 WebSocket 端点无鉴权，未登录可开终端。Go 版在 WS upgrade 时校验 `connect.sid` session cookie，未登录返回 401。

## 内存优化

- Go runtime 基线 ~10MB（vs V8 ~60MB+）
- 每会话 2 个 goroutine（读泵 + 写泵），栈 ~8KB 起步
- `embed.FS` 无 node_modules（镜像不带 84MB 依赖）
- 可选 `GOMEMLIMIT` 环境变量设置 Go 堆硬上限（compose 中默认给例如 `200MiB`）
- 预期：空闲 RSS ~15-25MB，每活跃会话 +1-3MB

## Docker

**Dockerfile（多阶段）**：
1. `golang:1.23-alpine` 构建阶段：`CGO_ENABLED=0 go build -ldflags="-s -w"`（去符号表进一步缩小）
2. `scratch` 运行阶段：只拷二进制 + CA 证书 +（镜像内空的 `/data` 目录）

**docker-compose.yml**：
- 端口映射 `${PORT:-8008}:8008`（容器内固定 8008，host 侧可配）
- 卷 `./data:/data`（SQLite + backgrounds + logs 持久化）
- 环境变量：SESSION_SECRET、ADMIN_USER、ADMIN_PASS、LOG_LEVEL、GOMEMLIMIT
- `restart: unless-stopped`

## 错误处理与日志

- `log/slog` 标准库，LOG_LEVEL=debug|info|warn|error（默认 info；生产 warn 对齐用户要求）
- SSH/Telnet 连接失败 → WS 发 `{type:error, message}`，不崩溃
- SQLite 打开失败 → 启动即退出并输出错误
- 上传超限/类型不符 → 400，对齐现有行为

## 测试策略

- Go 单元测试：telnet IAC/NAWS 解析、store CRUD、auth 流程、WS 消息处理
- 集成验证：Go 版（8091）与 Node 版（8009）并行跑，用 curl 对比 API 响应、用前端手动开 SSH/Telnet 会话验证
- 内存基准：同负载下两版 RSS 对比，写入最终报告

## 验收标准

- [ ] 全部 15 个 HTTP 端点行为与 Node 版一致
- [ ] 前端零改动可通过 Go 版完整使用（登录、建连接、SSH/Telnet 终端、改密、设置、背景上传、录制下载）
- [ ] 现有 data/webterm.db 直接可用（含已有用户哈希、连接配置）
- [ ] 空闲 RSS ≤ 30MB
- [ ] `docker build` 成功，镜像 ≤ 25MB；`docker compose up` 一键可用
- [ ] WS 未登录访问被拒绝
