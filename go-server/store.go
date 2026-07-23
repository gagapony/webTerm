package main

import (
	"database/sql"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"strings"

	_ "modernc.org/sqlite"
)

type Store struct {
	db *sql.DB
}

type User struct {
	ID           int64
	Username     string
	PasswordHash string
}

type Connection struct {
	ID                int64   `json:"id"`
	Name              string  `json:"name"`
	Protocol          string  `json:"protocol"`
	Host              *string `json:"host"`
	Port              *int64  `json:"port"`
	Username          *string `json:"username"`
	PasswordEncrypted *string `json:"password_encrypted"`
	SSHKeyPath        *string `json:"ssh_key_path"`
	SSHKeyPassphrase  *string `json:"ssh_key_passphrase"`
	Options           *string `json:"options"`
	Description       *string `json:"description"`
	Color             *string `json:"color"`
	CreatedAt         string  `json:"created_at"`
	UpdatedAt         string  `json:"updated_at"`
}

// ConnectionInput 对齐 Node 的 CreateConnectionDTO/UpdateConnectionDTO。
type ConnectionInput struct {
	Name             string
	Protocol         string
	Host             string
	Port             *int64
	Username         string
	Password         string
	SSHKeyPath       string
	SSHKeyPassphrase string
	Options          json.RawMessage
	Description      string
	Color            string
}

type Session struct {
	ID           string  `json:"id"`
	ConnectionID *int64  `json:"connection_id"`
	Protocol     string  `json:"protocol"`
	Host         *string `json:"host"`
	Port         *int64  `json:"port"`
	StartedAt    string  `json:"started_at"`
	EndedAt      *string `json:"ended_at"`
	LogPath      *string `json:"log_path"`
	Status       *string `json:"status"`
}

type Background struct {
	ID           int64   `json:"id"`
	Filename     string  `json:"filename"`
	OriginalName *string `json:"original_name"`
	MimeType     *string `json:"mime_type"`
	Size         *int64  `json:"size"`
	CreatedAt    string  `json:"created_at"`
}

func NewStore(path string) (*Store, error) {
	if dir := filepath.Dir(path); dir != "" {
		if err := os.MkdirAll(dir, 0o755); err != nil {
			return nil, err
		}
	}
	db, err := sql.Open("sqlite", path)
	if err != nil {
		return nil, err
	}
	// 单写多读的本地应用，避免 database is locked
	db.SetMaxOpenConns(1)
	if _, err := db.Exec("PRAGMA journal_mode=WAL"); err != nil {
		db.Close()
		return nil, err
	}
	s := &Store{db: db}
	if err := s.migrate(); err != nil {
		db.Close()
		return nil, err
	}
	return s, nil
}

func (s *Store) Close() { s.db.Close() }

func (s *Store) migrate() error {
	_, err := s.db.Exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS connections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  protocol TEXT NOT NULL,
  host TEXT,
  port INTEGER,
  username TEXT,
  password_encrypted TEXT,
  ssh_key_path TEXT,
  ssh_key_passphrase TEXT,
  options TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  connection_id INTEGER REFERENCES connections(id),
  protocol TEXT NOT NULL,
  host TEXT,
  port INTEGER,
  started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  ended_at DATETIME,
  log_path TEXT,
  status TEXT CHECK(status IN ('active', 'closed', 'error'))
);
CREATE INDEX IF NOT EXISTS idx_sessions_connection ON sessions(connection_id);
CREATE INDEX IF NOT EXISTS idx_sessions_started ON sessions(started_at);
CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS backgrounds (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  filename TEXT NOT NULL,
  original_name TEXT,
  mime_type TEXT,
  size INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
`)
	if err != nil {
		return err
	}

	// Node 版迁移：删除 local 协议连接
	if _, err := s.db.Exec(`DELETE FROM connections WHERE protocol = 'local'`); err != nil {
		return err
	}
	// Node 版迁移：若旧 CHECK(protocol IN ...) 约束存在则重建表
	var sqlText string
	err = s.db.QueryRow(`SELECT sql FROM sqlite_master WHERE type='table' AND name='connections'`).Scan(&sqlText)
	if err != nil {
		return err
	}
	if strings.Contains(sqlText, "CHECK(protocol IN") {
		_, err = s.db.Exec(`
CREATE TABLE IF NOT EXISTS connections_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  protocol TEXT NOT NULL,
  host TEXT,
  port INTEGER,
  username TEXT,
  password_encrypted TEXT,
  ssh_key_path TEXT,
  ssh_key_passphrase TEXT,
  options TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO connections_new SELECT * FROM connections;
DROP TABLE connections;
ALTER TABLE connections_new RENAME TO connections;
`)
	}
	if err != nil {
		return err
	}

	// New columns for Connection Management UI (description/color).
	// Idempotent: only add if missing.
	if hasColumn, err := columnExists(s.db, "connections", "description"); err != nil {
		return err
	} else if !hasColumn {
		if _, err := s.db.Exec(`ALTER TABLE connections ADD COLUMN description TEXT`); err != nil {
			return err
		}
	}
	if hasColumn, err := columnExists(s.db, "connections", "color"); err != nil {
		return err
	} else if !hasColumn {
		if _, err := s.db.Exec(`ALTER TABLE connections ADD COLUMN color TEXT`); err != nil {
			return err
		}
	}
	return nil
}

// columnExists checks whether the given table has the given column. Used for
// idempotent ALTER TABLE migrations.
func columnExists(db *sql.DB, table, column string) (bool, error) {
	rows, err := db.Query(`PRAGMA table_info(` + table + `)`)
	if err != nil {
		return false, err
	}
	defer rows.Close()
	for rows.Next() {
		var cid int
		var name, ctype string
		var notnull int
		var dflt sql.NullString
		var pk int
		if err := rows.Scan(&cid, &name, &ctype, &notnull, &dflt, &pk); err != nil {
			return false, err
		}
		if name == column {
			return true, nil
		}
	}
	return false, rows.Err()
}

// ---- Users ----

func (s *Store) GetUser(username string) (*User, error) {
	var u User
	err := s.db.QueryRow(`SELECT id, username, password_hash FROM users WHERE username = ?`, username).
		Scan(&u.ID, &u.Username, &u.PasswordHash)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	return &u, err
}

func (s *Store) CreateUser(username, hash string) error {
	_, err := s.db.Exec(`INSERT INTO users (username, password_hash) VALUES (?, ?)`, username, hash)
	return err
}

func (s *Store) UpdateUserPassword(id int64, hash string) {
	s.db.Exec(`UPDATE users SET password_hash = ? WHERE id = ?`, hash, id)
}

func (s *Store) UserCount() int {
	var n int
	s.db.QueryRow(`SELECT COUNT(*) FROM users`).Scan(&n)
	return n
}

// ---- Connections ----

// datetime 列 CAST AS TEXT：避免 modernc.org/sqlite 扫成 time.Time，保持与 Node 版相同的 JSON 字符串格式。
const connectionCols = `id, name, protocol, host, port, username, password_encrypted, ssh_key_path, ssh_key_passphrase, options, description, color, CAST(created_at AS TEXT) AS created_at, CAST(updated_at AS TEXT) AS updated_at`

func scanConnection(row interface{ Scan(...any) error }) (*Connection, error) {
	var c Connection
	err := row.Scan(&c.ID, &c.Name, &c.Protocol, &c.Host, &c.Port, &c.Username,
		&c.PasswordEncrypted, &c.SSHKeyPath, &c.SSHKeyPassphrase, &c.Options,
		&c.Description, &c.Color,
		&c.CreatedAt, &c.UpdatedAt)
	return &c, err
}

func (s *Store) GetConnections() ([]Connection, error) {
	rows, err := s.db.Query(`SELECT ` + connectionCols + ` FROM connections ORDER BY name ASC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Connection{}
	for rows.Next() {
		c, err := scanConnection(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, *c)
	}
	return out, rows.Err()
}

func (s *Store) GetConnection(id int64) (*Connection, error) {
	c, err := scanConnection(s.db.QueryRow(`SELECT `+connectionCols+` FROM connections WHERE id = ?`, id))
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	return c, err
}

func nullIfEmpty(v string) any {
	if v == "" {
		return nil
	}
	return v
}

func nullIfEmptyJSON(v json.RawMessage) any {
	if len(v) == 0 {
		return nil
	}
	return string(v)
}

func (s *Store) CreateConnection(in ConnectionInput) (*Connection, error) {
	res, err := s.db.Exec(`
INSERT INTO connections (name, protocol, host, port, username, password_encrypted, ssh_key_path, ssh_key_passphrase, options, description, color)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		in.Name, in.Protocol, nullIfEmpty(in.Host), in.Port, nullIfEmpty(in.Username),
		nullIfEmpty(in.Password), nullIfEmpty(in.SSHKeyPath), nullIfEmpty(in.SSHKeyPassphrase),
		nullIfEmptyJSON(in.Options), nullIfEmpty(in.Description), nullIfEmpty(in.Color))
	if err != nil {
		return nil, err
	}
	id, _ := res.LastInsertId()
	return s.GetConnection(id)
}

func (s *Store) UpdateConnection(id int64, in ConnectionInput) (*Connection, error) {
	existing, err := s.GetConnection(id)
	if err != nil || existing == nil {
		return nil, err
	}
	// COALESCE pattern: NULL means "preserve existing" for nullable fields.
	desc := nullIfEmpty(in.Description)
	col := nullIfEmpty(in.Color)
	_, err = s.db.Exec(`
UPDATE connections
SET name = COALESCE(?, name),
    host = COALESCE(?, host),
    port = COALESCE(?, port),
    username = COALESCE(?, username),
    password_encrypted = COALESCE(?, password_encrypted),
    ssh_key_path = COALESCE(?, ssh_key_path),
    ssh_key_passphrase = COALESCE(?, ssh_key_passphrase),
    options = COALESCE(?, options),
    description = COALESCE(?, description),
    color = COALESCE(?, color),
    updated_at = CURRENT_TIMESTAMP
WHERE id = ?`,
		nullIfEmpty(in.Name), nullIfEmpty(in.Host), in.Port, nullIfEmpty(in.Username),
		nullIfEmpty(in.Password), nullIfEmpty(in.SSHKeyPath), nullIfEmpty(in.SSHKeyPassphrase),
		nullIfEmptyJSON(in.Options), desc, col, id)
	if err != nil {
		return nil, err
	}
	return s.GetConnection(id)
}

func (s *Store) DeleteConnection(id int64) (bool, error) {
	res, err := s.db.Exec(`DELETE FROM connections WHERE id = ?`, id)
	if err != nil {
		return false, err
	}
	n, _ := res.RowsAffected()
	return n > 0, nil
}

// ---- Sessions ----

const sessionCols = `id, connection_id, protocol, host, port, CAST(started_at AS TEXT) AS started_at, CAST(ended_at AS TEXT) AS ended_at, log_path, status`

func (s *Store) GetSessions() ([]Session, error) {
	rows, err := s.db.Query(`SELECT ` + sessionCols + ` FROM sessions ORDER BY started_at DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Session{}
	for rows.Next() {
		var sess Session
		if err := rows.Scan(&sess.ID, &sess.ConnectionID, &sess.Protocol, &sess.Host, &sess.Port,
			&sess.StartedAt, &sess.EndedAt, &sess.LogPath, &sess.Status); err != nil {
			return nil, err
		}
		out = append(out, sess)
	}
	return out, rows.Err()
}

func (s *Store) CreateSession(id, protocol string, host string, port *int64) error {
	_, err := s.db.Exec(`
INSERT INTO sessions (id, connection_id, protocol, host, port, status)
VALUES (?, NULL, ?, ?, ?, 'active')`, id, protocol, nullIfEmpty(host), port)
	return err
}

func (s *Store) UpdateSessionStatus(id, status string) error {
	_, err := s.db.Exec(`
UPDATE sessions SET status = ?, ended_at = CURRENT_TIMESTAMP WHERE id = ?`, status, id)
	return err
}

// ---- Settings ----

func (s *Store) GetSettings() (json.RawMessage, error) {
	var v string
	err := s.db.QueryRow(`SELECT value FROM settings WHERE key = 'app'`).Scan(&v)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return json.RawMessage(v), nil
}

func (s *Store) SaveSettings(v json.RawMessage) error {
	_, err := s.db.Exec(`
INSERT INTO settings (key, value, updated_at) VALUES ('app', ?, CURRENT_TIMESTAMP)
ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP`, string(v))
	return err
}

// ---- Backgrounds ----

const backgroundCols = `id, filename, original_name, mime_type, size, CAST(created_at AS TEXT) AS created_at`

func scanBackground(row interface{ Scan(...any) error }) (*Background, error) {
	var b Background
	err := row.Scan(&b.ID, &b.Filename, &b.OriginalName, &b.MimeType, &b.Size, &b.CreatedAt)
	return &b, err
}

func (s *Store) ListBackgrounds() ([]Background, error) {
	rows, err := s.db.Query(`SELECT ` + backgroundCols + ` FROM backgrounds ORDER BY created_at DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Background{}
	for rows.Next() {
		b, err := scanBackground(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, *b)
	}
	return out, rows.Err()
}

func (s *Store) CreateBackground(filename, origName, mime string, size int64) (int64, error) {
	res, err := s.db.Exec(`
INSERT INTO backgrounds (filename, original_name, mime_type, size) VALUES (?, ?, ?, ?)`,
		filename, origName, mime, size)
	if err != nil {
		return 0, err
	}
	return res.LastInsertId()
}

func (s *Store) GetBackground(id int64) (*Background, error) {
	b, err := scanBackground(s.db.QueryRow(`SELECT `+backgroundCols+` FROM backgrounds WHERE id = ?`, id))
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	return b, err
}

func (s *Store) DeleteBackground(id int64) (bool, error) {
	res, err := s.db.Exec(`DELETE FROM backgrounds WHERE id = ?`, id)
	if err != nil {
		return false, err
	}
	n, _ := res.RowsAffected()
	return n > 0, nil
}
