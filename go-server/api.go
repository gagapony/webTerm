package main

import (
	"encoding/json"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
)

type API struct {
	Store *Store
	Cfg   Config
}

func decodeConnectionInput(r *http.Request) (ConnectionInput, error) {
	var body struct {
		Name             string          `json:"name"`
		Protocol         string          `json:"protocol"`
		Host             string          `json:"host"`
		Port             *int64          `json:"port"`
		Username         string          `json:"username"`
		Password         string          `json:"password"`
		SSHKeyPath       string          `json:"ssh_key_path"`
		SSHKeyPassphrase string          `json:"ssh_key_passphrase"`
		Options          json.RawMessage `json:"options"`
	}
	err := json.NewDecoder(r.Body).Decode(&body)
	return ConnectionInput{
		Name: body.Name, Protocol: body.Protocol, Host: body.Host, Port: body.Port,
		Username: body.Username, Password: body.Password,
		SSHKeyPath: body.SSHKeyPath, SSHKeyPassphrase: body.SSHKeyPassphrase,
		Options: body.Options,
	}, err
}

func (a *API) ListConnections(w http.ResponseWriter, r *http.Request) {
	list, err := a.Store.GetConnections()
	if err != nil {
		writeErr(w, 500, "Internal error")
		return
	}
	writeJSON(w, 200, list)
}

func (a *API) CreateConnection(w http.ResponseWriter, r *http.Request) {
	in, err := decodeConnectionInput(r)
	if err != nil {
		writeErr(w, 400, "Invalid JSON")
		return
	}
	if in.Name == "" || in.Protocol == "" {
		writeErr(w, 400, "Name and protocol required")
		return
	}
	c, err := a.Store.CreateConnection(in)
	if err != nil {
		writeErr(w, 500, "Internal error")
		return
	}
	writeJSON(w, 201, c)
}

func (a *API) UpdateConnection(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil {
		writeErr(w, 404, "Connection not found")
		return
	}
	in, err := decodeConnectionInput(r)
	if err != nil {
		writeErr(w, 400, "Invalid JSON")
		return
	}
	c, err := a.Store.UpdateConnection(id, in)
	if err != nil {
		writeErr(w, 500, "Internal error")
		return
	}
	if c == nil {
		writeErr(w, 404, "Connection not found")
		return
	}
	writeJSON(w, 200, c)
}

func (a *API) DeleteConnection(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil {
		writeErr(w, 404, "Connection not found")
		return
	}
	ok, err := a.Store.DeleteConnection(id)
	if err != nil {
		writeErr(w, 500, "Internal error")
		return
	}
	if !ok {
		writeErr(w, 404, "Connection not found")
		return
	}
	writeJSON(w, 200, map[string]bool{"success": true})
}

func (a *API) ListSessions(w http.ResponseWriter, r *http.Request) {
	list, err := a.Store.GetSessions()
	if err != nil {
		writeErr(w, 500, "Internal error")
		return
	}
	writeJSON(w, 200, list)
}

func (a *API) GetSettings(w http.ResponseWriter, r *http.Request) {
	v, err := a.Store.GetSettings()
	if err != nil {
		writeErr(w, 500, "Internal error")
		return
	}
	if v == nil {
		v = json.RawMessage(`{}`)
	}
	w.Header().Set("Content-Type", "application/json")
	w.Write(v)
}

func (a *API) PutSettings(w http.ResponseWriter, r *http.Request) {
	var v json.RawMessage
	if err := json.NewDecoder(r.Body).Decode(&v); err != nil {
		writeErr(w, 400, "Invalid JSON")
		return
	}
	if err := a.Store.SaveSettings(v); err != nil {
		writeErr(w, 500, "Internal error")
		return
	}
	writeJSON(w, 200, map[string]bool{"success": true})
}

type recordingInfo struct {
	ID       string `json:"id"`
	Filename string `json:"filename"`
	Path     string `json:"path"`
}

func (a *API) ListRecordings(w http.ResponseWriter, r *http.Request) {
	entries, err := os.ReadDir(a.Cfg.LogDir)
	if err != nil {
		writeJSON(w, 200, []recordingInfo{})
		return
	}
	out := []recordingInfo{}
	for _, e := range entries {
		if e.IsDir() || !strings.HasSuffix(e.Name(), ".cast") {
			continue
		}
		out = append(out, recordingInfo{
			ID:       strings.TrimSuffix(e.Name(), ".cast"),
			Filename: e.Name(),
			Path:     filepath.Join(a.Cfg.LogDir, e.Name()),
		})
	}
	writeJSON(w, 200, out)
}

func (a *API) DownloadRecording(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	// 安全偏差（设计已批准）：拒绝路径穿越
	if id == "" || strings.ContainsAny(id, "/\\") || strings.Contains(id, "..") {
		writeErr(w, 400, "Invalid recording id")
		return
	}
	p := filepath.Join(a.Cfg.LogDir, id+".cast")
	if _, err := os.Stat(p); err != nil {
		writeErr(w, 404, "Recording not found")
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Content-Disposition", `attachment; filename="`+id+`.cast"`)
	http.ServeFile(w, r, p)
}
