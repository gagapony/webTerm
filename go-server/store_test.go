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
