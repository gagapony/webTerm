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
