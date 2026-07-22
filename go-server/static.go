package main

import (
	"embed"
	"io"
	"io/fs"
	"net/http"
	"os"
	"path"
	"path/filepath"
	"strings"
	"time"
)

//go:embed public
var publicFS embed.FS

var serverStartTime = time.Now()

// cacheControlFor 逐字对齐 Node 版 setStaticCacheHeaders 的分层缓存策略。
func cacheControlFor(p string) string {
	ext := strings.ToLower(path.Ext(p))
	base := strings.ToLower(path.Base(p))
	switch {
	case ext == ".html":
		return "no-cache"
	case ext == ".ico" || strings.HasPrefix(base, "favicon") || base == "apple-touch-icon.png":
		return "public, max-age=86400"
	case strings.Contains(",.js,.css,.otf,.woff,.woff2,.ttf,", ","+ext+","):
		return "public, max-age=31536000, immutable"
	case strings.Contains(",.png,.jpg,.jpeg,.webp,.gif,.svg,", ","+ext+","):
		return "public, max-age=31536000, immutable"
	default:
		return "no-cache"
	}
}

// serveFS 以 Cache-Control + Last-Modified 提供文件服务。
// embed 文件无 modtime，用进程启动时间代替（保证运行期内 If-Modified-Since 可再验证）。
func serveFS(fsys fs.FS, w http.ResponseWriter, r *http.Request, name string) {
	f, err := fsys.Open(name)
	if err != nil {
		http.NotFound(w, r)
		return
	}
	defer f.Close()
	st, err := f.Stat()
	if err != nil || st.IsDir() {
		http.NotFound(w, r)
		return
	}
	rs, ok := f.(io.ReadSeeker)
	if !ok {
		http.NotFound(w, r)
		return
	}
	w.Header().Set("Cache-Control", cacheControlFor(name))
	http.ServeContent(w, r, st.Name(), serverStartTime, rs)
}

// ---- embed 静态（public/） ----

type embedStaticHandler struct {
	sub fs.FS
}

func newStaticHandler() http.Handler {
	sub, err := fs.Sub(publicFS, "public")
	if err != nil {
		panic(err)
	}
	return &embedStaticHandler{sub: sub}
}

func (h *embedStaticHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	p := path.Clean("/" + r.URL.Path)
	if p == "/" {
		p = "/index.html"
	}
	serveFS(h.sub, w, r, strings.TrimPrefix(p, "/"))
}

// ---- 磁盘静态（data/backgrounds/） ----

type dirFS struct{ dir string }

func (d dirFS) Open(name string) (fs.File, error) {
	return os.Open(filepath.Join(d.dir, name))
}

type diskStaticHandler struct {
	sub fs.FS
}

func newDiskStaticHandler(dir string) http.Handler {
	return &diskStaticHandler{sub: dirFS{dir: dir}}
}

func (h *diskStaticHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	p := path.Clean("/" + r.URL.Path)
	name := strings.TrimPrefix(p, "/")
	if strings.Contains(name, "..") {
		http.NotFound(w, r)
		return
	}
	serveFS(h.sub, w, r, name)
}

// ---- WS upgrade 检测 ----

func isWSUpgrade(r *http.Request) bool {
	return strings.EqualFold(r.Header.Get("Upgrade"), "websocket") &&
		strings.Contains(strings.ToLower(r.Header.Get("Connection")), "upgrade")
}
