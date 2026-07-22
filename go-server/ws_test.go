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
