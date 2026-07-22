package main

import (
	"bytes"
	"encoding/json"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"net/textproto"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func newTestBackgrounds(t *testing.T) (*BackgroundsHandler, *Auth, string) {
	t.Helper()
	store := newTestStore(t)
	h := &BackgroundsHandler{Store: store, Dir: filepath.Join(t.TempDir(), "backgrounds")}
	auth := &Auth{Store: store, Sessions: NewSessionStore("s", time.Hour), MaxAge: time.Hour}
	cv := auth.Sessions.Create(1, "admin")
	return h, auth, cv
}

func uploadRequest(t *testing.T, fieldName, filename, contentType string, content []byte, cv string) *http.Request {
	t.Helper()
	var buf bytes.Buffer
	mw := multipart.NewWriter(&buf)
	hdr := textproto.MIMEHeader{}
	hdr.Set("Content-Disposition", `form-data; name="`+fieldName+`"; filename="`+filename+`"`)
	hdr.Set("Content-Type", contentType)
	pw, _ := mw.CreatePart(hdr)
	pw.Write(content)
	mw.Close()
	req := httptest.NewRequest("POST", "/api/backgrounds/upload", &buf)
	req.Header.Set("Content-Type", mw.FormDataContentType())
	req.AddCookie(&http.Cookie{Name: "connect.sid", Value: cv})
	return req
}

func TestBackgroundUploadListDelete(t *testing.T) {
	h, auth, cv := newTestBackgrounds(t)

	// 上传合法 PNG
	req := uploadRequest(t, "image", "my pic!.png", "image/png", []byte("\x89PNG fake"), cv)
	rec := httptest.NewRecorder()
	auth.RequireAuth(h.Upload)(rec, req)
	if rec.Code != 200 {
		t.Fatalf("upload: %d %s", rec.Code, rec.Body.String())
	}
	var up map[string]any
	json.Unmarshal(rec.Body.Bytes(), &up)
	filename := up["filename"].(string)
	if !strings.HasSuffix(filename, "-my_pic_.png") { // 空格和 ! 消毒为 _
		t.Errorf("filename = %q", filename)
	}
	if up["original_name"] != "my pic!.png" {
		t.Errorf("original_name = %v", up["original_name"])
	}
	if up["url"] != "/backgrounds/"+filename {
		t.Errorf("url = %v", up["url"])
	}
	// 文件确实写入磁盘
	if _, err := os.Stat(filepath.Join(h.Dir, filename)); err != nil {
		t.Errorf("file not written: %v", err)
	}

	// List
	rec = httptest.NewRecorder()
	auth.RequireAuth(h.List)(rec, authedReq("GET", "/api/backgrounds", "", cv))
	var list []map[string]any
	json.Unmarshal(rec.Body.Bytes(), &list)
	if len(list) != 1 || list[0]["filename"] != filename {
		t.Errorf("list = %v", list)
	}

	// Delete
	rec = httptest.NewRecorder()
	req = authedReq("DELETE", "/api/backgrounds/1", "", cv)
	req.SetPathValue("id", "1")
	auth.RequireAuth(h.Delete)(rec, req)
	if rec.Code != 200 {
		t.Errorf("delete: %d %s", rec.Code, rec.Body.String())
	}
	if _, err := os.Stat(filepath.Join(h.Dir, filename)); !os.IsNotExist(err) {
		t.Errorf("file should be removed")
	}

	// 再删 → 404
	rec = httptest.NewRecorder()
	req = authedReq("DELETE", "/api/backgrounds/1", "", cv)
	req.SetPathValue("id", "1")
	auth.RequireAuth(h.Delete)(rec, req)
	if rec.Code != 404 {
		t.Errorf("delete again: %d", rec.Code)
	}
}

func TestBackgroundUploadBadType(t *testing.T) {
	h, auth, cv := newTestBackgrounds(t)
	req := uploadRequest(t, "image", "evil.svg", "image/svg+xml", []byte("<svg/>"), cv)
	rec := httptest.NewRecorder()
	auth.RequireAuth(h.Upload)(rec, req)
	if rec.Code != 400 {
		t.Fatalf("bad type: %d", rec.Code)
	}
	if !strings.Contains(rec.Body.String(), "Only JPEG, PNG, GIF, and WebP are allowed") {
		t.Errorf("body = %s", rec.Body.String())
	}
}

func TestBackgroundUploadNoFile(t *testing.T) {
	h, auth, cv := newTestBackgrounds(t)
	var buf bytes.Buffer
	mw := multipart.NewWriter(&buf)
	mw.Close()
	req := httptest.NewRequest("POST", "/api/backgrounds/upload", &buf)
	req.Header.Set("Content-Type", mw.FormDataContentType())
	req.AddCookie(&http.Cookie{Name: "connect.sid", Value: cv})
	rec := httptest.NewRecorder()
	auth.RequireAuth(h.Upload)(rec, req)
	if rec.Code != 400 {
		t.Errorf("no file: %d", rec.Code)
	}
}

func TestBackgroundUploadTooLarge(t *testing.T) {
	h, auth, cv := newTestBackgrounds(t)
	// 6MB PNG payload exceeds maxUploadSize (5MB); MaxBytesReader must reject it.
	large := make([]byte, 6*1024*1024)
	for i := range large {
		large[i] = 0x89
	}
	req := uploadRequest(t, "image", "huge.png", "image/png", large, cv)
	rec := httptest.NewRecorder()
	auth.RequireAuth(h.Upload)(rec, req)
	if rec.Code != 400 {
		t.Fatalf("too large: %d %s", rec.Code, rec.Body.String())
	}
	if !strings.Contains(rec.Body.String(), "File too large") {
		t.Errorf("body should contain 'File too large', got: %s", rec.Body.String())
	}
}
