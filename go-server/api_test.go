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
