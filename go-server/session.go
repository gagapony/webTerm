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
