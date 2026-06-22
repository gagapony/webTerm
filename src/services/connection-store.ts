import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { config } from '../config';
import { Connection, CreateConnectionDTO, UpdateConnectionDTO } from '../models/connection';
import { Session, CreateSessionDTO } from '../models/session';
import { User } from '../models/user';

class ConnectionStore {
  private db: Database.Database;

  constructor() {
    const dbDir = path.dirname(config.database.path);
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }

    this.db = new Database(config.database.path);
    this.db.pragma('journal_mode = WAL');
    this.initialize();
    this.migrateRemoveLocalConnections();
  }

  private initialize(): void {
    this.db.exec(`
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
    `);
  }

  private migrateRemoveLocalConnections(): void {
    // Delete any existing local protocol connections
    this.db.prepare('DELETE FROM connections WHERE protocol = ?').run('local');

    // If the old CHECK constraint exists, rebuild the table without it.
    const tableInfo = this.db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='connections'").get() as { sql: string } | undefined;

    if (tableInfo && tableInfo.sql.includes("CHECK(protocol IN")) {
      this.db.exec(`
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
      `);
    }
  }

  // User operations
  getUser(username: string): User | undefined {
    return this.db.prepare('SELECT * FROM users WHERE username = ?').get(username) as User | undefined;
  }

  createUser(username: string, passwordHash: string): User {
    const result = this.db.prepare('INSERT INTO users (username, password_hash) VALUES (?, ?)').run(username, passwordHash);
    return this.db.prepare('SELECT * FROM users WHERE id = ?').get(result.lastInsertRowid) as User;
  }

  userCount(): number {
    return (this.db.prepare('SELECT COUNT(*) as count FROM users').get() as any).count;
  }

  // Get database instance for external use
  getDb(): Database.Database {
    return this.db;
  }

  // Connection operations
  getConnections(): Connection[] {
    return this.db.prepare('SELECT * FROM connections ORDER BY name').all() as Connection[];
  }

  getConnection(id: number): Connection | undefined {
    return this.db.prepare('SELECT * FROM connections WHERE id = ?').get(id) as Connection | undefined;
  }

  createConnection(data: CreateConnectionDTO): Connection {
    const stmt = this.db.prepare(`
      INSERT INTO connections (name, protocol, host, port, username, password_encrypted, ssh_key_path, ssh_key_passphrase, options)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      data.name,
      data.protocol,
      data.host || null,
      data.port || null,
      data.username || null,
      data.password || null,
      data.ssh_key_path || null,
      data.ssh_key_passphrase || null,
      data.options ? JSON.stringify(data.options) : null
    );

    return this.getConnection(result.lastInsertRowid as number)!;
  }

  updateConnection(id: number, data: UpdateConnectionDTO): Connection | undefined {
    const existing = this.getConnection(id);
    if (!existing) return undefined;

    const stmt = this.db.prepare(`
      UPDATE connections
      SET name = COALESCE(?, name),
          host = COALESCE(?, host),
          port = COALESCE(?, port),
          username = COALESCE(?, username),
          password_encrypted = COALESCE(?, password_encrypted),
          ssh_key_path = COALESCE(?, ssh_key_path),
          ssh_key_passphrase = COALESCE(?, ssh_key_passphrase),
          options = COALESCE(?, options),
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);

    stmt.run(
      data.name || null,
      data.host || null,
      data.port || null,
      data.username || null,
      data.password || null,
      data.ssh_key_path || null,
      data.ssh_key_passphrase || null,
      data.options ? JSON.stringify(data.options) : null,
      id
    );

    return this.getConnection(id);
  }

  deleteConnection(id: number): boolean {
    const result = this.db.prepare('DELETE FROM connections WHERE id = ?').run(id);
    return result.changes > 0;
  }

  // Session operations
  getSessions(): Session[] {
    return this.db.prepare('SELECT * FROM sessions ORDER BY started_at DESC').all() as Session[];
  }

  getActiveSessions(): Session[] {
    return this.db.prepare('SELECT * FROM sessions WHERE status = ? ORDER BY started_at DESC').all('active') as Session[];
  }

  getSession(id: string): Session | undefined {
    return this.db.prepare('SELECT * FROM sessions WHERE id = ?').get(id) as Session | undefined;
  }

  createSession(data: CreateSessionDTO): Session {
    const stmt = this.db.prepare(`
      INSERT INTO sessions (id, connection_id, protocol, host, port, status)
      VALUES (?, ?, ?, ?, ?, 'active')
    `);

    stmt.run(
      data.id,
      data.connection_id || null,
      data.protocol,
      data.host || null,
      data.port || null
    );

    return this.getSession(data.id)!;
  }

  updateSessionStatus(id: string, status: string, logPath?: string): void {
    const stmt = this.db.prepare(`
      UPDATE sessions
      SET status = ?, ended_at = CURRENT_TIMESTAMP, log_path = COALESCE(?, log_path)
      WHERE id = ?
    `);

    stmt.run(status, logPath || null, id);
  }

  close(): void {
    this.db.close();
  }
}

export const store = new ConnectionStore();
