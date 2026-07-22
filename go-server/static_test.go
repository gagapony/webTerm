package main

import (
	"net/http/httptest"
	"testing"
)

func TestCacheControlFor(t *testing.T) {
	cases := []struct {
		path string
		want string
	}{
		{"/index.html", "no-cache"},
		{"/login.html", "no-cache"},
		{"/js/app.js", "public, max-age=31536000, immutable"},
		{"/term.css", "public, max-age=31536000, immutable"},
		{"/fonts/x.woff2", "public, max-age=31536000, immutable"},
		{"/themes/default.json", "no-cache"},
		{"/favicon.ico", "public, max-age=86400"},
		{"/favicon-32x32.png", "public, max-age=86400"},
		{"/apple-touch-icon.png", "public, max-age=86400"},
		{"/img/logo.png", "public, max-age=31536000, immutable"},
		{"/img/bg.webp", "public, max-age=31536000, immutable"},
	}
	for _, c := range cases {
		if got := cacheControlFor(c.path); got != c.want {
			t.Errorf("cacheControlFor(%q) = %q, want %q", c.path, got, c.want)
		}
	}
}

func TestStaticHandlerServesIndex(t *testing.T) {
	h := newStaticHandler()
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest("GET", "/", nil))
	if rec.Code != 200 {
		t.Fatalf("GET /: %d", rec.Code)
	}
	if cc := rec.Header().Get("Cache-Control"); cc != "no-cache" {
		t.Errorf("Cache-Control = %q", cc)
	}
	if ct := rec.Header().Get("Content-Type"); ct == "" {
		t.Errorf("no Content-Type")
	}
	if rec.Header().Get("Last-Modified") == "" {
		t.Errorf("no Last-Modified")
	}
}

func TestStaticHandlerJSImmutable(t *testing.T) {
	h := newStaticHandler()
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest("GET", "/js/app.js", nil))
	if rec.Code != 200 {
		t.Fatalf("GET /js/app.js: %d", rec.Code)
	}
	if cc := rec.Header().Get("Cache-Control"); cc != "public, max-age=31536000, immutable" {
		t.Errorf("Cache-Control = %q", cc)
	}
}

func TestStaticHandlerNotFound(t *testing.T) {
	h := newStaticHandler()
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest("GET", "/nonexistent.txt", nil))
	if rec.Code != 404 {
		t.Errorf("404 expected, got %d", rec.Code)
	}
}

func TestIsWSUpgrade(t *testing.T) {
	req := httptest.NewRequest("GET", "/", nil)
	if isWSUpgrade(req) {
		t.Errorf("plain GET should not be WS upgrade")
	}
	req.Header.Set("Upgrade", "websocket")
	req.Header.Set("Connection", "Upgrade")
	if !isWSUpgrade(req) {
		t.Errorf("should detect WS upgrade")
	}
}
