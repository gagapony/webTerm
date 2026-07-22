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
	once := false
	mk := func(o SessionOptions, h SessionHandlers) (TerminalSession, error) {
		if !once {
			once = true
			fs.handlers = h
			return fs, nil
		}
		return &fakeSession{handlers: h}, nil
	}
	m := NewManager(newTestStore(t))
	m.SetDialers(mk, mk)
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
		func(o SessionOptions, h SessionHandlers) (TerminalSession, error) {
			return nil, errors.New("connection refused")
		},
		nil,
	)
	ws := &fakeWS{}
	_, err := m.Create(ws, "ws-1", "ssh", SessionOptions{Host: "h", Port: 22})
	if err == nil || err.Error() != "connection refused" {
		t.Errorf("err = %v", err)
	}
}

func TestManagerCleanupWS(t *testing.T) {
	m, _, ws := newTestManager(t)
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
