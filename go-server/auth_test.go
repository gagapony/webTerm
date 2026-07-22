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
