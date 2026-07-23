<div align="center">

# WebTerm

**自托管的浏览器 SSH & Telnet 终端。**

在任意现代浏览器中连接远程服务器 —— 无需安装客户端，无需插件。

[English](README.md) · **简体中文**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](#-开源协议)
[![Go](https://img.shields.io/badge/Go-1.23%2B-00ADD8?logo=go&logoColor=white)](https://go.dev/)
[![Docker](https://img.shields.io/badge/Docker-ready-2496ED?logo=docker&logoColor=white)](https://www.docker.com/)
[![xterm.js](https://img.shields.io/badge/Powered%20by-xterm.js-1f1f1f)](https://xtermjs.org/)

</div>

## ✨ 功能特性

- **SSH & Telnet** —— 支持密码、私钥、私钥 + 口令三种认证方式。
- **多会话标签页** —— 一个浏览器窗口内并排运行多个终端。
- **连接管理器** —— 保存可复用的连接配置，凭据加密存储。
- **OSC 52 剪贴板** —— 直接从远端 `tmux` / `nvim` 复制到浏览器剪贴板。
- **主题与背景** —— 内置主题（如 *Catppuccin Mocha*）、自定义背景、毛玻璃 UI。
- **完整的认证体系** —— bcrypt 密码哈希、HMAC 签名 Cookie、WebSocket 鉴权。
- **极小的资源占用** —— 单个静态 Go 二进制（空闲内存约 13 MB），约 17 MB 的 scratch 镜像，内嵌 SQLite。

## 📸 界面截图

<p align="center">
  <img src="docs/images/main-interface.png" alt="WebTerm 终端主界面" width="49%">
  <img src="docs/images/main-interface-1.png" alt="WebTerm 终端主界面" width="49%">
  <img src="docs/images/main-interface-2.png" alt="WebTerm 终端主界面" width="49%">
  <img src="docs/images/main-interface-3.png" alt="WebTerm 终端主界面" width="49%">
</p>

<details>
<summary><b>🔌 连接管理器</b></summary>
<br>
<img src="docs/images/connection-manager.png" alt="WebTerm 连接管理器：已保存的连接配置列表与一键打开按钮" width="100%">
</details>

<details>
<summary><b>⚙️ 设置与主题切换</b></summary>
<br>
<img src="docs/images/settings-themes.png" alt="WebTerm 设置面板：主题下拉框、透明度滑块、模糊强度、背景选择器" width="100%">
</details>

## 🚀 快速开始

Docker 是唯一支持的部署方式。

```bash
# 1. 配置 —— SESSION_SECRET 必填
cp .env.example .env   # 然后编辑：设置 SESSION_SECRET 和强密码 ADMIN_PASS

# 2. 启动
docker compose up -d
```

打开 **http://localhost:8008**，使用 `admin` / `admin`（或你设置的
`ADMIN_USER` / `ADMIN_PASS`）登录。**首次登录后请立即修改密码**。

所有数据持久化在 `./data/` 目录（SQLite 数据库和上传的背景图），
通过 bind mount 挂载进容器 —— 备份就是拷贝一个文件夹。

## ⚙️ 配置项

所有配置通过 `.env` 文件或环境变量设置：

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `PORT` | `8008` | 宿主机端口（compose 映射 `${PORT}:8008`） |
| `SESSION_SECRET` | — | **必填。** 用于签名会话 Cookie —— 请使用足够长的随机值 |
| `ADMIN_USER` | `admin` | 默认管理员用户名（仅在 users 表为空时创建） |
| `ADMIN_PASS` | `admin` | 默认管理员密码 —— **生产环境务必修改** |
| `LOG_LEVEL` | `warn` | `debug` \| `info` \| `warn` \| `error` |
| `GOMEMLIMIT` | `200MiB` | Go 运行时的软内存上限 |

## 🏗️ 架构

<img src="docs/images/architecture.png" alt="WebTerm 架构：浏览器 (xterm.js) ↔ Go 服务 (HTTP + WebSocket) ↔ SSH/Telnet 上游，存储层为 SQLite" width="100%">

Go 二进制内嵌了整个前端（`embed.FS`），对外提供 HTTP + WebSocket 服务；
向上游发起 SSH（`x/crypto/ssh`）或 Telnet（手写的 IAC 状态机）连接。
状态存储在纯 Go 实现的 SQLite（无 CGO）中。

**技术栈：** xterm.js（Canvas 渲染）· Go `net/http` + [`coder/websocket`](https://github.com/coder/websocket) · [`x/crypto/ssh`](https://pkg.go.dev/golang.org/x/crypto/ssh) · [`modernc.org/sqlite`](https://pkg.go.dev/modernc.org/sqlite) · bcrypt + HMAC-SHA256 Cookie

## 📡 API

<details>
<summary><b>REST 与 WebSocket 接口参考</b></summary>
<br>

所有接口返回 JSON。需要鉴权的接口依赖 `POST /api/auth/login` 下发的 `connect.sid` Cookie。

| 方法 | 路径 | 鉴权 | 说明 |
|------|------|------|------|
| `POST` | `/api/auth/login` | — | 请求体：`{username, password}`，设置会话 Cookie。 |
| `POST` | `/api/auth/logout` | — | 销毁当前会话。 |
| `POST` | `/api/auth/change-password` | ✓ | 请求体：`{currentPassword, newPassword}`（≥6 位）。 |
| `GET` | `/api/connections` | ✓ | 列出已保存的连接配置。 |
| `POST` | `/api/connections` | ✓ | 新建配置（`name`、`protocol`、`host`、`port`、`username` 必填）。 |
| `PUT` | `/api/connections/{id}` | ✓ | 更新配置。 |
| `DELETE` | `/api/connections/{id}` | ✓ | 删除配置。 |
| `GET` | `/api/sessions` | ✓ | 列出历史会话。 |
| `GET` | `/api/settings` | — | 获取 UI 设置。 |
| `PUT` | `/api/settings` | ✓ | 保存 UI 设置。 |
| `GET` | `/api/backgrounds` | ✓ | 列出已上传的背景图。 |
| `POST` | `/api/backgrounds/upload` | ✓ | Multipart 上传（`image` 字段；JPEG/PNG/GIF/WebP，≤ 5 MB）。 |
| `DELETE` | `/api/backgrounds/{id}` | ✓ | 删除背景图。 |

**WebSocket** —— 在 `/` 路径上升级；必须携带有效的 `connect.sid` Cookie（否则返回 `401`）。
所有消息均为 JSON 文本帧：

| 客户端 → 服务端 | 用途 |
|-----------------|------|
| `create` | 打开会话：`protocol`、`host`、`port`、`username`、`password`、`cols`、`rows` |
| `input` | 转发按键：`sessionId`、`data` |
| `resize` | 视口变化：`sessionId`、`cols`、`rows` |
| `close` | 关闭会话：`sessionId` |

| 服务端 → 客户端 | 用途 |
|-----------------|------|
| `created` | 确认建连：`sessionId`、`protocol` |
| `output` | 上游输出：`sessionId`、`data` |
| `exit` | 上游会话结束：`sessionId` |
| `error` | `message`（可选 `sessionId`） |

</details>

## 🔒 安全说明

- **bcrypt**（cost 10）密码哈希。
- **HMAC-SHA256** 签名会话 Cookie —— HttpOnly、SameSite=Lax，在 TLS 之后自动附加 `Secure`。
- **WebSocket 鉴权** —— 未认证的客户端无法打开终端。
- 上传文件**文件名消毒**；文件下载**拒绝路径穿越**。
- SSH 主机密钥校验默认**关闭**（与原版 `ssh2` 行为一致）—— 生产环境请在 `go-server/ssh.go` 中加固。

**部署前请务必：** 设置强随机的 `SESSION_SECRET` 与 `ADMIN_PASS`，首次登录后立即修改默认密码，并将 WebTerm 置于 TLS 之后。

## 🛣️ 路线图

- [ ] 严格的 SSH 主机密钥校验（可配置 `known_hosts`）
- [ ] SSH 私钥落盘加密（口令保护）
- [ ] 集群模式（Redis 后端会话）
- [ ] 分屏面板

## 🤝 参与贡献

欢迎 PR —— 代码库仅约 2,000 行 Go，加上无构建步骤的原生 JS 前端。

```bash
cd go-server
go test ./... && go vet ./...
```

## 📄 开源协议

基于 **MIT 协议**发布，详见 [LICENSE](LICENSE)。
