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
