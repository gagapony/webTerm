package main

import (
	"context"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"log/slog"
	"net/http"
	"strings"
	"sync"
	"time"

	"golang.org/x/crypto/bcrypt"
)

const sessionCookieName = "connect.sid"

// ---- JSON helpers（全项目复用） ----

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v)
}

func writeErr(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, map[string]string{"error": msg})
}

// ---- Session store ----

type SessionData struct {
	UserID    int64
	Username  string
	ExpiresAt time.Time
}

type SessionStore struct {
	secret  string
	maxAge  time.Duration
	mu      sync.Mutex
	entries map[string]*SessionData
}

func NewSessionStore(secret string, maxAge time.Duration) *SessionStore {
	return &SessionStore{secret: secret, maxAge: maxAge, entries: map[string]*SessionData{}}
}

func randomHex(n int) string {
	b := make([]byte, n)
	if _, err := rand.Read(b); err != nil {
		panic(err)
	}
	return hex.EncodeToString(b)
}

func (s *SessionStore) sign(id string) string {
	mac := hmac.New(sha256.New, []byte(s.secret))
	mac.Write([]byte(id))
	return hex.EncodeToString(mac.Sum(nil))
}

// Create 生成会话并返回签名后的 cookie 值。
func (s *SessionStore) Create(userID int64, username string) string {
	id := randomHex(16)
	s.mu.Lock()
	s.entries[id] = &SessionData{UserID: userID, Username: username, ExpiresAt: time.Now().Add(s.maxAge)}
	s.mu.Unlock()
	return id + "." + s.sign(id)
}

func (s *SessionStore) parseCookieValue(v string) (string, bool) {
	id, sig, ok := strings.Cut(v, ".")
	if !ok || id == "" {
		return "", false
	}
	if !hmac.Equal([]byte(sig), []byte(s.sign(id))) {
		return "", false
	}
	return id, true
}

// FromRequest 解析 connect.sid cookie、验签、查过期。
func (s *SessionStore) FromRequest(r *http.Request) *SessionData {
	c, err := r.Cookie(sessionCookieName)
	if err != nil {
		return nil
	}
	id, ok := s.parseCookieValue(c.Value)
	if !ok {
		return nil
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	sd, ok := s.entries[id]
	if !ok || time.Now().After(sd.ExpiresAt) {
		delete(s.entries, id)
		return nil
	}
	return sd
}

func (s *SessionStore) DestroyCookieValue(v string) {
	if id, ok := s.parseCookieValue(v); ok {
		s.mu.Lock()
		delete(s.entries, id)
		s.mu.Unlock()
	}
}

func (s *SessionStore) setCookie(w http.ResponseWriter, r *http.Request, value string) {
	http.SetCookie(w, &http.Cookie{
		Name:     sessionCookieName,
		Value:    value,
		Path:     "/",
		MaxAge:   int(s.maxAge.Seconds()),
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
		Secure:   r.TLS != nil || r.Header.Get("X-Forwarded-Proto") == "https",
	})
}

// ---- Auth handlers ----

type ctxKey int

const ctxSessionKey ctxKey = iota

func SessionFromCtx(ctx context.Context) *SessionData {
	sd, _ := ctx.Value(ctxSessionKey).(*SessionData)
	return sd
}

type Auth struct {
	Store    *Store
	Sessions *SessionStore
	MaxAge   time.Duration
}

// InitializeDefaultUser 对齐 Node 版：users 表为空时创建默认管理员。
func InitializeDefaultUser(store *Store, cfg Config) error {
	if store.UserCount() != 0 {
		return nil
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(cfg.AdminPass), 10)
	if err != nil {
		return err
	}
	if err := store.CreateUser(cfg.AdminUser, string(hash)); err != nil {
		return err
	}
	slog.Info("Default user created", "username", cfg.AdminUser)
	return nil
}

// Status returns 200 with {authenticated: true/false}. Never returns 401,
// so the browser console stays clean when the frontend probes login state
// on page load.
func (a *Auth) Status(w http.ResponseWriter, r *http.Request) {
	sd := a.Sessions.FromRequest(r)
	writeJSON(w, 200, map[string]bool{"authenticated": sd != nil})
}

func (a *Auth) parseCredentials(r *http.Request) (string, string) {
	if strings.HasPrefix(r.Header.Get("Content-Type"), "application/json") {
		var body struct {
			Username string `json:"username"`
			Password string `json:"password"`
		}
		json.NewDecoder(r.Body).Decode(&body)
		return body.Username, body.Password
	}
	r.ParseForm()
	return r.FormValue("username"), r.FormValue("password")
}

func (a *Auth) Login(w http.ResponseWriter, r *http.Request) {
	username, password := a.parseCredentials(r)
	if username == "" || password == "" {
		writeErr(w, 400, "Username and password required")
		return
	}
	user, err := a.Store.GetUser(username)
	if err != nil || user == nil {
		slog.Warn("Login failed: user not found", "username", username)
		writeErr(w, 401, "Invalid credentials")
		return
	}
	if bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(password)) != nil {
		slog.Warn("Login failed: invalid password", "username", username)
		writeErr(w, 401, "Invalid credentials")
		return
	}
	a.Sessions.setCookie(w, r, a.Sessions.Create(user.ID, user.Username))
	slog.Info("User logged in", "username", username)
	writeJSON(w, 200, map[string]any{"success": true, "username": user.Username})
}

func (a *Auth) Logout(w http.ResponseWriter, r *http.Request) {
	if c, err := r.Cookie(sessionCookieName); err == nil {
		a.Sessions.DestroyCookieValue(c.Value)
	}
	writeJSON(w, 200, map[string]bool{"success": true})
}

func (a *Auth) ChangePassword(w http.ResponseWriter, r *http.Request) {
	var body struct {
		CurrentPassword string `json:"currentPassword"`
		NewPassword     string `json:"newPassword"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeErr(w, 400, "Current password and new password are required")
		return
	}
	if body.CurrentPassword == "" || body.NewPassword == "" {
		writeErr(w, 400, "Current password and new password are required")
		return
	}
	if len(body.NewPassword) < 6 {
		writeErr(w, 400, "New password must be at least 6 characters")
		return
	}
	sd := SessionFromCtx(r.Context())
	user, err := a.Store.GetUser(sd.Username)
	if err != nil || user == nil {
		writeErr(w, 404, "User not found")
		return
	}
	if bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(body.CurrentPassword)) != nil {
		writeErr(w, 401, "Current password is incorrect")
		return
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(body.NewPassword), 10)
	if err != nil {
		writeErr(w, 500, "Internal error")
		return
	}
	a.Store.UpdateUserPassword(user.ID, string(hash))
	slog.Info("Password changed", "username", sd.Username)
	writeJSON(w, 200, map[string]bool{"success": true})
}

func (a *Auth) RequireAuth(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		sd := a.Sessions.FromRequest(r)
		if sd == nil {
			writeErr(w, 401, "Authentication required")
			return
		}
		next(w, r.WithContext(context.WithValue(r.Context(), ctxSessionKey, sd)))
	}
}
