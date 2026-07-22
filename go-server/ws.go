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
		slog.Debug("WebSocket auth failed", "remote", r.RemoteAddr)
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
