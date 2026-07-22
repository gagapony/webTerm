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
