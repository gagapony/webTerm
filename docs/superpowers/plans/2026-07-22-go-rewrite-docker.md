# WebTerm Go 重写 + Docker 化实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 用 Go 全量重写 WebTerm 后端（全功能对齐 Node 版），内存从 ~90MB 降到 ~15-25MB，并以 ~15MB 的 scratch Docker 镜像 + docker-compose 交付。

**Architecture:** 标准库 net/http 路由 + coder/websocket + x/crypto/ssh + 手写 telnet + modernc.org/sqlite（纯 Go 无 cgo，直接读写现有 data/webterm.db）+ embed.FS 内嵌前端。代码位于 `go-server/` 子目录，Node 版保留用于并行对比。

**Tech Stack:** Go（nix shell 提供）、coder/websocket、golang.org/x/crypto、modernc.org/sqlite、Docker 多阶段构建（golang:alpine → scratch）。

## Global Constraints

- 全部依赖零 cgo：`CGO_ENABLED=0` 必须能构建出静态二进制
- 唯一允许的第三方依赖：`github.com/coder/websocket`、`golang.org/x/crypto`、`modernc.org/sqlite`（及其间接依赖）
- WS 消息格式与 15 个 HTTP 端点行为必须与 Node 版一致（见设计文档 `docs/superpowers/specs/2026-07-22-go-rewrite-docker-design.md`），前端 `public/` 零改动
- 有意偏差仅两处（设计已批准）：① WS upgrade 需校验 `connect.sid` session；② recordings 下载拒绝路径穿越 id
- 环境变量与 Node 版同名：`PORT/HOST/SESSION_SECRET/DB_PATH/LOG_DIR/ADMIN_USER/ADMIN_PASS/LOG_LEVEL`，另支持 `GOMEMLIMIT`（Go 原生识别）
- bcrypt 哈希、SQLite schema 与现有数据完全兼容，无迁移
- 日志用 `log/slog`（text handler → stderr），级别 LOG_LEVEL=debug|info|warn|error，默认 info
- 所有 Go 命令都在 `go-server/` 目录下运行；Go 工具链由项目 shell.nix/direnv 提供
- 测试中若出现"占位 import / 占位函数"的提示，以实现时编译器提示为准进行清理

---

### Task 1: 脚手架 — shell.nix 加 Go、go.mod、config.go、logger.go

**Files:**
- Modify: `shell.nix`
- Create: `go-server/go.mod`、`go-server/config.go`、`go-server/config_test.go`、`go-server/logger.go`

**Interfaces:**
- Produces:
  - `type Config struct { Port int; Host string; SessionSecret string; SessionMaxAge time.Duration; DBPath string; LogDir string; AdminUser string; AdminPass string; LogLevel string }`
  - `func LoadConfig() Config` — 先读 cwd 的 `.env`（不覆盖已有环境变量），再按 Node 版默认值兜底
  - `func (c Config) BackgroundsDir() string` — `filepath.Join(filepath.Dir(c.DBPath), "backgrounds")`
  - `func setupLogger(level string)` — slog text handler

- [ ] **Step 1: shell.nix 加入 go，重载 direnv**

修改 `shell.nix` 的 buildInputs：

```nix
  buildInputs = with pkgs; [
    nodejs
    go
    gnumake
    gcc
    gcc.cc.lib
    python3
    pkg-config
  ];
```

Run: `direnv reload && direnv exec . go version`
Expected: 输出 `go version go1.2x linux/amd64`

- [ ] **Step 2: 写失败测试 `go-server/config_test.go`**

```go
package main

import (
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestLoadConfigDefaults(t *testing.T) {
	for _, k := range []string{"PORT", "HOST", "SESSION_SECRET", "DB_PATH", "LOG_DIR", "ADMIN_USER", "ADMIN_PASS", "LOG_LEVEL"} {
		t.Setenv(k, "")
		os.Unsetenv(k)
	}
	dir := t.TempDir()
	old, _ := os.Getwd()
	defer os.Chdir(old)
	os.Chdir(dir)

	cfg := LoadConfig()
	if cfg.Port != 3000 {
		t.Errorf("Port = %d, want 3000", cfg.Port)
	}
	if cfg.Host != "0.0.0.0" {
		t.Errorf("Host = %q, want 0.0.0.0", cfg.Host)
	}
	if cfg.SessionSecret != "webterm-secret-change-in-production" {
		t.Errorf("SessionSecret = %q", cfg.SessionSecret)
	}
	if cfg.SessionMaxAge != 24*time.Hour {
		t.Errorf("SessionMaxAge = %v", cfg.SessionMaxAge)
	}
	if cfg.DBPath != "./data/webterm.db" {
		t.Errorf("DBPath = %q", cfg.DBPath)
	}
	if cfg.LogDir != "./data/logs" {
		t.Errorf("LogDir = %q", cfg.LogDir)
	}
	if cfg.AdminUser != "admin" || cfg.AdminPass != "admin" {
		t.Errorf("Admin = %q/%q", cfg.AdminUser, cfg.AdminPass)
	}
	if cfg.LogLevel != "info" {
		t.Errorf("LogLevel = %q", cfg.LogLevel)
	}
}

func TestLoadConfigFromEnv(t *testing.T) {
	t.Setenv("PORT", "9000")
	t.Setenv("SESSION_SECRET", "s3cret")
	dir := t.TempDir()
	old, _ := os.Getwd()
	defer os.Chdir(old)
	os.Chdir(dir)

	cfg := LoadConfig()
	if cfg.Port != 9000 {
		t.Errorf("Port = %d, want 9000", cfg.Port)
	}
	if cfg.SessionSecret != "s3cret" {
		t.Errorf("SessionSecret = %q", cfg.SessionSecret)
	}
}

func TestLoadConfigDotEnv(t *testing.T) {
	dir := t.TempDir()
	os.WriteFile(filepath.Join(dir, ".env"), []byte("# comment\nPORT=7777\nSESSION_SECRET=\"quoted-value\"\nLOG_LEVEL=warn\n"), 0600)
	old, _ := os.Getwd()
	defer os.Chdir(old)
	os.Chdir(dir)

	// 已存在的环境变量不被 .env 覆盖（dotenv 语义）
	t.Setenv("LOG_LEVEL", "error")

	cfg := LoadConfig()
	if cfg.Port != 7777 {
		t.Errorf("Port = %d, want 7777 (from .env)", cfg.Port)
	}
	if cfg.SessionSecret != "quoted-value" {
		t.Errorf("SessionSecret = %q, want quoted-value", cfg.SessionSecret)
	}
	if cfg.LogLevel != "error" {
		t.Errorf("LogLevel = %q, want error (env wins over .env)", cfg.LogLevel)
	}
}

func TestBackgroundsDir(t *testing.T) {
	cfg := Config{DBPath: "./data/webterm.db"}
	if got := cfg.BackgroundsDir(); got != "data/backgrounds" {
		t.Errorf("BackgroundsDir = %q, want data/backgrounds", got)
	}
}
```

- [ ] **Step 3: 初始化 go.mod 并运行测试确认失败**

```bash
cd go-server
go mod init webterm
go test ./...
```
Expected: 编译失败 `undefined: LoadConfig`

- [ ] **Step 4: 实现 `go-server/config.go` 和 `go-server/logger.go`**

`go-server/config.go`:

```go
package main

import (
	"bufio"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"
)

type Config struct {
	Port          int
	Host          string
	SessionSecret string
	SessionMaxAge time.Duration
	DBPath        string
	LogDir        string
	AdminUser     string
	AdminPass     string
	LogLevel      string
}

// LoadConfig 对齐 Node 版 src/config.ts：先加载 .env（不覆盖已有环境变量），再读环境变量。
func LoadConfig() Config {
	loadDotEnv(".env")
	return Config{
		Port:          envInt("PORT", 3000),
		Host:          envStr("HOST", "0.0.0.0"),
		SessionSecret: envStr("SESSION_SECRET", "webterm-secret-change-in-production"),
		SessionMaxAge: 24 * time.Hour,
		DBPath:        envStr("DB_PATH", "./data/webterm.db"),
		LogDir:        envStr("LOG_DIR", "./data/logs"),
		AdminUser:     envStr("ADMIN_USER", "admin"),
		AdminPass:     envStr("ADMIN_PASS", "admin"),
		LogLevel:      envStr("LOG_LEVEL", "info"),
	}
}

// BackgroundsDir 对齐 Node 版 data/backgrounds 的位置（相对 DB 目录）。
func (c Config) BackgroundsDir() string {
	return filepath.Join(filepath.Dir(c.DBPath), "backgrounds")
}

func envStr(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}

func envInt(key string, def int) int {
	if v := os.Getenv(key); v != "" {
		if n, err := strconv.Atoi(v); err == nil {
			return n
		}
	}
	return def
}

// loadDotEnv 是一个极简 .env 解析器：KEY=VALUE、# 注释、可选引号。
// 与 dotenv 一致：不覆盖已存在的环境变量。
func loadDotEnv(path string) {
	f, err := os.Open(path)
	if err != nil {
		return
	}
	defer f.Close()

	sc := bufio.NewScanner(f)
	for sc.Scan() {
		line := strings.TrimSpace(sc.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		k, v, ok := strings.Cut(line, "=")
		if !ok {
			continue
		}
		k = strings.TrimSpace(k)
		v = strings.TrimSpace(v)
		if len(v) >= 2 && ((v[0] == '"' && v[len(v)-1] == '"') || (v[0] == '\'' && v[len(v)-1] == '\'')) {
			v = v[1 : len(v)-1]
		}
		if _, exists := os.LookupEnv(k); !exists {
			os.Setenv(k, v)
		}
	}
}
```

`go-server/logger.go`:

```go
package main

import (
	"log/slog"
	"os"
	"strings"
)

func setupLogger(level string) {
	var lv slog.Level
	switch strings.ToUpper(level) {
	case "DEBUG":
		lv = slog.LevelDebug
	case "INFO":
		lv = slog.LevelInfo
	case "WARN":
		lv = slog.LevelWarn
	case "ERROR":
		lv = slog.LevelError
	default:
		lv = slog.LevelInfo
	}
	slog.SetDefault(slog.New(slog.NewTextHandler(os.Stderr, &slog.HandlerOptions{Level: lv})))
}
```

- [ ] **Step 5: 运行测试确认通过**

Run: `cd go-server && go test ./...`
Expected: PASS（4 个测试）

- [ ] **Step 6: Commit**

```bash
git add shell.nix go-server/go.mod go-server/config.go go-server/config_test.go go-server/logger.go
git commit -m "feat(go): scaffolding with config and logger"
```

---

### Task 2: store.go — SQLite 存储层

**Files:**
- Create: `go-server/store.go`、`go-server/store_test.go`

**Interfaces:**
- Consumes: Task 1 的 `Config`（仅测试用 temp DB 路径）
- Produces（后续 Task 依赖这些签名）:
  - `type Store struct{ db *sql.DB }`，`func NewStore(path string) (*Store, error)`，`func (s *Store) Close()`
  - `type User struct{ ID int64; Username string; PasswordHash string }`
  - `type Connection struct { ID int64; Name string; Protocol string; Host *string; Port *int64; Username *string; PasswordEncrypted *string; SSHKeyPath *string; SSHKeyPassphrase *string; Options *string; CreatedAt string; UpdatedAt string }`（json tag 与列名 snake_case 一致）
  - `type ConnectionInput struct { Name string; Protocol string; Host string; Port *int64; Username string; Password string; SSHKeyPath string; SSHKeyPassphrase string; Options json.RawMessage }`
  - `type Session struct { ID string; ConnectionID *int64; Protocol string; Host *string; Port *int64; StartedAt string; EndedAt *string; LogPath *string; Status *string }`
  - `type Background struct { ID int64; Filename string; OriginalName *string; MimeType *string; Size *int64; CreatedAt string }`
  - 方法：`GetUser(username string) (*User, error)`、`CreateUser(username, hash string) error`、`UpdateUserPassword(id int64, hash string)`、`UserCount() int`、`GetConnections() ([]Connection, error)`、`GetConnection(id int64) (*Connection, error)`、`CreateConnection(in ConnectionInput) (*Connection, error)`、`UpdateConnection(id int64, in ConnectionInput) (*Connection, error)`、`DeleteConnection(id int64) (bool, error)`、`GetSessions() ([]Session, error)`、`CreateSession(id, protocol string, host string, port *int64) error`、`UpdateSessionStatus(id, status string) error`、`GetSettings() (json.RawMessage, error)`（无记录返回 nil, nil）、`SaveSettings(v json.RawMessage) error`、`ListBackgrounds() ([]Background, error)`、`CreateBackground(filename, origName, mime string, size int64) (int64, error)`、`GetBackground(id int64) (*Background, error)`、`DeleteBackground(id int64) (bool, error)`

**关键实现细节（写代码前必读）:**
- modernc.org/sqlite 会把 declared type 为 DATETIME 的列扫成 `time.Time`，而 Node/better-sqlite3 返回原始字符串（`2026-07-22 12:34:56`）。为保持 JSON 输出一致，所有 SELECT 对 datetime 列用 `CAST(created_at AS TEXT) AS created_at`（updated_at/started_at/ended_at 同理）。
- driver 名 `"sqlite"`；打开后 `PRAGMA journal_mode=WAL`；`db.SetMaxOpenConns(1)` 避免 database is locked。
- schema 与 Node 版完全一致（users/connections/sessions/settings + backgrounds 表和 2 个 sessions 索引），外加 Node 版的 local 协议迁移（删除 `protocol='local'` 行；若 connections 建表 SQL 含 `CHECK(protocol IN` 则重建表）。
- `UpdateConnection` 用 Node 同款 COALESCE 模式：Go 侧把 `""` 当 NULL 传入（对齐 JS `data.name || null`）。

- [ ] **Step 1: 写失败测试 `go-server/store_test.go`**

```go
package main

import (
	"encoding/json"
	"path/filepath"
	"testing"
)

func newTestStore(t *testing.T) *Store {
	t.Helper()
	s, err := NewStore(filepath.Join(t.TempDir(), "test.db"))
	if err != nil {
		t.Fatalf("NewStore: %v", err)
	}
	t.Cleanup(func() { s.Close() })
	return s
}

func TestStoreUsers(t *testing.T) {
	s := newTestStore(t)
	if n := s.UserCount(); n != 0 {
		t.Fatalf("UserCount = %d, want 0", n)
	}
	if err := s.CreateUser("alice", "hash1"); err != nil {
		t.Fatalf("CreateUser: %v", err)
	}
	if n := s.UserCount(); n != 1 {
		t.Fatalf("UserCount = %d, want 1", n)
	}
	u, err := s.GetUser("alice")
	if err != nil || u == nil {
		t.Fatalf("GetUser: %v %v", u, err)
	}
	if u.Username != "alice" || u.PasswordHash != "hash1" || u.ID != 1 {
		t.Errorf("unexpected user %+v", u)
	}
	s.UpdateUserPassword(u.ID, "hash2")
	u, _ = s.GetUser("alice")
	if u.PasswordHash != "hash2" {
		t.Errorf("PasswordHash = %q, want hash2", u.PasswordHash)
	}
	if u, _ := s.GetUser("nobody"); u != nil {
		t.Errorf("GetUser(nobody) should be nil")
	}
}

func TestStoreConnections(t *testing.T) {
	s := newTestStore(t)
	c, err := s.CreateConnection(ConnectionInput{Name: "myserver", Protocol: "ssh", Host: "example.com", Username: "root", Password: "pw"})
	if err != nil {
		t.Fatalf("CreateConnection: %v", err)
	}
	if c.ID != 1 || c.Name != "myserver" || c.Protocol != "ssh" {
		t.Errorf("unexpected %+v", c)
	}
	if c.Host == nil || *c.Host != "example.com" {
		t.Errorf("Host = %v", c.Host)
	}
	if c.Port != nil {
		t.Errorf("Port should be nil, got %v", *c.Port)
	}
	if c.PasswordEncrypted == nil || *c.PasswordEncrypted != "pw" {
		t.Errorf("PasswordEncrypted = %v", c.PasswordEncrypted)
	}
	if c.CreatedAt == "" {
		t.Errorf("CreatedAt empty")
	}

	// Update：只改 name，其他字段 COALESCE 保持
	c2, err := s.UpdateConnection(c.ID, ConnectionInput{Name: "renamed"})
	if err != nil || c2 == nil {
		t.Fatalf("UpdateConnection: %v %v", c2, err)
	}
	if c2.Name != "renamed" || c2.Host == nil || *c2.Host != "example.com" {
		t.Errorf("after update %+v", c2)
	}

	list, err := s.GetConnections()
	if err != nil || len(list) != 1 {
		t.Fatalf("GetConnections: %v %d", err, len(list))
	}

	ok, err := s.DeleteConnection(c.ID)
	if !ok || err != nil {
		t.Fatalf("DeleteConnection: %v %v", ok, err)
	}
	if ok, _ := s.DeleteConnection(999); ok {
		t.Errorf("DeleteConnection(999) should be false")
	}
}

func TestStoreConnectionOptionsJSON(t *testing.T) {
	s := newTestStore(t)
	c, err := s.CreateConnection(ConnectionInput{Name: "x", Protocol: "ssh", Options: json.RawMessage(`{"foo":1}`)})
	if err != nil {
		t.Fatalf("CreateConnection: %v", err)
	}
	if c.Options == nil || *c.Options != `{"foo":1}` {
		t.Errorf("Options = %v", c.Options)
	}
}

func TestStoreSessions(t *testing.T) {
	s := newTestStore(t)
	if err := s.CreateSession("uuid-1", "ssh", "h1", nil); err != nil {
		t.Fatalf("CreateSession: %v", err)
	}
	list, err := s.GetSessions()
	if err != nil || len(list) != 1 {
		t.Fatalf("GetSessions: %v %d", err, len(list))
	}
	sess := list[0]
	if sess.ID != "uuid-1" || sess.Protocol != "ssh" {
		t.Errorf("unexpected %+v", sess)
	}
	if sess.Status == nil || *sess.Status != "active" {
		t.Errorf("Status = %v", sess.Status)
	}
	if sess.EndedAt != nil {
		t.Errorf("EndedAt should be nil")
	}
	s.UpdateSessionStatus("uuid-1", "closed")
	list, _ = s.GetSessions()
	if list[0].Status == nil || *list[0].Status != "closed" {
		t.Errorf("Status = %v", list[0].Status)
	}
	if list[0].EndedAt == nil {
		t.Errorf("EndedAt should be set")
	}
}

func TestStoreSettings(t *testing.T) {
	s := newTestStore(t)
	v, err := s.GetSettings()
	if err != nil || v != nil {
		t.Fatalf("GetSettings empty: %v %v", v, err)
	}
	if err := s.SaveSettings(json.RawMessage(`{"theme":"dark"}`)); err != nil {
		t.Fatalf("SaveSettings: %v", err)
	}
	v, _ = s.GetSettings()
	if string(v) != `{"theme":"dark"}` {
		t.Errorf("GetSettings = %s", v)
	}
	// upsert 覆盖
	s.SaveSettings(json.RawMessage(`{"theme":"light"}`))
	v, _ = s.GetSettings()
	if string(v) != `{"theme":"light"}` {
		t.Errorf("after upsert = %s", v)
	}
}

func TestStoreBackgrounds(t *testing.T) {
	s := newTestStore(t)
	id, err := s.CreateBackground("123-a.png", "a.png", "image/png", 1024)
	if err != nil {
		t.Fatalf("CreateBackground: %v", err)
	}
	list, err := s.ListBackgrounds()
	if err != nil || len(list) != 1 {
		t.Fatalf("ListBackgrounds: %v %d", err, len(list))
	}
	b := list[0]
	if b.ID != id || b.Filename != "123-a.png" {
		t.Errorf("unexpected %+v", b)
	}
	if b.OriginalName == nil || *b.OriginalName != "a.png" {
		t.Errorf("OriginalName = %v", b.OriginalName)
	}
	bg, err := s.GetBackground(id)
	if err != nil || bg == nil {
		t.Fatalf("GetBackground: %v %v", bg, err)
	}
	ok, _ := s.DeleteBackground(id)
	if !ok {
		t.Errorf("DeleteBackground should be true")
	}
	if bg, _ := s.GetBackground(id); bg != nil {
		t.Errorf("should be deleted")
	}
}

func TestStoreMigratesLocalProtocol(t *testing.T) {
	dir := t.TempDir()
	dbPath := filepath.Join(dir, "m.db")
	s, err := NewStore(dbPath)
	if err != nil {
		t.Fatalf("NewStore: %v", err)
	}
	// 直接插入一条 local 协议记录，然后重新打开触发迁移
	if _, err := s.db.Exec(`INSERT INTO connections (name, protocol, host) VALUES ('legacy', 'local', NULL)`); err != nil {
		t.Fatalf("insert local: %v", err)
	}
	s.Close()

	s2, err := NewStore(dbPath)
	if err != nil {
		t.Fatalf("reopen: %v", err)
	}
	defer s2.Close()
	list, _ := s2.GetConnections()
	for _, c := range list {
		if c.Protocol == "local" {
			t.Errorf("local protocol row should be migrated away")
		}
	}
}
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd go-server && go test ./...`
Expected: 编译失败 `undefined: NewStore`

- [ ] **Step 3: 添加依赖并实现 `go-server/store.go`**

```bash
cd go-server
go get modernc.org/sqlite
```

`go-server/store.go`:

```go
package main

import (
	"database/sql"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"strings"

	_ "modernc.org/sqlite"
)

type Store struct {
	db *sql.DB
}

type User struct {
	ID           int64
	Username     string
	PasswordHash string
}

type Connection struct {
	ID                int64   `json:"id"`
	Name              string  `json:"name"`
	Protocol          string  `json:"protocol"`
	Host              *string `json:"host"`
	Port              *int64  `json:"port"`
	Username          *string `json:"username"`
	PasswordEncrypted *string `json:"password_encrypted"`
	SSHKeyPath        *string `json:"ssh_key_path"`
	SSHKeyPassphrase  *string `json:"ssh_key_passphrase"`
	Options           *string `json:"options"`
	CreatedAt         string  `json:"created_at"`
	UpdatedAt         string  `json:"updated_at"`
}

// ConnectionInput 对齐 Node 的 CreateConnectionDTO/UpdateConnectionDTO。
type ConnectionInput struct {
	Name             string
	Protocol         string
	Host             string
	Port             *int64
	Username         string
	Password         string
	SSHKeyPath       string
	SSHKeyPassphrase string
	Options          json.RawMessage
}

type Session struct {
	ID           string  `json:"id"`
	ConnectionID *int64  `json:"connection_id"`
	Protocol     string  `json:"protocol"`
	Host         *string `json:"host"`
	Port         *int64  `json:"port"`
	StartedAt    string  `json:"started_at"`
	EndedAt      *string `json:"ended_at"`
	LogPath      *string `json:"log_path"`
	Status       *string `json:"status"`
}

type Background struct {
	ID           int64   `json:"id"`
	Filename     string  `json:"filename"`
	OriginalName *string `json:"original_name"`
	MimeType     *string `json:"mime_type"`
	Size         *int64  `json:"size"`
	CreatedAt    string  `json:"created_at"`
}

func NewStore(path string) (*Store, error) {
	if dir := filepath.Dir(path); dir != "" {
		if err := os.MkdirAll(dir, 0o755); err != nil {
			return nil, err
		}
	}
	db, err := sql.Open("sqlite", path)
	if err != nil {
		return nil, err
	}
	// 单写多读的本地应用，避免 database is locked
	db.SetMaxOpenConns(1)
	if _, err := db.Exec("PRAGMA journal_mode=WAL"); err != nil {
		db.Close()
		return nil, err
	}
	s := &Store{db: db}
	if err := s.migrate(); err != nil {
		db.Close()
		return nil, err
	}
	return s, nil
}

func (s *Store) Close() { s.db.Close() }

func (s *Store) migrate() error {
	_, err := s.db.Exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS connections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  protocol TEXT NOT NULL,
  host TEXT,
  port INTEGER,
  username TEXT,
  password_encrypted TEXT,
  ssh_key_path TEXT,
  ssh_key_passphrase TEXT,
  options TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  connection_id INTEGER REFERENCES connections(id),
  protocol TEXT NOT NULL,
  host TEXT,
  port INTEGER,
  started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  ended_at DATETIME,
  log_path TEXT,
  status TEXT CHECK(status IN ('active', 'closed', 'error'))
);
CREATE INDEX IF NOT EXISTS idx_sessions_connection ON sessions(connection_id);
CREATE INDEX IF NOT EXISTS idx_sessions_started ON sessions(started_at);
CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS backgrounds (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  filename TEXT NOT NULL,
  original_name TEXT,
  mime_type TEXT,
  size INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
`)
	if err != nil {
		return err
	}

	// Node 版迁移：删除 local 协议连接
	if _, err := s.db.Exec(`DELETE FROM connections WHERE protocol = 'local'`); err != nil {
		return err
	}
	// Node 版迁移：若旧 CHECK(protocol IN ...) 约束存在则重建表
	var sqlText string
	err = s.db.QueryRow(`SELECT sql FROM sqlite_master WHERE type='table' AND name='connections'`).Scan(&sqlText)
	if err != nil {
		return err
	}
	if strings.Contains(sqlText, "CHECK(protocol IN") {
		_, err = s.db.Exec(`
CREATE TABLE IF NOT EXISTS connections_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  protocol TEXT NOT NULL,
  host TEXT,
  port INTEGER,
  username TEXT,
  password_encrypted TEXT,
  ssh_key_path TEXT,
  ssh_key_passphrase TEXT,
  options TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO connections_new SELECT * FROM connections;
DROP TABLE connections;
ALTER TABLE connections_new RENAME TO connections;
`)
	}
	return err
}

// ---- Users ----

func (s *Store) GetUser(username string) (*User, error) {
	var u User
	err := s.db.QueryRow(`SELECT id, username, password_hash FROM users WHERE username = ?`, username).
		Scan(&u.ID, &u.Username, &u.PasswordHash)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	return &u, err
}

func (s *Store) CreateUser(username, hash string) error {
	_, err := s.db.Exec(`INSERT INTO users (username, password_hash) VALUES (?, ?)`, username, hash)
	return err
}

func (s *Store) UpdateUserPassword(id int64, hash string) {
	s.db.Exec(`UPDATE users SET password_hash = ? WHERE id = ?`, hash, id)
}

func (s *Store) UserCount() int {
	var n int
	s.db.QueryRow(`SELECT COUNT(*) FROM users`).Scan(&n)
	return n
}

// ---- Connections ----

// datetime 列 CAST AS TEXT：避免 modernc.org/sqlite 扫成 time.Time，保持与 Node 版相同的 JSON 字符串格式。
const connectionCols = `id, name, protocol, host, port, username, password_encrypted, ssh_key_path, ssh_key_passphrase, options, CAST(created_at AS TEXT) AS created_at, CAST(updated_at AS TEXT) AS updated_at`

func scanConnection(row interface{ Scan(...any) error }) (*Connection, error) {
	var c Connection
	err := row.Scan(&c.ID, &c.Name, &c.Protocol, &c.Host, &c.Port, &c.Username,
		&c.PasswordEncrypted, &c.SSHKeyPath, &c.SSHKeyPassphrase, &c.Options, &c.CreatedAt, &c.UpdatedAt)
	return &c, err
}

func (s *Store) GetConnections() ([]Connection, error) {
	rows, err := s.db.Query(`SELECT ` + connectionCols + ` FROM connections ORDER BY name`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Connection{}
	for rows.Next() {
		c, err := scanConnection(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, *c)
	}
	return out, rows.Err()
}

func (s *Store) GetConnection(id int64) (*Connection, error) {
	c, err := scanConnection(s.db.QueryRow(`SELECT `+connectionCols+` FROM connections WHERE id = ?`, id))
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	return c, err
}

func nullIfEmpty(v string) any {
	if v == "" {
		return nil
	}
	return v
}

func nullIfEmptyJSON(v json.RawMessage) any {
	if len(v) == 0 {
		return nil
	}
	return string(v)
}

func (s *Store) CreateConnection(in ConnectionInput) (*Connection, error) {
	res, err := s.db.Exec(`
INSERT INTO connections (name, protocol, host, port, username, password_encrypted, ssh_key_path, ssh_key_passphrase, options)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		in.Name, in.Protocol, nullIfEmpty(in.Host), in.Port, nullIfEmpty(in.Username),
		nullIfEmpty(in.Password), nullIfEmpty(in.SSHKeyPath), nullIfEmpty(in.SSHKeyPassphrase),
		nullIfEmptyJSON(in.Options))
	if err != nil {
		return nil, err
	}
	id, _ := res.LastInsertId()
	return s.GetConnection(id)
}

func (s *Store) UpdateConnection(id int64, in ConnectionInput) (*Connection, error) {
	existing, err := s.GetConnection(id)
	if err != nil || existing == nil {
		return nil, err
	}
	_, err = s.db.Exec(`
UPDATE connections
SET name = COALESCE(?, name),
    host = COALESCE(?, host),
    port = COALESCE(?, port),
    username = COALESCE(?, username),
    password_encrypted = COALESCE(?, password_encrypted),
    ssh_key_path = COALESCE(?, ssh_key_path),
    ssh_key_passphrase = COALESCE(?, ssh_key_passphrase),
    options = COALESCE(?, options),
    updated_at = CURRENT_TIMESTAMP
WHERE id = ?`,
		nullIfEmpty(in.Name), nullIfEmpty(in.Host), in.Port, nullIfEmpty(in.Username),
		nullIfEmpty(in.Password), nullIfEmpty(in.SSHKeyPath), nullIfEmpty(in.SSHKeyPassphrase),
		nullIfEmptyJSON(in.Options), id)
	if err != nil {
		return nil, err
	}
	return s.GetConnection(id)
}

func (s *Store) DeleteConnection(id int64) (bool, error) {
	res, err := s.db.Exec(`DELETE FROM connections WHERE id = ?`, id)
	if err != nil {
		return false, err
	}
	n, _ := res.RowsAffected()
	return n > 0, nil
}

// ---- Sessions ----

const sessionCols = `id, connection_id, protocol, host, port, CAST(started_at AS TEXT) AS started_at, CAST(ended_at AS TEXT) AS ended_at, log_path, status`

func (s *Store) GetSessions() ([]Session, error) {
	rows, err := s.db.Query(`SELECT ` + sessionCols + ` FROM sessions ORDER BY started_at DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Session{}
	for rows.Next() {
		var sess Session
		if err := rows.Scan(&sess.ID, &sess.ConnectionID, &sess.Protocol, &sess.Host, &sess.Port,
			&sess.StartedAt, &sess.EndedAt, &sess.LogPath, &sess.Status); err != nil {
			return nil, err
		}
		out = append(out, sess)
	}
	return out, rows.Err()
}

func (s *Store) CreateSession(id, protocol string, host string, port *int64) error {
	_, err := s.db.Exec(`
INSERT INTO sessions (id, connection_id, protocol, host, port, status)
VALUES (?, NULL, ?, ?, ?, 'active')`, id, protocol, nullIfEmpty(host), port)
	return err
}

func (s *Store) UpdateSessionStatus(id, status string) error {
	_, err := s.db.Exec(`
UPDATE sessions SET status = ?, ended_at = CURRENT_TIMESTAMP WHERE id = ?`, status, id)
	return err
}

// ---- Settings ----

func (s *Store) GetSettings() (json.RawMessage, error) {
	var v string
	err := s.db.QueryRow(`SELECT value FROM settings WHERE key = 'app'`).Scan(&v)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return json.RawMessage(v), nil
}

func (s *Store) SaveSettings(v json.RawMessage) error {
	_, err := s.db.Exec(`
INSERT INTO settings (key, value, updated_at) VALUES ('app', ?, CURRENT_TIMESTAMP)
ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP`, string(v))
	return err
}

// ---- Backgrounds ----

const backgroundCols = `id, filename, original_name, mime_type, size, CAST(created_at AS TEXT) AS created_at`

func scanBackground(row interface{ Scan(...any) error }) (*Background, error) {
	var b Background
	err := row.Scan(&b.ID, &b.Filename, &b.OriginalName, &b.MimeType, &b.Size, &b.CreatedAt)
	return &b, err
}

func (s *Store) ListBackgrounds() ([]Background, error) {
	rows, err := s.db.Query(`SELECT ` + backgroundCols + ` FROM backgrounds ORDER BY created_at DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Background{}
	for rows.Next() {
		b, err := scanBackground(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, *b)
	}
	return out, rows.Err()
}

func (s *Store) CreateBackground(filename, origName, mime string, size int64) (int64, error) {
	res, err := s.db.Exec(`
INSERT INTO backgrounds (filename, original_name, mime_type, size) VALUES (?, ?, ?, ?)`,
		filename, origName, mime, size)
	if err != nil {
		return 0, err
	}
	return res.LastInsertId()
}

func (s *Store) GetBackground(id int64) (*Background, error) {
	b, err := scanBackground(s.db.QueryRow(`SELECT `+backgroundCols+` FROM backgrounds WHERE id = ?`, id))
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	return b, err
}

func (s *Store) DeleteBackground(id int64) (bool, error) {
	res, err := s.db.Exec(`DELETE FROM backgrounds WHERE id = ?`, id)
	if err != nil {
		return false, err
	}
	n, _ := res.RowsAffected()
	return n > 0, nil
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `cd go-server && go test ./...`
Expected: PASS（8 个 store 测试 + 之前 4 个）

- [ ] **Step 5: Commit**

```bash
git add go-server/store.go go-server/store_test.go go-server/go.mod go-server/go.sum
git commit -m "feat(go): sqlite store layer with full schema parity"
```

---

### Task 3: auth.go — session 存储与认证

**Files:**
- Create: `go-server/auth.go`、`go-server/auth_test.go`

**Interfaces:**
- Consumes: Task 2 的 `Store`、`User`；Task 1 的 `Config`
- Produces:
  - `type SessionData struct { UserID int64; Username string; ExpiresAt time.Time }`
  - `type SessionStore struct{...}`，`func NewSessionStore(secret string, maxAge time.Duration) *SessionStore`
  - `func (s *SessionStore) Create(userID int64, username string) string`（返回签名 cookie 值）
  - `func (s *SessionStore) FromRequest(r *http.Request) *SessionData`（解析+验签+查过期，无效返回 nil）
  - `func (s *SessionStore) DestroyCookieValue(v string)`
  - `type Auth struct { Store *Store; Sessions *SessionStore; MaxAge time.Duration }`
  - `func (a *Auth) Login(w http.ResponseWriter, r *http.Request)`、`func (a *Auth) Logout(w http.ResponseWriter, r *http.Request)`、`func (a *Auth) ChangePassword(w http.ResponseWriter, r *http.Request)`
  - `func (a *Auth) RequireAuth(next http.HandlerFunc) http.HandlerFunc`
  - `func SessionFromCtx(ctx context.Context) *SessionData`
  - `func InitializeDefaultUser(store *Store, cfg Config) error`
  - `func writeJSON(w http.ResponseWriter, status int, v any)`、`func writeErr(w http.ResponseWriter, status int, msg string)`（JSON `{"error": msg}`，全项目复用）

**关键实现细节：**
- cookie 名 `connect.sid`；值 = `<32hex随机id>.<hex(HMAC-SHA256(id, secret))>`
- cookie 属性：Path=/、HttpOnly、SameSite=Lax、MaxAge=int(maxAge秒)、`Secure = r.TLS != nil || r.Header.Get("X-Forwarded-Proto") == "https"`（对齐 express-session `secure:'auto'` + trust proxy）
- Login 同时支持 JSON body 和 form（express 两个 body parser 都挂了；前端用 JSON）
- ChangePassword：校验 currentPassword（bcrypt 对比 DB 哈希）、newPassword 长度 ≥6，错误消息与 Node 版逐字一致（见实现代码）
- bcrypt 用 `golang.org/x/crypto/bcrypt`，`bcrypt.GenerateFromPassword(pw, 10)`（SALT_ROUNDS=10）

- [ ] **Step 1: 写失败测试 `go-server/auth_test.go`**

```go
package main

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestSessionStoreRoundTrip(t *testing.T) {
	ss := NewSessionStore("secret", time.Hour)
	cv := ss.Create(7, "alice")
	if cv == "" {
		t.Fatal("empty cookie value")
	}
	r := httptest.NewRequest("GET", "/", nil)
	r.AddCookie(&http.Cookie{Name: "connect.sid", Value: cv})
	sd := ss.FromRequest(r)
	if sd == nil || sd.UserID != 7 || sd.Username != "alice" {
		t.Fatalf("FromRequest = %+v", sd)
	}

	// 篡改签名必须失败
	parts := strings.Split(cv, ".")
	bad := parts[0] + "." + strings.Repeat("0", len(parts[1]))
	r2 := httptest.NewRequest("GET", "/", nil)
	r2.AddCookie(&http.Cookie{Name: "connect.sid", Value: bad})
	if sd := ss.FromRequest(r2); sd != nil {
		t.Errorf("tampered cookie should be rejected")
	}

	// 无 cookie
	r3 := httptest.NewRequest("GET", "/", nil)
	if sd := ss.FromRequest(r3); sd != nil {
		t.Errorf("no cookie should be nil")
	}

	// Destroy 后失效
	ss.DestroyCookieValue(cv)
	r4 := httptest.NewRequest("GET", "/", nil)
	r4.AddCookie(&http.Cookie{Name: "connect.sid", Value: cv})
	if sd := ss.FromRequest(r4); sd != nil {
		t.Errorf("destroyed session should be nil")
	}
}

func TestSessionStoreExpiry(t *testing.T) {
	ss := NewSessionStore("secret", time.Millisecond*50)
	cv := ss.Create(1, "bob")
	time.Sleep(time.Millisecond * 80)
	r := httptest.NewRequest("GET", "/", nil)
	r.AddCookie(&http.Cookie{Name: "connect.sid", Value: cv})
	if sd := ss.FromRequest(r); sd != nil {
		t.Errorf("expired session should be nil")
	}
}

func TestSessionCookieFormat(t *testing.T) {
	// 验证签名算法：value = id.hex(hmac-sha256(id, secret))
	ss := NewSessionStore("topsecret", time.Hour)
	cv := ss.Create(1, "x")
	id, sig, _ := strings.Cut(cv, ".")
	mac := hmac.New(sha256.New, []byte("topsecret"))
	mac.Write([]byte(id))
	if hex.EncodeToString(mac.Sum(nil)) != sig {
		t.Errorf("signature mismatch")
	}
}

func TestLoginHandler(t *testing.T) {
	store := newTestStore(t)
	if err := InitializeDefaultUser(store, Config{AdminUser: "admin", AdminPass: "admin"}); err != nil {
		t.Fatalf("InitializeDefaultUser: %v", err)
	}
	// 再次调用不应重复创建
	InitializeDefaultUser(store, Config{AdminUser: "admin", AdminPass: "admin"})
	if n := store.UserCount(); n != 1 {
		t.Fatalf("UserCount = %d, want 1", n)
	}

	a := &Auth{Store: store, Sessions: NewSessionStore("s", time.Hour), MaxAge: time.Hour}

	// 错误密码 → 401
	req := httptest.NewRequest("POST", "/api/auth/login", strings.NewReader(`{"username":"admin","password":"wrong"}`))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	a.Login(rec, req)
	if rec.Code != 401 {
		t.Errorf("wrong password: code = %d, want 401", rec.Code)
	}

	// 缺字段 → 400
	req = httptest.NewRequest("POST", "/api/auth/login", strings.NewReader(`{"username":""}`))
	req.Header.Set("Content-Type", "application/json")
	rec = httptest.NewRecorder()
	a.Login(rec, req)
	if rec.Code != 400 {
		t.Errorf("missing fields: code = %d, want 400", rec.Code)
	}

	// 正确 → 200 + {success:true,username} + connect.sid cookie
	req = httptest.NewRequest("POST", "/api/auth/login", strings.NewReader(`{"username":"admin","password":"admin"}`))
	req.Header.Set("Content-Type", "application/json")
	rec = httptest.NewRecorder()
	a.Login(rec, req)
	if rec.Code != 200 {
		t.Fatalf("login: code = %d, want 200", rec.Code)
	}
	var body map[string]any
	json.Unmarshal(rec.Body.Bytes(), &body)
	if body["success"] != true || body["username"] != "admin" {
		t.Errorf("body = %v", body)
	}
	var sid *http.Cookie
	for _, c := range rec.Result().Cookies() {
		if c.Name == "connect.sid" {
			sid = c
		}
	}
	if sid == nil || !sid.HttpOnly || sid.Path != "/" || sid.MaxAge != 3600 {
		t.Errorf("cookie = %+v", sid)
	}
}

func TestRequireAuth(t *testing.T) {
	store := newTestStore(t)
	a := &Auth{Store: store, Sessions: NewSessionStore("s", time.Hour), MaxAge: time.Hour}

	okHandler := a.RequireAuth(func(w http.ResponseWriter, r *http.Request) {
		sd := SessionFromCtx(r.Context())
		if sd == nil || sd.Username != "admin" {
			t.Errorf("ctx session = %+v", sd)
		}
		w.WriteHeader(204)
	})

	// 无 cookie → 401 JSON
	rec := httptest.NewRecorder()
	okHandler(rec, httptest.NewRequest("GET", "/", nil))
	if rec.Code != 401 {
		t.Errorf("no auth: code = %d", rec.Code)
	}
	if !strings.Contains(rec.Body.String(), "Authentication required") {
		t.Errorf("body = %s", rec.Body.String())
	}

	// 有效 cookie → 204
	cv := a.Sessions.Create(1, "admin")
	req := httptest.NewRequest("GET", "/", nil)
	req.AddCookie(&http.Cookie{Name: "connect.sid", Value: cv})
	rec = httptest.NewRecorder()
	okHandler(rec, req)
	if rec.Code != 204 {
		t.Errorf("with auth: code = %d", rec.Code)
	}
}

func TestChangePassword(t *testing.T) {
	store := newTestStore(t)
	InitializeDefaultUser(store, Config{AdminUser: "admin", AdminPass: "oldpass"})
	a := &Auth{Store: store, Sessions: NewSessionStore("s", time.Hour), MaxAge: time.Hour}
	cv := a.Sessions.Create(1, "admin")

	do := func(body string) *httptest.ResponseRecorder {
		req := httptest.NewRequest("POST", "/api/auth/change-password", strings.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		req.AddCookie(&http.Cookie{Name: "connect.sid", Value: cv})
		rec := httptest.NewRecorder()
		a.RequireAuth(a.ChangePassword)(rec, req)
		return rec
	}

	if rec := do(`{"currentPassword":"wrong","newPassword":"newpass1"}`); rec.Code != 401 {
		t.Errorf("wrong current: %d", rec.Code)
	}
	if rec := do(`{"currentPassword":"oldpass","newPassword":"12345"}`); rec.Code != 400 {
		t.Errorf("short new: %d", rec.Code)
	}
	if rec := do(`{"currentPassword":"oldpass","newPassword":"newpass1"}`); rec.Code != 200 {
		t.Fatalf("change: %d", rec.Code)
	}
	// 用新密码能登录
	req := httptest.NewRequest("POST", "/api/auth/login", strings.NewReader(`{"username":"admin","password":"newpass1"}`))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	a.Login(rec, req)
	if rec.Code != 200 {
		t.Errorf("login with new password: %d", rec.Code)
	}
}
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd go-server && go test ./...`
Expected: 编译失败 `undefined: NewSessionStore` 等

- [ ] **Step 3: 实现 `go-server/auth.go`**

```bash
cd go-server
go get golang.org/x/crypto
```

`go-server/auth.go`:

```go
package main

import (
	"context"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"log/slog"
	"net/http"
	"strings"
	"sync"
	"time"

	"golang.org/x/crypto/bcrypt"
)

const sessionCookieName = "connect.sid"

// ---- JSON helpers（全项目复用） ----

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v)
}

func writeErr(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, map[string]string{"error": msg})
}

// ---- Session store ----

type SessionData struct {
	UserID    int64
	Username  string
	ExpiresAt time.Time
}

type SessionStore struct {
	secret  string
	maxAge  time.Duration
	mu      sync.Mutex
	entries map[string]*SessionData
}

func NewSessionStore(secret string, maxAge time.Duration) *SessionStore {
	return &SessionStore{secret: secret, maxAge: maxAge, entries: map[string]*SessionData{}}
}

func randomHex(n int) string {
	b := make([]byte, n)
	if _, err := rand.Read(b); err != nil {
		panic(err)
	}
	return hex.EncodeToString(b)
}

func (s *SessionStore) sign(id string) string {
	mac := hmac.New(sha256.New, []byte(s.secret))
	mac.Write([]byte(id))
	return hex.EncodeToString(mac.Sum(nil))
}

// Create 生成会话并返回签名后的 cookie 值。
func (s *SessionStore) Create(userID int64, username string) string {
	id := randomHex(16)
	s.mu.Lock()
	s.entries[id] = &SessionData{UserID: userID, Username: username, ExpiresAt: time.Now().Add(s.maxAge)}
	s.mu.Unlock()
	return id + "." + s.sign(id)
}

func (s *SessionStore) parseCookieValue(v string) (string, bool) {
	id, sig, ok := strings.Cut(v, ".")
	if !ok || id == "" {
		return "", false
	}
	if !hmac.Equal([]byte(sig), []byte(s.sign(id))) {
		return "", false
	}
	return id, true
}

// FromRequest 解析 connect.sid cookie、验签、查过期。
func (s *SessionStore) FromRequest(r *http.Request) *SessionData {
	c, err := r.Cookie(sessionCookieName)
	if err != nil {
		return nil
	}
	id, ok := s.parseCookieValue(c.Value)
	if !ok {
		return nil
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	sd, ok := s.entries[id]
	if !ok || time.Now().After(sd.ExpiresAt) {
		delete(s.entries, id)
		return nil
	}
	return sd
}

func (s *SessionStore) DestroyCookieValue(v string) {
	if id, ok := s.parseCookieValue(v); ok {
		s.mu.Lock()
		delete(s.entries, id)
		s.mu.Unlock()
	}
}

func (s *SessionStore) setCookie(w http.ResponseWriter, r *http.Request, value string) {
	http.SetCookie(w, &http.Cookie{
		Name:     sessionCookieName,
		Value:    value,
		Path:     "/",
		MaxAge:   int(s.maxAge.Seconds()),
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
		Secure:   r.TLS != nil || r.Header.Get("X-Forwarded-Proto") == "https",
	})
}

// ---- Auth handlers ----

type ctxKey int

const ctxSessionKey ctxKey = iota

func SessionFromCtx(ctx context.Context) *SessionData {
	sd, _ := ctx.Value(ctxSessionKey).(*SessionData)
	return sd
}

type Auth struct {
	Store    *Store
	Sessions *SessionStore
	MaxAge   time.Duration
}

// InitializeDefaultUser 对齐 Node 版：users 表为空时创建默认管理员。
func InitializeDefaultUser(store *Store, cfg Config) error {
	if store.UserCount() != 0 {
		return nil
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(cfg.AdminPass), 10)
	if err != nil {
		return err
	}
	if err := store.CreateUser(cfg.AdminUser, string(hash)); err != nil {
		return err
	}
	slog.Info("Default user created", "username", cfg.AdminUser)
	return nil
}

func (a *Auth) parseCredentials(r *http.Request) (string, string) {
	if strings.HasPrefix(r.Header.Get("Content-Type"), "application/json") {
		var body struct {
			Username string `json:"username"`
			Password string `json:"password"`
		}
		json.NewDecoder(r.Body).Decode(&body)
		return body.Username, body.Password
	}
	r.ParseForm()
	return r.FormValue("username"), r.FormValue("password")
}

func (a *Auth) Login(w http.ResponseWriter, r *http.Request) {
	username, password := a.parseCredentials(r)
	if username == "" || password == "" {
		writeErr(w, 400, "Username and password required")
		return
	}
	user, err := a.Store.GetUser(username)
	if err != nil || user == nil {
		slog.Warn("Login failed: user not found", "username", username)
		writeErr(w, 401, "Invalid credentials")
		return
	}
	if bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(password)) != nil {
		slog.Warn("Login failed: invalid password", "username", username)
		writeErr(w, 401, "Invalid credentials")
		return
	}
	a.Sessions.setCookie(w, r, a.Sessions.Create(user.ID, user.Username))
	slog.Info("User logged in", "username", username)
	writeJSON(w, 200, map[string]any{"success": true, "username": user.Username})
}

func (a *Auth) Logout(w http.ResponseWriter, r *http.Request) {
	if c, err := r.Cookie(sessionCookieName); err == nil {
		a.Sessions.DestroyCookieValue(c.Value)
	}
	writeJSON(w, 200, map[string]bool{"success": true})
}

func (a *Auth) ChangePassword(w http.ResponseWriter, r *http.Request) {
	var body struct {
		CurrentPassword string `json:"currentPassword"`
		NewPassword     string `json:"newPassword"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeErr(w, 400, "Current password and new password are required")
		return
	}
	if body.CurrentPassword == "" || body.NewPassword == "" {
		writeErr(w, 400, "Current password and new password are required")
		return
	}
	if len(body.NewPassword) < 6 {
		writeErr(w, 400, "New password must be at least 6 characters")
		return
	}
	sd := SessionFromCtx(r.Context())
	user, err := a.Store.GetUser(sd.Username)
	if err != nil || user == nil {
		writeErr(w, 404, "User not found")
		return
	}
	if bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(body.CurrentPassword)) != nil {
		writeErr(w, 401, "Current password is incorrect")
		return
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(body.NewPassword), 10)
	if err != nil {
		writeErr(w, 500, "Internal error")
		return
	}
	a.Store.UpdateUserPassword(user.ID, string(hash))
	slog.Info("Password changed", "username", sd.Username)
	writeJSON(w, 200, map[string]bool{"success": true})
}

func (a *Auth) RequireAuth(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		sd := a.Sessions.FromRequest(r)
		if sd == nil {
			writeErr(w, 401, "Authentication required")
			return
		}
		next(w, r.WithContext(context.WithValue(r.Context(), ctxSessionKey, sd)))
	}
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `cd go-server && go test ./...`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add go-server/auth.go go-server/auth_test.go go-server/go.mod go-server/go.sum
git commit -m "feat(go): session store and auth handlers"
```

---

### Task 4: telnet.go — Telnet 协议会话

**Files:**
- Create: `go-server/telnet.go`、`go-server/telnet_test.go`

**Interfaces:**
- Produces:
  - `type SessionHandlers struct { Data func(string); Close func(); Error func(error) }`（ssh.go 共用）
  - `type SessionOptions struct { Host string; Port int; Username string; Password string; PrivateKey string; Passphrase string; Cols int; Rows int }`（ssh.go 共用）
  - `type TerminalSession interface { Write(data string); Resize(cols, rows int); Close() }`（ssh.go 共用）
  - `func processTelnetData(data []byte, respond func([]byte)) string`（纯函数，IAC 状态机）
  - `func nawsMessage(cols, rows int) []byte`
  - `func DialTelnet(opts SessionOptions, h SessionHandlers) (TerminalSession, error)`

**关键实现细节（严格对齐 Node 版 src/protocols/telnet.ts）：**
- 连接超时 10s；连接成功即发协商 `{255,251,3, 255,251,1, 255,253,31}`，然后发 NAWS（若有 cols/rows）
- IAC 解析逐字节对齐 Node 逻辑，包括边界行为（缓冲区末尾的不完整 IAC 按原样字节输出）
- **重要**：Node 用 `String.fromCharCode(byte)` 把每个字节映射为 U+00XX（latin1），Go 必须 `WriteRune(rune(b))` 而非 `WriteByte`，否则高位字节在 JSON 输出时会变成 U+FFFD（与 Node 行为不一致）
- 空结果不触发 Data 回调（Node `return result || null`）

- [ ] **Step 1: 写失败测试 `go-server/telnet_test.go`**

```go
package main

import (
	"testing"
)

func TestProcessTelnetDataPlainText(t *testing.T) {
	var responses [][]byte
	respond := func(b []byte) { responses = append(responses, b) }
	out := processTelnetData([]byte("hello world"), respond)
	if out != "hello world" {
		t.Errorf("out = %q", out)
	}
	if len(responses) != 0 {
		t.Errorf("responses = %v", responses)
	}
}

func TestProcessTelnetDataWillWont(t *testing.T) {
	var responses [][]byte
	respond := func(b []byte) { responses = append(responses, b) }
	// IAC WILL ECHO(1) → 回复 IAC DO ECHO；IAC WONT SGA(3) → 回复 IAC DONT SGA
	out := processTelnetData([]byte{255, 251, 1, 255, 252, 3}, respond)
	if out != "" {
		t.Errorf("out = %q, want empty", out)
	}
	if len(responses) != 2 {
		t.Fatalf("responses = %v", responses)
	}
	if responses[0][0] != 255 || responses[0][1] != 253 || responses[0][2] != 1 {
		t.Errorf("WILL should be answered with DO: %v", responses[0])
	}
	if responses[1][0] != 255 || responses[1][1] != 254 || responses[1][2] != 3 {
		t.Errorf("WONT should be answered with DONT: %v", responses[1])
	}
}

func TestProcessTelnetDataDoDont(t *testing.T) {
	var responses [][]byte
	respond := func(b []byte) { responses = append(responses, b) }
	// IAC DO NAWS(31) → IAC WILL NAWS；IAC DONT ECHO(1) → IAC WONT ECHO
	out := processTelnetData([]byte{255, 253, 31, 255, 254, 1}, respond)
	if out != "" {
		t.Errorf("out = %q", out)
	}
	if responses[0][1] != 251 || responses[0][2] != 31 {
		t.Errorf("DO should be answered with WILL: %v", responses[0])
	}
	if responses[1][1] != 252 || responses[1][2] != 1 {
		t.Errorf("DONT should be answered with WONT: %v", responses[1])
	}
}

func TestProcessTelnetDataEscapedIAC(t *testing.T) {
	out := processTelnetData([]byte{'a', 255, 255, 'b'}, func([]byte) {})
	if out != "aÿb" {
		t.Errorf("out = %q, want aÿb", out)
	}
}

func TestProcessTelnetDataSubnegotiation(t *testing.T) {
	// SE(240) 及其他命令：跳过 2 字节
	out := processTelnetData([]byte{255, 240, 'x'}, func([]byte) {})
	if out != "x" {
		t.Errorf("out = %q, want x", out)
	}
}

func TestProcessTelnetDataHighBytesLatin1(t *testing.T) {
	// Node String.fromCharCode(0xE9) → U+00E9 "é"
	out := processTelnetData([]byte{0xE9}, func([]byte) {})
	if out != "é" {
		t.Errorf("out = %q, want é", out)
	}
}

func TestProcessTelnetDataMixed(t *testing.T) {
	var responses [][]byte
	respond := func(b []byte) { responses = append(responses, b) }
	out := processTelnetData([]byte{'h', 'i', 255, 251, 1, '!'}, respond)
	if out != "hi!" {
		t.Errorf("out = %q", out)
	}
	if len(responses) != 1 {
		t.Errorf("responses = %v", responses)
	}
}

func TestNAWSBytes(t *testing.T) {
	got := nawsMessage(132, 43)
	want := []byte{255, 250, 31, 0, 132, 0, 43, 255, 240}
	if len(got) != len(want) {
		t.Fatalf("len = %d, want %d", len(got), len(want))
	}
	for i := range want {
		if got[i] != want[i] {
			t.Fatalf("byte %d = %d, want %d", i, got[i], want[i])
		}
	}
}
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd go-server && go test -run 'TestProcessTelnet|TestNAWS' .`
Expected: 编译失败 `undefined: processTelnetData`

- [ ] **Step 3: 实现 `go-server/telnet.go`**

```go
package main

import (
	"fmt"
	"log/slog"
	"net"
	"strings"
	"sync"
	"sync/atomic"
	"time"
)

// ---- 共用类型（ssh.go 也使用） ----

type SessionHandlers struct {
	Data  func(string)
	Close func()
	Error func(error)
}

type SessionOptions struct {
	Host       string
	Port       int
	Username   string
	Password   string
	PrivateKey string
	Passphrase string
	Cols       int
	Rows       int
}

type TerminalSession interface {
	Write(data string)
	Resize(cols, rows int)
	Close()
}

// ---- Telnet ----

type TelnetSession struct {
	conn      net.Conn
	writeMu   sync.Mutex
	handlers  SessionHandlers
	connected atomic.Bool
	closeOnce sync.Once
}

const telnetDialTimeout = 10 * time.Second

func DialTelnet(opts SessionOptions, h SessionHandlers) (TerminalSession, error) {
	conn, err := net.DialTimeout("tcp", net.JoinHostPort(opts.Host, fmt.Sprint(opts.Port)), telnetDialTimeout)
	if err != nil {
		return nil, err
	}
	s := &TelnetSession{conn: conn, handlers: h}
	s.connected.Store(true)
	slog.Info("Telnet connected", "host", opts.Host, "port", opts.Port)

	// 初始协商：WILL SGA, WILL ECHO, DO NAWS（对齐 Node 版）
	s.writeRaw([]byte{255, 251, 3, 255, 251, 1, 255, 253, 31})
	if opts.Cols > 0 && opts.Rows > 0 {
		s.Resize(opts.Cols, opts.Rows)
	}

	go s.readLoop()
	return s, nil
}

func (s *TelnetSession) readLoop() {
	buf := make([]byte, 32*1024)
	for {
		n, err := s.conn.Read(buf)
		if n > 0 {
			out := processTelnetData(buf[:n], s.writeRaw)
			if out != "" && s.handlers.Data != nil {
				s.handlers.Data(out)
			}
		}
		if err != nil {
			s.doClose()
			return
		}
	}
}

func (s *TelnetSession) doClose() {
	s.closeOnce.Do(func() {
		s.connected.Store(false)
		s.conn.Close()
		if s.handlers.Close != nil {
			s.handlers.Close()
		}
	})
}

func (s *TelnetSession) writeRaw(b []byte) {
	s.writeMu.Lock()
	defer s.writeMu.Unlock()
	if s.connected.Load() {
		s.conn.Write(b)
	}
}

func (s *TelnetSession) Write(data string) {
	s.writeRaw([]byte(data))
}

func (s *TelnetSession) Resize(cols, rows int) {
	s.writeRaw(nawsMessage(cols, rows))
}

func (s *TelnetSession) Close() {
	s.doClose()
}

func nawsMessage(cols, rows int) []byte {
	return []byte{
		255, 250, 31,
		byte(cols >> 8), byte(cols),
		byte(rows >> 8), byte(rows),
		255, 240,
	}
}

// processTelnetData 逐字节对齐 Node 版 processTelnetData 的 IAC 状态机。
// 注意：高位字节按 latin1 映射为 rune（对齐 Node 的 String.fromCharCode）。
func processTelnetData(data []byte, respond func([]byte)) string {
	var b strings.Builder
	i := 0
	for i < len(data) {
		if data[i] == 255 && i+2 < len(data) {
			cmd, opt := data[i+1], data[i+2]
			switch cmd {
			case 251: // WILL → DO
				respond([]byte{255, 253, opt})
				i += 3
			case 252: // WONT → DONT
				respond([]byte{255, 254, opt})
				i += 3
			case 253: // DO → WILL
				respond([]byte{255, 251, opt})
				i += 3
			case 254: // DONT → WONT
				respond([]byte{255, 252, opt})
				i += 3
			default: // SE(240) 及其他：跳过 2 字节
				i += 2
			}
		} else if data[i] == 255 && i+1 < len(data) && data[i+1] == 255 {
			b.WriteRune(255) // escaped IAC
			i += 2
		} else {
			b.WriteRune(rune(data[i]))
			i++
		}
	}
	return b.String()
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `cd go-server && go test ./...`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add go-server/telnet.go go-server/telnet_test.go
git commit -m "feat(go): telnet protocol session with IAC/NAWS parity"
```

---

### Task 5: ssh.go — SSH 协议会话

**Files:**
- Create: `go-server/ssh.go`

**Interfaces:**
- Consumes: Task 4 的 `TerminalSession`、`SessionOptions`、`SessionHandlers`
- Produces: `func DialSSH(opts SessionOptions, h SessionHandlers) (TerminalSession, error)`

**关键实现细节（对齐 Node 版 src/protocols/ssh.ts）：**
- `HostKeyCallback: ssh.InsecureIgnoreHostKey()`（Node ssh2 默认不校验主机密钥，保持行为一致）
- 连接超时 10s（readyTimeout）；每 10s 发 `keepalive@openssh.com` 全局请求（keepaliveInterval）
- PTY：`term=xterm-256color`，注意 x/crypto/ssh `RequestPty(term, height, width, modes)` 是高在前
- stderr 合并进 Data 输出（对齐 Node `stream.stderr.on('data')`）
- 输出转字符串时 `strings.ToValidUTF8(s, "\uFFFD")`（对齐 Node Buffer.toString 的 lossy UTF-8）
- 私钥认证：`ssh.ParsePrivateKey` / `ssh.ParsePrivateKeyWithPassphrase`
- 活跃 SSH 连接无法单测（需要真实 SSH 服务器），本任务只编译验证，集成验证在 Task 11/12

- [ ] **Step 1: 实现 `go-server/ssh.go`**

```go
package main

import (
	"io"
	"log/slog"
	"net"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"golang.org/x/crypto/ssh"
)

type SSHSession struct {
	client   *ssh.Client
	session  *ssh.Session
	stdin    io.WriteCloser
	writeMu  sync.Mutex
	handlers SessionHandlers

	connected  atomic.Bool
	closeOnce  sync.Once
	keepaliveC chan struct{}
}

const sshDialTimeout = 10 * time.Second

func DialSSH(opts SessionOptions, h SessionHandlers) (TerminalSession, error) {
	cfg := &ssh.ClientConfig{
		User:            opts.Username,
		HostKeyCallback: ssh.InsecureIgnoreHostKey(), // 对齐 Node ssh2 默认行为
		Timeout:         sshDialTimeout,
	}
	if opts.Password != "" {
		cfg.Auth = append(cfg.Auth, ssh.Password(opts.Password))
	}
	if opts.PrivateKey != "" {
		var signer ssh.Signer
		var err error
		if opts.Passphrase != "" {
			signer, err = ssh.ParsePrivateKeyWithPassphrase([]byte(opts.PrivateKey), []byte(opts.Passphrase))
		} else {
			signer, err = ssh.ParsePrivateKey([]byte(opts.PrivateKey))
		}
		if err != nil {
			return nil, err
		}
		cfg.Auth = append(cfg.Auth, ssh.PublicKeys(signer))
	}

	addr := net.JoinHostPort(opts.Host, strconv.Itoa(opts.Port))
	client, err := ssh.Dial("tcp", addr, cfg)
	if err != nil {
		return nil, err
	}

	sess, err := client.NewSession()
	if err != nil {
		client.Close()
		return nil, err
	}

	cols, rows := opts.Cols, opts.Rows
	if cols <= 0 {
		cols = 80
	}
	if rows <= 0 {
		rows = 24
	}
	// RequestPty(term, height, width, modes) — 高在前
	if err := sess.RequestPty("xterm-256color", rows, cols, ssh.TerminalModes{}); err != nil {
		sess.Close()
		client.Close()
		return nil, err
	}

	stdout, err := sess.StdoutPipe()
	if err != nil {
		sess.Close()
		client.Close()
		return nil, err
	}
	stderr, err := sess.StderrPipe()
	if err != nil {
		sess.Close()
		client.Close()
		return nil, err
	}
	stdin, err := sess.StdinPipe()
	if err != nil {
		sess.Close()
		client.Close()
		return nil, err
	}

	if err := sess.Shell(); err != nil {
		sess.Close()
		client.Close()
		return nil, err
	}

	s := &SSHSession{
		client:     client,
		session:    sess,
		stdin:      stdin,
		handlers:   h,
		keepaliveC: make(chan struct{}),
	}
	s.connected.Store(true)
	slog.Info("SSH connected", "host", opts.Host, "port", opts.Port)

	go s.pump(stdout)
	go s.pump(stderr)
	go s.wait()
	go s.keepalive()
	return s, nil
}

// pump 把流数据转发给 Data 回调（lossy UTF-8，对齐 Node toString）。
func (s *SSHSession) pump(r io.Reader) {
	buf := make([]byte, 32*1024)
	for {
		n, err := r.Read(buf)
		if n > 0 && s.handlers.Data != nil {
			s.handlers.Data(strings.ToValidUTF8(string(buf[:n]), "�"))
		}
		if err != nil {
			return
		}
	}
}

func (s *SSHSession) wait() {
	s.session.Wait()
	s.doClose()
}

func (s *SSHSession) keepalive() {
	t := time.NewTicker(10 * time.Second)
	defer t.Stop()
	for {
		select {
		case <-s.keepaliveC:
			return
		case <-t.C:
			if _, _, err := s.client.SendRequest("keepalive@openssh.com", true, nil); err != nil {
				s.doClose()
				return
			}
		}
	}
}

func (s *SSHSession) doClose() {
	s.closeOnce.Do(func() {
		s.connected.Store(false)
		close(s.keepaliveC)
		s.session.Close()
		s.client.Close()
		if s.handlers.Close != nil {
			s.handlers.Close()
		}
	})
}

func (s *SSHSession) Write(data string) {
	s.writeMu.Lock()
	defer s.writeMu.Unlock()
	if s.connected.Load() {
		io.WriteString(s.stdin, data)
	}
}

func (s *SSHSession) Resize(cols, rows int) {
	if s.connected.Load() {
		s.session.WindowChange(rows, cols) // 高在前
	}
}

func (s *SSHSession) Close() {
	s.doClose()
}
```

- [ ] **Step 2: 编译检查 + 全量测试**

Run: `cd go-server && go vet ./... && go test ./...`
Expected: 编译通过，已有测试全 PASS

- [ ] **Step 3: Commit**

```bash
git add go-server/ssh.go
git commit -m "feat(go): ssh session via x/crypto/ssh"
```

---

### Task 6: session.go — 会话管理器

**Files:**
- Create: `go-server/session.go`、`go-server/session_test.go`

**Interfaces:**
- Consumes: Task 4/5 的 `TerminalSession`、`SessionOptions`、`SessionHandlers`、`DialSSH`、`DialTelnet`；Task 2 的 `Store`
- Produces:
  - `type WSWriter interface { Send(v any) error }`（ws.go 的 wsConn 实现）
  - `type Dialer func(opts SessionOptions, h SessionHandlers) (TerminalSession, error)`
  - `type Manager struct{...}`，`func NewManager(store *Store) *Manager`、`func (m *Manager) SetDialers(ssh, telnet Dialer)`（测试注入）
  - `func (m *Manager) Create(w WSWriter, wsID, protocol string, opts SessionOptions) (string, error)`
  - `func (m *Manager) Input(sessionID, data string)`、`func (m *Manager) Resize(sessionID string, cols, rows int)`、`func (m *Manager) CloseSession(sessionID string)`、`func (m *Manager) CloseAll()`、`func (m *Manager) CleanupWS(wsID string)`
  - 测试辅助（小写方法）：`func (m *Manager) get(sessionID string) (*activeSession, bool)`、`func (m *Manager) count() int`
  - `func newUUID() string`（v4 UUID，crypto/rand 手写，不引依赖）

**关键实现细节（对齐 Node 版 src/services/session-manager.ts）：**
- Create 成功后才写 DB（`status='active'`）；Close 时 `UpdateSessionStatus(id, "closed")`
- Data 回调 → `{type:"output", sessionId, data}`；Close 回调 → `{type:"exit", sessionId}`；Error 回调 → `{type:"error", sessionId, message}`（消息类型名与 Node 逐字对齐）
- CloseSession 通过调用 sess.Close() 间接触发 Close 回调完成 DB 更新与 map 移除（与 Node 事件流一致）
- CleanupWS：关闭该 WS 拥有的全部会话

- [ ] **Step 1: 写失败测试 `go-server/session_test.go`**

```go
package main

import (
	"errors"
	"sync"
	"testing"
)

type fakeSession struct {
	mu       sync.Mutex
	written  []string
	resizes  [][2]int
	closed   bool
	handlers SessionHandlers
}

func (f *fakeSession) Write(data string) {
	f.mu.Lock()
	f.written = append(f.written, data)
	f.mu.Unlock()
}
func (f *fakeSession) Resize(c, r int) {
	f.mu.Lock()
	f.resizes = append(f.resizes, [2]int{c, r})
	f.mu.Unlock()
}
func (f *fakeSession) Close() {
	f.mu.Lock()
	f.closed = true
	f.mu.Unlock()
	if f.handlers.Close != nil {
		f.handlers.Close()
	}
}

type fakeWS struct {
	mu   sync.Mutex
	msgs []map[string]any
	err  error
}

func (f *fakeWS) Send(v any) error {
	if f.err != nil {
		return f.err
	}
	f.mu.Lock()
	f.msgs = append(f.msgs, v.(map[string]any))
	f.mu.Unlock()
	return nil
}

func newTestManager(t *testing.T) (*Manager, *fakeSession, *fakeWS) {
	t.Helper()
	fs := &fakeSession{}
	m := NewManager(newTestStore(t))
	m.SetDialers(
		func(o SessionOptions, h SessionHandlers) (TerminalSession, error) { fs.handlers = h; return fs, nil },
		func(o SessionOptions, h SessionHandlers) (TerminalSession, error) { fs.handlers = h; return fs, nil },
	)
	ws := &fakeWS{}
	return m, fs, ws
}

func TestManagerCreateAndDataFlow(t *testing.T) {
	m, fs, ws := newTestManager(t)
	id, err := m.Create(ws, "ws-1", "ssh", SessionOptions{Host: "h", Port: 22, Cols: 80, Rows: 24})
	if err != nil {
		t.Fatalf("Create: %v", err)
	}
	if id == "" {
		t.Fatal("empty session id")
	}

	// 模拟远端输出 → output 消息
	fs.handlers.Data("hello")
	ws.mu.Lock()
	if len(ws.msgs) != 1 || ws.msgs[0]["type"] != "output" || ws.msgs[0]["data"] != "hello" || ws.msgs[0]["sessionId"] != id {
		t.Errorf("msgs = %v", ws.msgs)
	}
	ws.mu.Unlock()

	// DB 中应有 active 会话
	list, _ := m.store.GetSessions()
	if len(list) != 1 || *list[0].Status != "active" {
		t.Errorf("db sessions = %+v", list)
	}
}

func TestManagerInputResizeClose(t *testing.T) {
	m, fs, ws := newTestManager(t)
	id, _ := m.Create(ws, "ws-1", "telnet", SessionOptions{Host: "h", Port: 23})

	m.Input(id, "ls\n")
	m.Resize(id, 132, 43)

	fs.mu.Lock()
	if len(fs.written) != 1 || fs.written[0] != "ls\n" {
		t.Errorf("written = %v", fs.written)
	}
	if len(fs.resizes) != 1 || fs.resizes[0] != [2]int{132, 43} {
		t.Errorf("resizes = %v", fs.resizes)
	}
	fs.mu.Unlock()

	// Close → 触发 exit 消息 + DB closed + 从 map 移除
	fs.handlers.Close()
	ws.mu.Lock()
	var sawExit bool
	for _, msg := range ws.msgs {
		if msg["type"] == "exit" && msg["sessionId"] == id {
			sawExit = true
		}
	}
	ws.mu.Unlock()
	if !sawExit {
		t.Errorf("expected exit message, got %v", ws.msgs)
	}
	list, _ := m.store.GetSessions()
	if *list[0].Status != "closed" {
		t.Errorf("db status = %v", *list[0].Status)
	}

	// 已移除：后续 input 不应 panic/生效
	m.Input(id, "x")
	fs.mu.Lock()
	if len(fs.written) != 1 {
		t.Errorf("write after close: %v", fs.written)
	}
	fs.mu.Unlock()
}

func TestManagerDialError(t *testing.T) {
	m := NewManager(newTestStore(t))
	m.SetDialers(
		func(o SessionOptions, h SessionHandlers) (TerminalSession, error) { return nil, errors.New("connection refused") },
		nil,
	)
	ws := &fakeWS{}
	_, err := m.Create(ws, "ws-1", "ssh", SessionOptions{Host: "h", Port: 22})
	if err == nil || err.Error() != "connection refused" {
		t.Errorf("err = %v", err)
	}
}

func TestManagerCleanupWS(t *testing.T) {
	m, fs, ws := newTestManager(t)
	m.Create(ws, "ws-1", "ssh", SessionOptions{Host: "h", Port: 22})
	id2, _ := m.Create(ws, "ws-2", "ssh", SessionOptions{Host: "h", Port: 22})

	m.CleanupWS("ws-1")

	// ws-1 的会话已关闭并从 map 移除；ws-2 的还在
	if _, ok := m.get(id2); !ok {
		t.Errorf("ws-2 session should survive")
	}
	if n := m.count(); n != 1 {
		t.Errorf("count = %d, want 1", n)
	}
}
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd go-server && go test ./...`
Expected: 编译失败 `undefined: NewManager`

- [ ] **Step 3: 实现 `go-server/session.go`**

`go-server/session.go`:

```go
package main

import (
	"crypto/rand"
	"fmt"
	"log/slog"
	"sync"
)

// WSWriter 由 ws.go 的连接包装实现（Send 必须并发安全）。
type WSWriter interface {
	Send(v any) error
}

type Dialer func(opts SessionOptions, h SessionHandlers) (TerminalSession, error)

type activeSession struct {
	id       string
	protocol string
	sess     TerminalSession
	ws       WSWriter
	wsID     string
	cols     int
	rows     int
}

type Manager struct {
	store      *Store
	mu         sync.Mutex
	sessions   map[string]*activeSession
	sshDial    Dialer
	telnetDial Dialer
}

func NewManager(store *Store) *Manager {
	return &Manager{
		store:      store,
		sessions:   map[string]*activeSession{},
		sshDial:    DialSSH,
		telnetDial: DialTelnet,
	}
}

// SetDialers 测试注入用。
func (m *Manager) SetDialers(ssh, telnet Dialer) {
	if ssh != nil {
		m.sshDial = ssh
	}
	if telnet != nil {
		m.telnetDial = telnet
	}
}

func newUUID() string {
	var b [16]byte
	if _, err := rand.Read(b[:]); err != nil {
		panic(err)
	}
	b[6] = (b[6] & 0x0f) | 0x40
	b[8] = (b[8] & 0x3f) | 0x80
	return fmt.Sprintf("%x-%x-%x-%x-%x", b[0:4], b[4:6], b[6:8], b[8:10], b[10:16])
}

func (m *Manager) Create(w WSWriter, wsID, protocol string, opts SessionOptions) (string, error) {
	var dial Dialer
	switch protocol {
	case "ssh":
		dial = m.sshDial
	case "telnet":
		dial = m.telnetDial
	default:
		return "", fmt.Errorf("Unknown protocol: %s", protocol)
	}
	if opts.Cols <= 0 {
		opts.Cols = 80
	}
	if opts.Rows <= 0 {
		opts.Rows = 24
	}

	sessionID := newUUID()
	as := &activeSession{id: sessionID, protocol: protocol, ws: w, wsID: wsID, cols: opts.Cols, rows: opts.Rows}

	handlers := SessionHandlers{
		Data: func(data string) {
			w.Send(map[string]any{"type": "output", "sessionId": sessionID, "data": data})
		},
		Close: func() {
			m.handleSessionClose(sessionID)
		},
		Error: func(err error) {
			slog.Error("Session error", "sessionId", sessionID, "err", err)
			w.Send(map[string]any{"type": "error", "sessionId": sessionID, "message": err.Error()})
		},
	}

	slog.Info("Creating session", "protocol", protocol)
	sess, err := dial(opts, handlers)
	if err != nil {
		slog.Error("Failed to create session", "err", err)
		return "", err
	}
	as.sess = sess

	m.mu.Lock()
	m.sessions[sessionID] = as
	m.mu.Unlock()

	if err := m.store.CreateSession(sessionID, protocol, opts.Host, intPtr(opts.Port)); err != nil {
		slog.Error("Failed to record session", "err", err)
	}

	slog.Info("Session created", "sessionId", sessionID, "protocol", protocol)
	return sessionID, nil
}

func intPtr(n int) *int64 {
	if n <= 0 {
		return nil
	}
	v := int64(n)
	return &v
}

func (m *Manager) get(sessionID string) (*activeSession, bool) {
	m.mu.Lock()
	defer m.mu.Unlock()
	s, ok := m.sessions[sessionID]
	return s, ok
}

func (m *Manager) count() int {
	m.mu.Lock()
	defer m.mu.Unlock()
	return len(m.sessions)
}

func (m *Manager) Input(sessionID, data string) {
	if s, ok := m.get(sessionID); ok {
		s.sess.Write(data)
	}
}

func (m *Manager) Resize(sessionID string, cols, rows int) {
	if s, ok := m.get(sessionID); ok {
		s.cols, s.rows = cols, rows
		s.sess.Resize(cols, rows)
	}
}

func (m *Manager) CloseSession(sessionID string) {
	s, ok := m.get(sessionID)
	if !ok {
		return
	}
	s.sess.Close() // 触发 Close 回调 → handleSessionClose（DB 更新 + map 移除）
}

// handleSessionClose 对齐 Node：通知客户端 exit + DB closed + 移除。
func (m *Manager) handleSessionClose(sessionID string) {
	m.mu.Lock()
	s, ok := m.sessions[sessionID]
	if ok {
		delete(m.sessions, sessionID)
	}
	m.mu.Unlock()
	if !ok {
		return
	}
	s.ws.Send(map[string]any{"type": "exit", "sessionId": sessionID})
	if err := m.store.UpdateSessionStatus(sessionID, "closed"); err != nil {
		slog.Error("Failed to update session status", "err", err)
	}
	slog.Info("Session ended", "sessionId", sessionID)
}

func (m *Manager) CloseAll() {
	m.mu.Lock()
	ids := make([]string, 0, len(m.sessions))
	for id := range m.sessions {
		ids = append(ids, id)
	}
	m.mu.Unlock()
	for _, id := range ids {
		m.CloseSession(id)
	}
}

func (m *Manager) CleanupWS(wsID string) {
	m.mu.Lock()
	var ids []string
	for id, s := range m.sessions {
		if s.wsID == wsID {
			ids = append(ids, id)
		}
	}
	m.mu.Unlock()
	for _, id := range ids {
		m.CloseSession(id)
	}
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `cd go-server && go test ./...`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add go-server/session.go go-server/session_test.go
git commit -m "feat(go): session manager"
```

---

### Task 7: ws.go — WebSocket 协议层（含鉴权修复）

**Files:**
- Create: `go-server/ws.go`、`go-server/ws_test.go`

**Interfaces:**
- Consumes: Task 6 的 `Manager`、`WSWriter`、`newUUID`；Task 3 的 `SessionStore`、`writeErr`
- Produces:
  - `type WSHandler struct { Manager *Manager; Sessions *SessionStore }`，实现 `http.Handler`（`ServeHTTP`）
  - 客户端消息结构 `wsClientMessage`（json: type/sessionId/data/cols/rows/protocol/host/port/username/password）

**关键实现细节：**
- **鉴权（设计批准的偏差）**：upgrade 前校验 `connect.sid`，无效 → `writeErr(w, 401, "Authentication required")`
- `websocket.Accept(w, r, nil)`：默认 Origin 检查（同源通过，浏览器 WS 必带 Origin，天然防 CSWSH）
- 每个连接一个 `wsConn{id, conn, writeMu}` 实现 `WSWriter`（`wsjson.Write` 加写锁，10s 写超时）
- 读循环用 `r.Context()`（连接断开时 Read 返回错误退出）；`create` 消息在 goroutine 中处理（SSH dial 最长 10s，不阻塞后续消息）；`input/resize/close` 内联处理（前端收到 created 后才发 input，无乱序风险）
- 连接关闭时 `Manager.CleanupWS(connID)`

- [ ] **Step 1: 写失败测试 `go-server/ws_test.go`**

```go
package main

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/coder/websocket"
	"github.com/coder/websocket/wsjson"
)

type wsTestEnv struct {
	server   *httptest.Server
	sessions *SessionStore
	manager  *Manager
	fake     *fakeSession
}

func newWSTestEnv(t *testing.T) *wsTestEnv {
	t.Helper()
	fs := &fakeSession{}
	m := NewManager(newTestStore(t))
	m.SetDialers(
		func(o SessionOptions, h SessionHandlers) (TerminalSession, error) { fs.handlers = h; return fs, nil },
		func(o SessionOptions, h SessionHandlers) (TerminalSession, error) { fs.handlers = h; return fs, nil },
	)
	ss := NewSessionStore("s", time.Hour)
	h := &WSHandler{Manager: m, Sessions: ss}
	srv := httptest.NewServer(h)
	t.Cleanup(srv.Close)
	return &wsTestEnv{server: srv, sessions: ss, manager: m, fake: fs}
}

func dialWS(t *testing.T, env *wsTestEnv, cookieValue string) *websocket.Conn {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	opts := &websocket.DialOptions{}
	if cookieValue != "" {
		opts.HTTPHeader = http.Header{"Cookie": []string{"connect.sid=" + cookieValue}}
	}
	c, resp, err := websocket.Dial(ctx, "ws"+strings.TrimPrefix(env.server.URL, "http"), opts)
	if err != nil {
		if resp != nil {
			t.Fatalf("dial: %v (status %d)", err, resp.StatusCode)
		}
		t.Fatalf("dial: %v", err)
	}
	t.Cleanup(func() { c.Close(websocket.StatusNormalClosure, "") })
	return c
}

func readMsg(t *testing.T, c *websocket.Conn) map[string]any {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	var v map[string]any
	if err := wsjson.Read(ctx, c, &v); err != nil {
		t.Fatalf("read: %v", err)
	}
	return v
}

func waitFor(t *testing.T, cond func() bool) {
	t.Helper()
	deadline := time.Now().Add(3 * time.Second)
	for time.Now().Before(deadline) {
		if cond() {
			return
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatal("condition not met within timeout")
}

func TestWSRequiresAuth(t *testing.T) {
	env := newWSTestEnv(t)
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	_, resp, err := websocket.Dial(ctx, "ws"+strings.TrimPrefix(env.server.URL, "http"), nil)
	if err == nil {
		t.Fatal("expected dial error")
	}
	if resp == nil || resp.StatusCode != 401 {
		t.Errorf("status = %v, want 401", resp)
	}
}

func TestWSCreateInputOutputClose(t *testing.T) {
	env := newWSTestEnv(t)
	cv := env.sessions.Create(1, "admin")
	c := dialWS(t, env, cv)
	ctx := context.Background()

	// create
	if err := wsjson.Write(ctx, c, map[string]any{
		"type": "create", "protocol": "ssh", "host": "example.com", "port": 22,
		"username": "u", "password": "p", "cols": 80, "rows": 24,
	}); err != nil {
		t.Fatalf("write create: %v", err)
	}
	msg := readMsg(t, c)
	if msg["type"] != "created" || msg["protocol"] != "ssh" {
		t.Fatalf("msg = %v", msg)
	}
	sessionID := msg["sessionId"].(string)
	if sessionID == "" {
		t.Fatal("no sessionId")
	}

	// input
	wsjson.Write(ctx, c, map[string]any{"type": "input", "sessionId": sessionID, "data": "ls\n"})
	waitFor(t, func() bool {
		env.fake.mu.Lock()
		defer env.fake.mu.Unlock()
		return len(env.fake.written) == 1 && env.fake.written[0] == "ls\n"
	})

	// resize
	wsjson.Write(ctx, c, map[string]any{"type": "resize", "sessionId": sessionID, "cols": 100, "rows": 40})
	waitFor(t, func() bool {
		env.fake.mu.Lock()
		defer env.fake.mu.Unlock()
		return len(env.fake.resizes) == 1 && env.fake.resizes[0] == [2]int{100, 40}
	})

	// 远端输出 → output 消息
	env.fake.handlers.Data("total 0")
	out := readMsg(t, c)
	if out["type"] != "output" || out["data"] != "total 0" || out["sessionId"] != sessionID {
		t.Errorf("out = %v", out)
	}

	// 远端关闭 → exit 消息
	env.fake.handlers.Close()
	exit := readMsg(t, c)
	if exit["type"] != "exit" || exit["sessionId"] != sessionID {
		t.Errorf("exit = %v", exit)
	}
}

func TestWSCleanupOnDisconnect(t *testing.T) {
	env := newWSTestEnv(t)
	cv := env.sessions.Create(1, "admin")
	c := dialWS(t, env, cv)
	ctx := context.Background()

	wsjson.Write(ctx, c, map[string]any{"type": "create", "protocol": "telnet", "host": "h", "port": 23, "cols": 80, "rows": 24})
	msg := readMsg(t, c)
	if msg["type"] != "created" {
		t.Fatalf("msg = %v", msg)
	}
	if n := env.manager.count(); n != 1 {
		t.Fatalf("count = %d", n)
	}

	c.Close(websocket.StatusNormalClosure, "")
	waitFor(t, func() bool { return env.manager.count() == 0 })
}

func TestWSCloseMessage(t *testing.T) {
	env := newWSTestEnv(t)
	cv := env.sessions.Create(1, "admin")
	c := dialWS(t, env, cv)
	ctx := context.Background()

	wsjson.Write(ctx, c, map[string]any{"type": "create", "protocol": "ssh", "host": "h", "port": 22})
	msg := readMsg(t, c)
	sessionID := msg["sessionId"].(string)

	wsjson.Write(ctx, c, map[string]any{"type": "close", "sessionId": sessionID})
	exit := readMsg(t, c) // Close 触发 fakeSession.Close → exit
	if exit["type"] != "exit" {
		t.Errorf("exit = %v", exit)
	}
	if n := env.manager.count(); n != 0 {
		t.Errorf("count = %d", n)
	}
}
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd go-server && go test ./...`
Expected: 编译失败 `undefined: WSHandler`

- [ ] **Step 3: 实现 `go-server/ws.go`**

```bash
cd go-server
go get github.com/coder/websocket
```

`go-server/ws.go`:

```go
package main

import (
	"context"
	"log/slog"
	"net/http"
	"sync"
	"time"

	"github.com/coder/websocket"
	"github.com/coder/websocket/wsjson"
)

// 对齐 Node 版 WSMessage。
type wsClientMessage struct {
	Type      string `json:"type"`
	SessionID string `json:"sessionId"`
	Data      string `json:"data"`
	Cols      int    `json:"cols"`
	Rows      int    `json:"rows"`
	Protocol  string `json:"protocol"`
	Host      string `json:"host"`
	Port      int    `json:"port"`
	Username  string `json:"username"`
	Password  string `json:"password"`
}

// wsConn 实现 WSWriter（写操作加锁，coder/websocket 只允许一个并发写者）。
type wsConn struct {
	id      string
	conn    *websocket.Conn
	writeMu sync.Mutex
}

func (c *wsConn) Send(v any) error {
	c.writeMu.Lock()
	defer c.writeMu.Unlock()
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	return wsjson.Write(ctx, c.conn, v)
}

type WSHandler struct {
	Manager  *Manager
	Sessions *SessionStore
}

func (h *WSHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	// 设计批准的偏差：WS upgrade 需要登录（Node 版无此检查）。
	if h.Sessions.FromRequest(r) == nil {
		writeErr(w, 401, "Authentication required")
		return
	}

	c, err := websocket.Accept(w, r, nil) // 默认 Origin 同源检查（防 CSWSH）
	if err != nil {
		slog.Error("WebSocket accept error", "err", err)
		return
	}
	conn := &wsConn{id: newUUID(), conn: c}
	slog.Info("WebSocket client connected")

	defer func() {
		h.Manager.CleanupWS(conn.id)
		c.Close(websocket.StatusNormalClosure, "")
		slog.Info("WebSocket client disconnected")
	}()

	for {
		var msg wsClientMessage
		// 连接断开时 Read 返回错误退出循环。
		if err := wsjson.Read(r.Context(), c, &msg); err != nil {
			return
		}
		h.handleMessage(conn, msg)
	}
}

func (h *WSHandler) handleMessage(conn *wsConn, msg wsClientMessage) {
	slog.Debug("WebSocket message", "type", msg.Type)
	switch msg.Type {
	case "create":
		if msg.Protocol == "" {
			conn.Send(map[string]any{"type": "error", "message": "Protocol required"})
			return
		}
		// dial 最长 10s，放 goroutine 避免阻塞该连接的后续消息
		go func() {
			sessionID, err := h.Manager.Create(conn, conn.id, msg.Protocol, SessionOptions{
				Host: msg.Host, Port: msg.Port, Username: msg.Username, Password: msg.Password,
				Cols: msg.Cols, Rows: msg.Rows,
			})
			if err != nil {
				conn.Send(map[string]any{"type": "error", "message": err.Error()})
				return
			}
			conn.Send(map[string]any{"type": "created", "sessionId": sessionID, "protocol": msg.Protocol})
		}()
	case "input":
		if msg.SessionID == "" || msg.Data == "" {
			return
		}
		h.Manager.Input(msg.SessionID, msg.Data)
	case "resize":
		if msg.SessionID == "" || msg.Cols == 0 || msg.Rows == 0 {
			return
		}
		h.Manager.Resize(msg.SessionID, msg.Cols, msg.Rows)
	case "close":
		if msg.SessionID == "" {
			return
		}
		h.Manager.CloseSession(msg.SessionID)
	default:
		slog.Warn("Unknown message type", "type", msg.Type)
	}
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `cd go-server && go test ./...`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add go-server/ws.go go-server/ws_test.go go-server/go.mod go-server/go.sum
git commit -m "feat(go): websocket protocol layer with auth"
```

---

### Task 8: api.go — connections/sessions/settings/recordings 路由

**Files:**
- Create: `go-server/api.go`、`go-server/api_test.go`

**Interfaces:**
- Consumes: Task 2 `Store`、Task 3 `Auth`/`writeJSON`/`writeErr`、Task 1 `Config`
- Produces:
  - `type API struct { Store *Store; Cfg Config }`
  - 方法（均为 `func(w http.ResponseWriter, r *http.Request)`）：`ListConnections`、`CreateConnection`、`UpdateConnection`、`DeleteConnection`、`ListSessions`、`GetSettings`、`PutSettings`、`ListRecordings`、`DownloadRecording`

**关键实现细节：**
- 错误消息与 Node 版逐字一致：`"Name and protocol required"`、`"Connection not found"` 等
- PUT/DELETE 的 id 来自 Go 1.22 路径参数 `r.PathValue("id")`，非数字 → 404（对齐 Node `parseInt` 后查不到 → 404）
- recordings：列 `LOG_DIR` 下 `*.cast`；`id` 为去掉 `.cast` 的文件名；下载响应头 `Content-Type: application/json` + `Content-Disposition: attachment; filename="<id>.cast"`；**拒绝含 `/`、`\`、`..` 的 id（400，安全偏差）**
- settings GET 公开返回 settings 或 `{}`；PUT 需登录，body 必须是有效 JSON

- [ ] **Step 1: 写失败测试 `go-server/api_test.go`**

```go
package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func newTestAPI(t *testing.T) (*API, *Auth, string) {
	t.Helper()
	dir := t.TempDir()
	store := newTestStore(t)
	InitializeDefaultUser(store, Config{AdminUser: "admin", AdminPass: "admin"})
	cfg := Config{LogDir: filepath.Join(dir, "logs")}
	api := &API{Store: store, Cfg: cfg}
	auth := &Auth{Store: store, Sessions: NewSessionStore("s", time.Hour), MaxAge: time.Hour}
	cv := auth.Sessions.Create(1, "admin")
	return api, auth, cv
}

func authedReq(method, target, body, cv string) *http.Request {
	var r *http.Request
	if body != "" {
		r = httptest.NewRequest(method, target, strings.NewReader(body))
		r.Header.Set("Content-Type", "application/json")
	} else {
		r = httptest.NewRequest(method, target, nil)
	}
	r.AddCookie(&http.Cookie{Name: "connect.sid", Value: cv})
	return r
}

func TestAPIConnectionsCRUD(t *testing.T) {
	api, auth, cv := newTestAPI(t)

	// Create：缺 protocol → 400
	rec := httptest.NewRecorder()
	auth.RequireAuth(api.CreateConnection)(rec, authedReq("POST", "/api/connections", `{"name":"x"}`, cv))
	if rec.Code != 400 {
		t.Errorf("create missing protocol: %d", rec.Code)
	}

	// Create 成功 → 201
	rec = httptest.NewRecorder()
	auth.RequireAuth(api.CreateConnection)(rec, authedReq("POST", "/api/connections", `{"name":"srv","protocol":"ssh","host":"h","port":22}`, cv))
	if rec.Code != 201 {
		t.Fatalf("create: %d body=%s", rec.Code, rec.Body.String())
	}
	var created map[string]any
	json.Unmarshal(rec.Body.Bytes(), &created)
	if created["name"] != "srv" || created["protocol"] != "ssh" || created["host"] != "h" {
		t.Errorf("created = %v", created)
	}

	// List → 1 条
	rec = httptest.NewRecorder()
	auth.RequireAuth(api.ListConnections)(rec, authedReq("GET", "/api/connections", "", cv))
	var list []map[string]any
	json.Unmarshal(rec.Body.Bytes(), &list)
	if len(list) != 1 {
		t.Errorf("list len = %d", len(list))
	}

	// Update
	rec = httptest.NewRecorder()
	req := authedReq("PUT", "/api/connections/1", `{"name":"srv2"}`, cv)
	req.SetPathValue("id", "1")
	auth.RequireAuth(api.UpdateConnection)(rec, req)
	if rec.Code != 200 {
		t.Fatalf("update: %d", rec.Code)
	}
	var updated map[string]any
	json.Unmarshal(rec.Body.Bytes(), &updated)
	if updated["name"] != "srv2" || updated["host"] != "h" {
		t.Errorf("updated = %v", updated)
	}

	// Update 不存在 → 404
	rec = httptest.NewRecorder()
	req = authedReq("PUT", "/api/connections/999", `{"name":"z"}`, cv)
	req.SetPathValue("id", "999")
	auth.RequireAuth(api.UpdateConnection)(rec, req)
	if rec.Code != 404 {
		t.Errorf("update 999: %d", rec.Code)
	}

	// Delete
	rec = httptest.NewRecorder()
	req = authedReq("DELETE", "/api/connections/1", "", cv)
	req.SetPathValue("id", "1")
	auth.RequireAuth(api.DeleteConnection)(rec, req)
	if rec.Code != 200 {
		t.Errorf("delete: %d", rec.Code)
	}
	rec = httptest.NewRecorder()
	req = authedReq("DELETE", "/api/connections/1", "", cv)
	req.SetPathValue("id", "1")
	auth.RequireAuth(api.DeleteConnection)(rec, req)
	if rec.Code != 404 {
		t.Errorf("delete again: %d", rec.Code)
	}
}

func TestAPISettings(t *testing.T) {
	api, auth, cv := newTestAPI(t)

	// GET 公开（无 cookie）→ {}
	rec := httptest.NewRecorder()
	api.GetSettings(rec, httptest.NewRequest("GET", "/api/settings", nil))
	if rec.Code != 200 || strings.TrimSpace(rec.Body.String()) != "{}" {
		t.Errorf("empty settings: %d %s", rec.Code, rec.Body.String())
	}

	// PUT 无登录 → 401
	rec = httptest.NewRecorder()
	auth.RequireAuth(api.PutSettings)(rec, httptest.NewRequest("PUT", "/api/settings", strings.NewReader(`{"a":1}`)))
	if rec.Code != 401 {
		t.Errorf("put unauth: %d", rec.Code)
	}

	// PUT 登录 → success
	rec = httptest.NewRecorder()
	auth.RequireAuth(api.PutSettings)(rec, authedReq("PUT", "/api/settings", `{"theme":"dark"}`, cv))
	if rec.Code != 200 {
		t.Fatalf("put: %d", rec.Code)
	}

	// GET 返回已存内容
	rec = httptest.NewRecorder()
	api.GetSettings(rec, httptest.NewRequest("GET", "/api/settings", nil))
	if !strings.Contains(rec.Body.String(), "dark") {
		t.Errorf("get after put: %s", rec.Body.String())
	}
}

func TestAPIRecordings(t *testing.T) {
	api, auth, cv := newTestAPI(t)
	os.MkdirAll(api.Cfg.LogDir, 0o755)
	os.WriteFile(filepath.Join(api.Cfg.LogDir, "sess1.cast"), []byte(`{"v":2}`), 0o644)
	os.WriteFile(filepath.Join(api.Cfg.LogDir, "other.txt"), []byte("x"), 0o644)

	// List
	rec := httptest.NewRecorder()
	auth.RequireAuth(api.ListRecordings)(rec, authedReq("GET", "/api/recordings", "", cv))
	var list []map[string]any
	json.Unmarshal(rec.Body.Bytes(), &list)
	if len(list) != 1 || list[0]["id"] != "sess1" || list[0]["filename"] != "sess1.cast" {
		t.Errorf("list = %v", list)
	}

	// Download
	rec = httptest.NewRecorder()
	req := authedReq("GET", "/api/recordings/sess1/download", "", cv)
	req.SetPathValue("id", "sess1")
	auth.RequireAuth(api.DownloadRecording)(rec, req)
	if rec.Code != 200 {
		t.Fatalf("download: %d", rec.Code)
	}
	if cd := rec.Header().Get("Content-Disposition"); !strings.Contains(cd, `filename="sess1.cast"`) {
		t.Errorf("Content-Disposition = %q", cd)
	}
	if !strings.Contains(rec.Body.String(), `{"v":2}`) {
		t.Errorf("body = %s", rec.Body.String())
	}

	// 不存在 → 404
	rec = httptest.NewRecorder()
	req = authedReq("GET", "/api/recordings/nope/download", "", cv)
	req.SetPathValue("id", "nope")
	auth.RequireAuth(api.DownloadRecording)(rec, req)
	if rec.Code != 404 {
		t.Errorf("nope: %d", rec.Code)
	}

	// 路径穿越 → 400
	rec = httptest.NewRecorder()
	req = authedReq("GET", "/api/recordings/x/download", "", cv)
	req.SetPathValue("id", "../../webterm")
	auth.RequireAuth(api.DownloadRecording)(rec, req)
	if rec.Code != 400 {
		t.Errorf("traversal: %d", rec.Code)
	}
}

func TestAPISessions(t *testing.T) {
	api, auth, cv := newTestAPI(t)
	api.Store.CreateSession("u1", "ssh", "h", nil)
	rec := httptest.NewRecorder()
	auth.RequireAuth(api.ListSessions)(rec, authedReq("GET", "/api/sessions", "", cv))
	var list []map[string]any
	json.Unmarshal(rec.Body.Bytes(), &list)
	if len(list) != 1 || list[0]["id"] != "u1" {
		t.Errorf("list = %v", list)
	}
}
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd go-server && go test ./...`
Expected: 编译失败 `undefined: API`

- [ ] **Step 3: 实现 `go-server/api.go`**

`go-server/api.go`:

```go
package main

import (
	"encoding/json"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
)

type API struct {
	Store *Store
	Cfg   Config
}

func decodeConnectionInput(r *http.Request) (ConnectionInput, error) {
	var body struct {
		Name             string          `json:"name"`
		Protocol         string          `json:"protocol"`
		Host             string          `json:"host"`
		Port             *int64          `json:"port"`
		Username         string          `json:"username"`
		Password         string          `json:"password"`
		SSHKeyPath       string          `json:"ssh_key_path"`
		SSHKeyPassphrase string          `json:"ssh_key_passphrase"`
		Options          json.RawMessage `json:"options"`
	}
	err := json.NewDecoder(r.Body).Decode(&body)
	return ConnectionInput{
		Name: body.Name, Protocol: body.Protocol, Host: body.Host, Port: body.Port,
		Username: body.Username, Password: body.Password,
		SSHKeyPath: body.SSHKeyPath, SSHKeyPassphrase: body.SSHKeyPassphrase,
		Options: body.Options,
	}, err
}

func (a *API) ListConnections(w http.ResponseWriter, r *http.Request) {
	list, err := a.Store.GetConnections()
	if err != nil {
		writeErr(w, 500, "Internal error")
		return
	}
	writeJSON(w, 200, list)
}

func (a *API) CreateConnection(w http.ResponseWriter, r *http.Request) {
	in, err := decodeConnectionInput(r)
	if err != nil || in.Name == "" || in.Protocol == "" {
		writeErr(w, 400, "Name and protocol required")
		return
	}
	c, err := a.Store.CreateConnection(in)
	if err != nil {
		writeErr(w, 500, "Internal error")
		return
	}
	writeJSON(w, 201, c)
}

func (a *API) UpdateConnection(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil {
		writeErr(w, 404, "Connection not found")
		return
	}
	in, _ := decodeConnectionInput(r)
	c, err := a.Store.UpdateConnection(id, in)
	if err != nil {
		writeErr(w, 500, "Internal error")
		return
	}
	if c == nil {
		writeErr(w, 404, "Connection not found")
		return
	}
	writeJSON(w, 200, c)
}

func (a *API) DeleteConnection(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil {
		writeErr(w, 404, "Connection not found")
		return
	}
	ok, err := a.Store.DeleteConnection(id)
	if err != nil {
		writeErr(w, 500, "Internal error")
		return
	}
	if !ok {
		writeErr(w, 404, "Connection not found")
		return
	}
	writeJSON(w, 200, map[string]bool{"success": true})
}

func (a *API) ListSessions(w http.ResponseWriter, r *http.Request) {
	list, err := a.Store.GetSessions()
	if err != nil {
		writeErr(w, 500, "Internal error")
		return
	}
	writeJSON(w, 200, list)
}

func (a *API) GetSettings(w http.ResponseWriter, r *http.Request) {
	v, err := a.Store.GetSettings()
	if err != nil {
		writeErr(w, 500, "Internal error")
		return
	}
	if v == nil {
		v = json.RawMessage(`{}`)
	}
	w.Header().Set("Content-Type", "application/json")
	w.Write(v)
}

func (a *API) PutSettings(w http.ResponseWriter, r *http.Request) {
	var v json.RawMessage
	if err := json.NewDecoder(r.Body).Decode(&v); err != nil {
		writeErr(w, 400, "Invalid JSON")
		return
	}
	if err := a.Store.SaveSettings(v); err != nil {
		writeErr(w, 500, "Internal error")
		return
	}
	writeJSON(w, 200, map[string]bool{"success": true})
}

type recordingInfo struct {
	ID       string `json:"id"`
	Filename string `json:"filename"`
	Path     string `json:"path"`
}

func (a *API) ListRecordings(w http.ResponseWriter, r *http.Request) {
	entries, err := os.ReadDir(a.Cfg.LogDir)
	if err != nil {
		writeJSON(w, 200, []recordingInfo{})
		return
	}
	out := []recordingInfo{}
	for _, e := range entries {
		if e.IsDir() || !strings.HasSuffix(e.Name(), ".cast") {
			continue
		}
		out = append(out, recordingInfo{
			ID:       strings.TrimSuffix(e.Name(), ".cast"),
			Filename: e.Name(),
			Path:     filepath.Join(a.Cfg.LogDir, e.Name()),
		})
	}
	writeJSON(w, 200, out)
}

func (a *API) DownloadRecording(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	// 安全偏差（设计已批准）：拒绝路径穿越
	if id == "" || strings.ContainsAny(id, "/\\") || strings.Contains(id, "..") {
		writeErr(w, 400, "Invalid recording id")
		return
	}
	p := filepath.Join(a.Cfg.LogDir, id+".cast")
	if _, err := os.Stat(p); err != nil {
		writeErr(w, 404, "Recording not found")
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Content-Disposition", `attachment; filename="`+id+`.cast"`)
	http.ServeFile(w, r, p)
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `cd go-server && go test ./...`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add go-server/api.go go-server/api_test.go
git commit -m "feat(go): api routes for connections, sessions, settings, recordings"
```

---

### Task 9: backgrounds.go — 背景图上传

**Files:**
- Create: `go-server/backgrounds.go`、`go-server/backgrounds_test.go`

**Interfaces:**
- Consumes: Task 2 `Store`、Task 3 helpers
- Produces:
  - `type BackgroundsHandler struct { Store *Store; Dir string }`
  - 方法：`List`、`Upload`、`Delete`（均为 `func(w http.ResponseWriter, r *http.Request)`）

**关键实现细节（对齐 Node 版 src/routes/backgrounds.ts）：**
- 上传字段名 `image`；5MB 限制（`http.MaxBytesReader`）；MIME 白名单 `image/jpeg|png|gif|webp`（取 multipart part 的 Content-Type，与 multer 的 file.mimetype 一致）
- 文件名消毒：`/`、`\` 及 `[^a-zA-Z0-9._-]` 全部替换为 `_`，前缀 `UnixMilli-`
- 上传成功响应 `{id, filename, original_name, url: "/backgrounds/<filename>"}`
- 类型不符错误消息逐字对齐：`Invalid file type. Only JPEG, PNG, GIF, and WebP are allowed.`

- [ ] **Step 1: 写失败测试 `go-server/backgrounds_test.go`**

```go
package main

import (
	"bytes"
	"encoding/json"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"net/textproto"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func newTestBackgrounds(t *testing.T) (*BackgroundsHandler, *Auth, string) {
	t.Helper()
	store := newTestStore(t)
	h := &BackgroundsHandler{Store: store, Dir: filepath.Join(t.TempDir(), "backgrounds")}
	auth := &Auth{Store: store, Sessions: NewSessionStore("s", time.Hour), MaxAge: time.Hour}
	cv := auth.Sessions.Create(1, "admin")
	return h, auth, cv
}

func uploadRequest(t *testing.T, fieldName, filename, contentType string, content []byte, cv string) *http.Request {
	t.Helper()
	var buf bytes.Buffer
	mw := multipart.NewWriter(&buf)
	hdr := textproto.MIMEHeader{}
	hdr.Set("Content-Disposition", `form-data; name="`+fieldName+`"; filename="`+filename+`"`)
	hdr.Set("Content-Type", contentType)
	pw, _ := mw.CreatePart(hdr)
	pw.Write(content)
	mw.Close()
	req := httptest.NewRequest("POST", "/api/backgrounds/upload", &buf)
	req.Header.Set("Content-Type", mw.FormDataContentType())
	req.AddCookie(&http.Cookie{Name: "connect.sid", Value: cv})
	return req
}

func TestBackgroundUploadListDelete(t *testing.T) {
	h, auth, cv := newTestBackgrounds(t)

	// 上传合法 PNG
	req := uploadRequest(t, "image", "my pic!.png", "image/png", []byte("\x89PNG fake"), cv)
	rec := httptest.NewRecorder()
	auth.RequireAuth(h.Upload)(rec, req)
	if rec.Code != 200 {
		t.Fatalf("upload: %d %s", rec.Code, rec.Body.String())
	}
	var up map[string]any
	json.Unmarshal(rec.Body.Bytes(), &up)
	filename := up["filename"].(string)
	if !strings.HasSuffix(filename, "-my_pic_.png") { // 空格和 ! 消毒为 _
		t.Errorf("filename = %q", filename)
	}
	if up["original_name"] != "my pic!.png" {
		t.Errorf("original_name = %v", up["original_name"])
	}
	if up["url"] != "/backgrounds/"+filename {
		t.Errorf("url = %v", up["url"])
	}
	// 文件确实写入磁盘
	if _, err := os.Stat(filepath.Join(h.Dir, filename)); err != nil {
		t.Errorf("file not written: %v", err)
	}

	// List
	rec = httptest.NewRecorder()
	auth.RequireAuth(h.List)(rec, authedReq("GET", "/api/backgrounds", "", cv))
	var list []map[string]any
	json.Unmarshal(rec.Body.Bytes(), &list)
	if len(list) != 1 || list[0]["filename"] != filename {
		t.Errorf("list = %v", list)
	}

	// Delete
	rec = httptest.NewRecorder()
	req = authedReq("DELETE", "/api/backgrounds/1", "", cv)
	req.SetPathValue("id", "1")
	auth.RequireAuth(h.Delete)(rec, req)
	if rec.Code != 200 {
		t.Errorf("delete: %d %s", rec.Code, rec.Body.String())
	}
	if _, err := os.Stat(filepath.Join(h.Dir, filename)); !os.IsNotExist(err) {
		t.Errorf("file should be removed")
	}

	// 再删 → 404
	rec = httptest.NewRecorder()
	req = authedReq("DELETE", "/api/backgrounds/1", "", cv)
	req.SetPathValue("id", "1")
	auth.RequireAuth(h.Delete)(rec, req)
	if rec.Code != 404 {
		t.Errorf("delete again: %d", rec.Code)
	}
}

func TestBackgroundUploadBadType(t *testing.T) {
	h, auth, cv := newTestBackgrounds(t)
	req := uploadRequest(t, "image", "evil.svg", "image/svg+xml", []byte("<svg/>"), cv)
	rec := httptest.NewRecorder()
	auth.RequireAuth(h.Upload)(rec, req)
	if rec.Code != 400 {
		t.Fatalf("bad type: %d", rec.Code)
	}
	if !strings.Contains(rec.Body.String(), "Only JPEG, PNG, GIF, and WebP are allowed") {
		t.Errorf("body = %s", rec.Body.String())
	}
}

func TestBackgroundUploadNoFile(t *testing.T) {
	h, auth, cv := newTestBackgrounds(t)
	var buf bytes.Buffer
	mw := multipart.NewWriter(&buf)
	mw.Close()
	req := httptest.NewRequest("POST", "/api/backgrounds/upload", &buf)
	req.Header.Set("Content-Type", mw.FormDataContentType())
	req.AddCookie(&http.Cookie{Name: "connect.sid", Value: cv})
	rec := httptest.NewRecorder()
	auth.RequireAuth(h.Upload)(rec, req)
	if rec.Code != 400 {
		t.Errorf("no file: %d", rec.Code)
	}
}
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd go-server && go test ./...`
Expected: 编译失败 `undefined: BackgroundsHandler`

- [ ] **Step 3: 实现 `go-server/backgrounds.go`**

`go-server/backgrounds.go`:

```go
package main

import (
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"time"
)

type BackgroundsHandler struct {
	Store *Store
	Dir   string
}

const maxUploadSize = 5 * 1024 * 1024 // 5MB，对齐 multer 限制

var allowedImageTypes = map[string]bool{
	"image/jpeg": true,
	"image/png":  true,
	"image/gif":  true,
	"image/webp": true,
}

var unsafeFilenameChars = regexp.MustCompile(`[^a-zA-Z0-9._-]`)

// sanitizeFilename 对齐 Node：/ \ 及非常用字符全部替换为 _
func sanitizeFilename(name string) string {
	name = strings.ReplaceAll(name, "/", "_")
	name = strings.ReplaceAll(name, "\\", "_")
	return unsafeFilenameChars.ReplaceAllString(name, "_")
}

func (h *BackgroundsHandler) List(w http.ResponseWriter, r *http.Request) {
	list, err := h.Store.ListBackgrounds()
	if err != nil {
		slog.Error("Error fetching backgrounds", "err", err)
		writeErr(w, 500, "Failed to fetch backgrounds")
		return
	}
	writeJSON(w, 200, list)
}

func (h *BackgroundsHandler) Upload(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, maxUploadSize)
	if err := r.ParseMultipartForm(maxUploadSize); err != nil {
		writeErr(w, 400, "File too large or invalid form")
		return
	}
	file, header, err := r.FormFile("image")
	if err != nil {
		writeErr(w, 400, "No file uploaded")
		return
	}
	defer file.Close()

	mime := header.Header.Get("Content-Type")
	if !allowedImageTypes[mime] {
		writeErr(w, 400, "Invalid file type. Only JPEG, PNG, GIF, and WebP are allowed.")
		return
	}

	if err := os.MkdirAll(h.Dir, 0o755); err != nil {
		writeErr(w, 500, "Failed to upload background")
		return
	}
	filename := fmt.Sprintf("%d-%s", time.Now().UnixMilli(), sanitizeFilename(header.Filename))
	dst, err := os.Create(filepath.Join(h.Dir, filename))
	if err != nil {
		writeErr(w, 500, "Failed to upload background")
		return
	}
	size, err := io.Copy(dst, file)
	dst.Close()
	if err != nil {
		writeErr(w, 500, "Failed to upload background")
		return
	}

	id, err := h.Store.CreateBackground(filename, header.Filename, mime, size)
	if err != nil {
		writeErr(w, 500, "Failed to upload background")
		return
	}
	writeJSON(w, 200, map[string]any{
		"id":            id,
		"filename":      filename,
		"original_name": header.Filename,
		"url":           "/backgrounds/" + filename,
	})
}

func (h *BackgroundsHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil {
		writeErr(w, 400, "Invalid ID")
		return
	}
	bg, err := h.Store.GetBackground(id)
	if err != nil {
		writeErr(w, 500, "Failed to delete background")
		return
	}
	if bg == nil {
		writeErr(w, 404, "Background not found")
		return
	}
	os.Remove(filepath.Join(h.Dir, bg.Filename)) // 文件不存在不算错误（对齐 Node existsSync 检查）
	if _, err := h.Store.DeleteBackground(id); err != nil {
		writeErr(w, 500, "Failed to delete background")
		return
	}
	writeJSON(w, 200, map[string]bool{"success": true})
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `cd go-server && go test ./...`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add go-server/backgrounds.go go-server/backgrounds_test.go
git commit -m "feat(go): background image upload handlers"
```

---

### Task 10: static.go + public/ 迁移 — 静态文件服务

**Files:**
- Create: `go-server/static.go`、`go-server/static_test.go`
- Move: `public/` → `go-server/public/`（`git mv`）
- Modify: `src/server.ts:63`（Node 版静态路径跟随迁移）

**Interfaces:**
- Produces:
  - `func cacheControlFor(p string) string`（分层缓存策略）
  - `func newStaticHandler() http.Handler`（embed.FS serve public/）
  - `func newDiskStaticHandler(dir string) http.Handler`（/backgrounds/ 磁盘目录）
  - `func isWSUpgrade(r *http.Request) bool`（main.go 用于 WS 分发）

**关键实现细节：**
- embed 文件 modtime 为零值 → 用进程启动时间作为 Last-Modified（保证运行期内 If-Modified-Since 再验证可用）
- 缓存策略逐字对齐 Node 版：html → `no-cache`；favicon/.ico/apple-touch-icon.png → `public, max-age=86400`；js/css/字体/图片 → `public, max-age=31536000, immutable`；其他 → `no-cache`
- Node 版 `src/server.ts` 静态根从 `process.cwd()/public` 改为 `process.cwd()/go-server/public`（一行改动，保持 Node 版可运行用于对比）

- [ ] **Step 1: 迁移 public/ 并更新 Node 版引用**

```bash
git mv public go-server/public
```

修改 `src/server.ts` 第 63 行：

```typescript
// 改前
app.use(express.static(path.join(process.cwd(), 'public'), staticOpts));
// 改后
app.use(express.static(path.join(process.cwd(), 'go-server', 'public'), staticOpts));
```

重建 Node 版：`npm run build`（tsx watch 的 dev 实例会自动重载，重建后 Node 生产版也能正常工作）。

- [ ] **Step 2: 写失败测试 `go-server/static_test.go`**

```go
package main

import (
	"net/http/httptest"
	"testing"
)

func TestCacheControlFor(t *testing.T) {
	cases := []struct {
		path string
		want string
	}{
		{"/index.html", "no-cache"},
		{"/login.html", "no-cache"},
		{"/js/app.js", "public, max-age=31536000, immutable"},
		{"/term.css", "public, max-age=31536000, immutable"},
		{"/fonts/x.woff2", "public, max-age=31536000, immutable"},
		{"/themes/default.json", "no-cache"},
		{"/favicon.ico", "public, max-age=86400"},
		{"/favicon-32x32.png", "public, max-age=86400"},
		{"/apple-touch-icon.png", "public, max-age=86400"},
		{"/img/logo.png", "public, max-age=31536000, immutable"},
		{"/img/bg.webp", "public, max-age=31536000, immutable"},
	}
	for _, c := range cases {
		if got := cacheControlFor(c.path); got != c.want {
			t.Errorf("cacheControlFor(%q) = %q, want %q", c.path, got, c.want)
		}
	}
}

func TestStaticHandlerServesIndex(t *testing.T) {
	h := newStaticHandler()
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest("GET", "/", nil))
	if rec.Code != 200 {
		t.Fatalf("GET /: %d", rec.Code)
	}
	if cc := rec.Header().Get("Cache-Control"); cc != "no-cache" {
		t.Errorf("Cache-Control = %q", cc)
	}
	if ct := rec.Header().Get("Content-Type"); ct == "" {
		t.Errorf("no Content-Type")
	}
	if rec.Header().Get("Last-Modified") == "" {
		t.Errorf("no Last-Modified")
	}
}

func TestStaticHandlerJSImmutable(t *testing.T) {
	h := newStaticHandler()
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest("GET", "/js/app.js", nil))
	if rec.Code != 200 {
		t.Fatalf("GET /js/app.js: %d", rec.Code)
	}
	if cc := rec.Header().Get("Cache-Control"); cc != "public, max-age=31536000, immutable" {
		t.Errorf("Cache-Control = %q", cc)
	}
}

func TestStaticHandlerNotFound(t *testing.T) {
	h := newStaticHandler()
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest("GET", "/nonexistent.txt", nil))
	if rec.Code != 404 {
		t.Errorf("404 expected, got %d", rec.Code)
	}
}

func TestIsWSUpgrade(t *testing.T) {
	req := httptest.NewRequest("GET", "/", nil)
	if isWSUpgrade(req) {
		t.Errorf("plain GET should not be WS upgrade")
	}
	req.Header.Set("Upgrade", "websocket")
	req.Header.Set("Connection", "Upgrade")
	if !isWSUpgrade(req) {
		t.Errorf("should detect WS upgrade")
	}
}
```

- [ ] **Step 3: 运行测试确认失败**

Run: `cd go-server && go test ./...`
Expected: 编译失败 `undefined: cacheControlFor`

- [ ] **Step 4: 实现 `go-server/static.go`**

`go-server/static.go`:

```go
package main

import (
	"embed"
	"io"
	"io/fs"
	"net/http"
	"os"
	"path"
	"path/filepath"
	"strings"
	"time"
)

//go:embed public
var publicFS embed.FS

var serverStartTime = time.Now()

// cacheControlFor 逐字对齐 Node 版 setStaticCacheHeaders 的分层缓存策略。
func cacheControlFor(p string) string {
	ext := strings.ToLower(path.Ext(p))
	base := strings.ToLower(path.Base(p))
	switch {
	case ext == ".html":
		return "no-cache"
	case ext == ".ico" || strings.HasPrefix(base, "favicon") || base == "apple-touch-icon.png":
		return "public, max-age=86400"
	case strings.Contains(",.js,.css,.otf,.woff,.woff2,.ttf,", ","+ext+","):
		return "public, max-age=31536000, immutable"
	case strings.Contains(",.png,.jpg,.jpeg,.webp,.gif,.svg,", ","+ext+","):
		return "public, max-age=31536000, immutable"
	default:
		return "no-cache"
	}
}

// serveFS 以 Cache-Control + Last-Modified 提供文件服务。
// embed 文件无 modtime，用进程启动时间代替（保证运行期内 If-Modified-Since 可再验证）。
func serveFS(fsys fs.FS, w http.ResponseWriter, r *http.Request, name string) {
	f, err := fsys.Open(name)
	if err != nil {
		http.NotFound(w, r)
		return
	}
	defer f.Close()
	st, err := f.Stat()
	if err != nil || st.IsDir() {
		http.NotFound(w, r)
		return
	}
	rs, ok := f.(io.ReadSeeker)
	if !ok {
		http.NotFound(w, r)
		return
	}
	w.Header().Set("Cache-Control", cacheControlFor(name))
	http.ServeContent(w, r, st.Name(), serverStartTime, rs)
}

// ---- embed 静态（public/） ----

type embedStaticHandler struct {
	sub fs.FS
}

func newStaticHandler() http.Handler {
	sub, err := fs.Sub(publicFS, "public")
	if err != nil {
		panic(err)
	}
	return &embedStaticHandler{sub: sub}
}

func (h *embedStaticHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	p := path.Clean("/" + r.URL.Path)
	if p == "/" {
		p = "/index.html"
	}
	serveFS(h.sub, w, r, strings.TrimPrefix(p, "/"))
}

// ---- 磁盘静态（data/backgrounds/） ----

type dirFS struct{ dir string }

func (d dirFS) Open(name string) (fs.File, error) {
	return os.Open(filepath.Join(d.dir, name))
}

type diskStaticHandler struct {
	sub fs.FS
}

func newDiskStaticHandler(dir string) http.Handler {
	return &diskStaticHandler{sub: dirFS{dir: dir}}
}

func (h *diskStaticHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	p := path.Clean("/" + r.URL.Path)
	name := strings.TrimPrefix(p, "/")
	if strings.Contains(name, "..") {
		http.NotFound(w, r)
		return
	}
	serveFS(h.sub, w, r, name)
}

// ---- WS upgrade 检测 ----

func isWSUpgrade(r *http.Request) bool {
	return strings.EqualFold(r.Header.Get("Upgrade"), "websocket") &&
		strings.Contains(strings.ToLower(r.Header.Get("Connection")), "upgrade")
}
```

- [ ] **Step 5: 运行测试确认通过**

Run: `cd go-server && go test ./...`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add go-server/static.go go-server/static_test.go go-server/public src/server.ts dist
git commit -m "feat(go): static file serving with layered cache; relocate public/"
```

---

### Task 11: main.go — 服务装配与端到端冒烟

**Files:**
- Create: `go-server/main.go`

**Interfaces:**
- Consumes: 全部前序任务
- Produces: 可运行的 `webterm` 二进制

**关键实现细节：**
- 路由用 Go 1.22 方法模式（`"POST /api/auth/login"` 等）；需登录的端点用 `auth.RequireAuth` 包装
- `/` 处理器：`isWSUpgrade(r)` → WSHandler，否则静态文件（对齐 Node 版 WS server 挂在同一端口任意路径）
- `/backgrounds/` 用 `http.StripPrefix` + diskStaticHandler（磁盘目录，与 embed 分离）
- 优雅退出：SIGINT/SIGTERM → `Manager.CloseAll()` → `srv.Shutdown(5s)`
- 启动顺序：LoadConfig → setupLogger → NewStore → InitializeDefaultUser → 路由 → Listen

- [ ] **Step 1: 实现 `go-server/main.go`**

`go-server/main.go`:

```go
package main

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"
)

func main() {
	if err := run(); err != nil {
		slog.Error("Failed to start server", "err", err)
		os.Exit(1)
	}
}

func run() error {
	cfg := LoadConfig()
	setupLogger(cfg.LogLevel)

	store, err := NewStore(cfg.DBPath)
	if err != nil {
		return err
	}
	defer store.Close()

	if err := InitializeDefaultUser(store, cfg); err != nil {
		return err
	}

	sessions := NewSessionStore(cfg.SessionSecret, cfg.SessionMaxAge)
	auth := &Auth{Store: store, Sessions: sessions, MaxAge: cfg.SessionMaxAge}
	manager := NewManager(store)
	api := &API{Store: store, Cfg: cfg}
	bg := &BackgroundsHandler{Store: store, Dir: cfg.BackgroundsDir()}
	wsHandler := &WSHandler{Manager: manager, Sessions: sessions}
	staticH := newStaticHandler()

	mux := http.NewServeMux()

	// Auth
	mux.HandleFunc("POST /api/auth/login", auth.Login)
	mux.HandleFunc("POST /api/auth/logout", auth.Logout)
	mux.HandleFunc("POST /api/auth/change-password", auth.RequireAuth(auth.ChangePassword))

	// Connections
	mux.HandleFunc("GET /api/connections", auth.RequireAuth(api.ListConnections))
	mux.HandleFunc("POST /api/connections", auth.RequireAuth(api.CreateConnection))
	mux.HandleFunc("PUT /api/connections/{id}", auth.RequireAuth(api.UpdateConnection))
	mux.HandleFunc("DELETE /api/connections/{id}", auth.RequireAuth(api.DeleteConnection))

	// Sessions
	mux.HandleFunc("GET /api/sessions", auth.RequireAuth(api.ListSessions))

	// Settings：GET 公开，PUT 需登录（对齐 Node 版）
	mux.HandleFunc("GET /api/settings", api.GetSettings)
	mux.HandleFunc("PUT /api/settings", auth.RequireAuth(api.PutSettings))

	// Recordings
	mux.HandleFunc("GET /api/recordings", auth.RequireAuth(api.ListRecordings))
	mux.HandleFunc("GET /api/recordings/{id}/download", auth.RequireAuth(api.DownloadRecording))

	// Backgrounds
	mux.HandleFunc("GET /api/backgrounds", auth.RequireAuth(bg.List))
	mux.HandleFunc("POST /api/backgrounds/upload", auth.RequireAuth(bg.Upload))
	mux.HandleFunc("DELETE /api/backgrounds/{id}", auth.RequireAuth(bg.Delete))

	// 上传的背景图（磁盘目录）
	mux.Handle("GET /backgrounds/", http.StripPrefix("/backgrounds/", newDiskStaticHandler(cfg.BackgroundsDir())))

	// 根路径：WS upgrade → WSHandler；否则静态文件（对齐 Node 版同端口挂载）
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		if isWSUpgrade(r) {
			wsHandler.ServeHTTP(w, r)
			return
		}
		staticH.ServeHTTP(w, r)
	})

	srv := &http.Server{
		Addr:              fmt.Sprintf("%s:%d", cfg.Host, cfg.Port),
		Handler:           mux,
		ReadHeaderTimeout: 10 * time.Second,
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	errCh := make(chan error, 1)
	go func() {
		slog.Info("WebTerm server running", "addr", fmt.Sprintf("http://%s:%d", cfg.Host, cfg.Port))
		errCh <- srv.ListenAndServe()
	}()

	select {
	case err := <-errCh:
		if !errors.Is(err, http.ErrServerClosed) {
			return err
		}
		return nil
	case <-ctx.Done():
	}

	slog.Info("Shutting down...")
	manager.CloseAll()
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	return srv.Shutdown(shutdownCtx)
}
```

- [ ] **Step 2: 全量测试 + 构建**

Run: `cd go-server && go vet ./... && go test ./... && CGO_ENABLED=0 go build -o webterm .`
Expected: 全部 PASS，生成 `go-server/webterm` 二进制

- [ ] **Step 3: 端到端冒烟（真实 data/，端口 8091 避免与 dev 冲突）**

从**仓库根目录**启动（cwd 决定 data/ 位置）：

```bash
PORT=8091 LOG_LEVEL=debug ./go-server/webterm &
sleep 1
# 1. 首页 200 + no-cache
curl -sI http://127.0.0.1:8091/ | head -5
# 2. 静态 JS immutable 缓存
curl -sI http://127.0.0.1:8091/js/app.js | grep -i cache-control
# 3. 未登录访问受保护端点 → 401
curl -s http://127.0.0.1:8091/api/connections
# 4. 公开 settings → {} 或已有设置
curl -s http://127.0.0.1:8091/api/settings
# 5. 登录（用现有 data/webterm.db 的账号，验证 bcrypt 兼容）
curl -sv -c /tmp/wt-cookie.txt -X POST http://127.0.0.1:8091/api/auth/login \
  -H 'Content-Type: application/json' -d '{"username":"admin","password":"admin"}' 2>&1 | tail -3
# 6. 带 cookie 访问 connections → 200（验证现有数据可读）
curl -s -b /tmp/wt-cookie.txt http://127.0.0.1:8091/api/connections | head -c 300
# 7. WS 无 cookie → 401
curl -s -o /dev/null -w '%{http_code}\n' -H 'Upgrade: websocket' -H 'Connection: Upgrade' \
  -H 'Sec-WebSocket-Version: 13' -H 'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==' http://127.0.0.1:8091/
# 8. 优雅退出
kill %1; wait
```

Expected：1=200/no-cache；2=immutable；3=`{"error":"Authentication required"}`；4=JSON；5=`{"success":true,...}` 且 Set-Cookie 有 connect.sid；6=连接列表 JSON；7=401；8=日志输出 Shutting down 后退出码 0。

**如果第 5 步登录失败**：说明现有 DB 的 admin 密码不是 `admin`——用真实密码重试；bcrypt 验证通过即证明哈希兼容。

- [ ] **Step 4: Commit**

```bash
git add go-server/main.go
git commit -m "feat(go): server assembly with graceful shutdown"
```

---

### Task 12: Dockerfile + docker-compose + 验证与内存基准

**Files:**
- Create: `Dockerfile`、`.dockerignore`、`docker-compose.yml`（均在仓库根）
- Modify: `README.md`（追加 Go/Docker 使用段落）

**Interfaces:**
- Consumes: Task 11 的可构建二进制
- Produces: `docker build` 可用的镜像、`docker compose up` 一键启动

**关键实现细节：**
- Dockerfile 多阶段：`golang:1.24-alpine` 构建（`CGO_ENABLED=0`、`-ldflags="-s -w" -trimpath`）→ `scratch` 只放二进制 + CA 证书
- 容器内固定 `PORT=8008`，`DB_PATH=/data/webterm.db`、`LOG_DIR=/data/logs`、`LOG_LEVEL=warn`（对齐用户"运行时 warning 及以上"要求）
- compose 端口映射复用项目 `.env` 的 `PORT`（compose 自动读取根目录 .env）：`"${PORT:-8008}:8008"`
- `GOMEMLIMIT` 默认 `200MiB`（Go 运行时原生识别的软内存上限）
- `.dockerignore` 排除一切 except `go-server/`（构建上下文最小化）

- [ ] **Step 1: 创建 `Dockerfile`**

```dockerfile
# syntax=docker/dockerfile:1

FROM golang:1.24-alpine AS build
WORKDIR /src
COPY go-server/go.mod go-server/go.sum ./
RUN go mod download
COPY go-server/ ./
RUN CGO_ENABLED=0 go build -ldflags="-s -w" -trimpath -o /webterm .

FROM scratch
COPY --from=build /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/
COPY --from=build /webterm /webterm
ENV PORT=8008 \
    HOST=0.0.0.0 \
    DB_PATH=/data/webterm.db \
    LOG_DIR=/data/logs \
    LOG_LEVEL=warn
VOLUME ["/data"]
EXPOSE 8008
ENTRYPOINT ["/webterm"]
```

- [ ] **Step 2: 创建 `.dockerignore`**

```
# 构建上下文只需要 go-server/
*
!go-server
# go-server 内排除本地产物
go-server/webterm
go-server/data
```

- [ ] **Step 3: 创建 `docker-compose.yml`**

```yaml
services:
  webterm:
    build: .
    image: webterm:latest
    # compose 自动读取本目录 .env；复用其 PORT 作为宿主机端口（默认 8008）
    ports:
      - "${PORT:-8008}:8008"
    environment:
      SESSION_SECRET: ${SESSION_SECRET:?请在 .env 中设置 SESSION_SECRET}
      ADMIN_USER: ${ADMIN_USER:-admin}
      ADMIN_PASS: ${ADMIN_PASS:-admin}
      LOG_LEVEL: ${LOG_LEVEL:-warn}
      GOMEMLIMIT: ${GOMEMLIMIT:-200MiB}
    volumes:
      - ./data:/data
    restart: unless-stopped
```

- [ ] **Step 4: 构建镜像并验证大小**

Run: `docker build -t webterm:latest . && docker images webterm:latest`
Expected: 构建成功；镜像 SIZE ≤ 25MB（预期 ~10-15MB）

- [ ] **Step 5: compose 启动 + 冒烟**

```bash
docker compose up -d
sleep 2
docker compose ps
# 首页
curl -sI http://127.0.0.1:${PORT:-8008}/ | head -3
# 登录 + 受保护端点
curl -s -c /tmp/wt-docker-cookie.txt -X POST http://127.0.0.1:${PORT:-8008}/api/auth/login \
  -H 'Content-Type: application/json' -d "{\"username\":\"${ADMIN_USER:-admin}\",\"password\":\"${ADMIN_PASS:-admin}\"}"
curl -s -b /tmp/wt-docker-cookie.txt http://127.0.0.1:${PORT:-8008}/api/connections | head -c 200
# 容器内存（关键指标）
docker stats --no-stream --format 'container={{.Name}} mem={{.MemUsage}}'
```

Expected: 登录 `{"success":true,...}`；connections 返回现有数据（./data 卷挂载生效）；**容器内存 ≤ 40MB**（预期 ~15-25MB）。

注意：`docker compose up` 前确保宿主机 8008/8009 端口不被 Node dev 实例占用（dev 在 8009 则 8008 空闲；若冲突，用 `PORT=8090 docker compose up -d` 覆盖）。

- [ ] **Step 6: 内存基准对比（写入最终报告）**

```bash
# Go 容器
docker stats --no-stream --format 'Go container: {{.MemUsage}}'
# Node 生产模式基线（Task 前已实测记录：空闲 ~90MB RSS）
# 浏览器开 2-3 个 SSH 会话后再测一次：
docker stats --no-stream --format 'Go container (with sessions): {{.MemUsage}}'
```

把结果追加到 `docs/superpowers/specs/2026-07-22-go-rewrite-docker-design.md` 末尾的"验证结果"小节（格式：日期、两版空闲 RSS、会话中 RSS、镜像大小）。

- [ ] **Step 7: 浏览器手动验证（用户执行或辅助执行）**

用浏览器打开 `http://127.0.0.1:<PORT>`，验证：登录 → 新建 SSH/Telnet 会话 → 输入/输出/resize → 多标签 → 改密 → 上传背景 → 设置保存。全部正常即功能对齐完成。

- [ ] **Step 8: README 追加使用说明**

在 `README.md` 末尾追加：

```markdown
## Go 版本（低内存）

后端已用 Go 重写（`go-server/`），功能与 Node 版一致，内存占用降低 70-80%（空闲 ~15-25MB）。

### 本地运行

```bash
cd go-server
go build -o webterm .
cd .. && ./go-server/webterm   # 复用根目录 .env 与 data/
```

### Docker（推荐）

```bash
docker build -t webterm .
docker compose up -d     # 端口取 .env 的 PORT，默认 8008
```

镜像 ~15MB（scratch + 静态二进制）。数据持久化在 `./data`（SQLite、背景图、日志）。
```

- [ ] **Step 9: Commit**

```bash
git add Dockerfile .dockerignore docker-compose.yml README.md docs/superpowers/specs/2026-07-22-go-rewrite-docker-design.md
git commit -m "feat(docker): scratch-based image and compose for Go webterm"
```

---

## 完成定义（对齐设计验收标准）

- [ ] `cd go-server && go test ./...` 全部通过
- [ ] 15 个 HTTP 端点行为与 Node 版一致（冒烟 + 测试覆盖）
- [ ] 前端零改动通过 Go 版完整使用（浏览器手动验证）
- [ ] 现有 data/webterm.db 直接可用（登录成功 + connections 数据正确）
- [ ] 空闲 RSS ≤ 30MB；Docker 镜像 ≤ 25MB；`docker compose up` 一键可用
- [ ] WS 未登录访问被拒绝（401）
