package main

import (
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"time"
)

type BackgroundsHandler struct {
	Store *Store
	Dir   string
}

const maxUploadSize = 5 * 1024 * 1024 // 5MB，对齐 multer 限制

var allowedImageTypes = map[string]bool{
	"image/jpeg": true,
	"image/png":  true,
	"image/gif":  true,
	"image/webp": true,
}

var unsafeFilenameChars = regexp.MustCompile(`[^a-zA-Z0-9._-]`)

// sanitizeFilename 对齐 Node：/ \ 及非常用字符全部替换为 _
func sanitizeFilename(name string) string {
	name = strings.ReplaceAll(name, "/", "_")
	name = strings.ReplaceAll(name, "\\", "_")
	return unsafeFilenameChars.ReplaceAllString(name, "_")
}

func (h *BackgroundsHandler) List(w http.ResponseWriter, r *http.Request) {
	list, err := h.Store.ListBackgrounds()
	if err != nil {
		slog.Error("Error fetching backgrounds", "err", err)
		writeErr(w, 500, "Failed to fetch backgrounds")
		return
	}
	writeJSON(w, 200, list)
}

func (h *BackgroundsHandler) Upload(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, maxUploadSize)
	if err := r.ParseMultipartForm(maxUploadSize); err != nil {
		writeErr(w, 400, "File too large or invalid form")
		return
	}
	file, header, err := r.FormFile("image")
	if err != nil {
		writeErr(w, 400, "No file uploaded")
		return
	}
	defer file.Close()

	mime := header.Header.Get("Content-Type")
	if !allowedImageTypes[mime] {
		writeErr(w, 400, "Invalid file type. Only JPEG, PNG, GIF, and WebP are allowed.")
		return
	}

	if err := os.MkdirAll(h.Dir, 0o755); err != nil {
		writeErr(w, 500, "Failed to upload background")
		return
	}
	filename := fmt.Sprintf("%d-%s", time.Now().UnixMilli(), sanitizeFilename(header.Filename))
	dst, err := os.Create(filepath.Join(h.Dir, filename))
	if err != nil {
		writeErr(w, 500, "Failed to upload background")
		return
	}
	size, err := io.Copy(dst, file)
	dst.Close()
	if err != nil {
		writeErr(w, 500, "Failed to upload background")
		return
	}

	id, err := h.Store.CreateBackground(filename, header.Filename, mime, size)
	if err != nil {
		os.Remove(filepath.Join(h.Dir, filename)) // best-effort cleanup of orphan
		writeErr(w, 500, "Failed to upload background")
		return
	}
	writeJSON(w, 200, map[string]any{
		"id":            id,
		"filename":      filename,
		"original_name": header.Filename,
		"url":           "/backgrounds/" + filename,
	})
}

func (h *BackgroundsHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil {
		writeErr(w, 400, "Invalid ID")
		return
	}
	bg, err := h.Store.GetBackground(id)
	if err != nil {
		writeErr(w, 500, "Failed to delete background")
		return
	}
	if bg == nil {
		writeErr(w, 404, "Background not found")
		return
	}
	if err := os.Remove(filepath.Join(h.Dir, bg.Filename)); err != nil && !os.IsNotExist(err) {
		slog.Warn("Failed to remove background file", "filename", bg.Filename, "err", err)
	}
	if _, err := h.Store.DeleteBackground(id); err != nil {
		writeErr(w, 500, "Failed to delete background")
		return
	}
	writeJSON(w, 200, map[string]bool{"success": true})
}
