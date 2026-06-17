import { v4 as uuidv4 } from 'uuid';
import { WebSocket } from 'ws';
import { SSHSession, SSHOptions } from '../protocols/ssh';
import { TelnetSession, TelnetOptions } from '../protocols/telnet';
import { LocalSession, LocalOptions } from '../protocols/local';
import { store } from './connection-store';
import { logger } from '../utils/logger';

interface ActiveSession {
  id: string;
  protocol: 'ssh' | 'telnet' | 'local';
  session: SSHSession | TelnetSession | LocalSession;
  ws: WebSocket;
  cols: number;
  rows: number;
}

class SessionManager {
  private sessions: Map<string, ActiveSession> = new Map();

  async createSession(
    ws: WebSocket,
    protocol: 'ssh' | 'telnet' | 'local',
    options: any
  ): Promise<string> {
    const sessionId = uuidv4();
    const cols = options.cols || 80;
    const rows = options.rows || 24;

    let session: SSHSession | TelnetSession | LocalSession;

    try {
      logger.info(`Creating ${protocol} session...`);

      switch (protocol) {
        case 'ssh':
          session = new SSHSession();
          await (session as SSHSession).connect(options as SSHOptions);
          break;

        case 'telnet':
          session = new TelnetSession();
          await (session as TelnetSession).connect(options as TelnetOptions);
          break;

        case 'local':
          session = new LocalSession();
          (session as LocalSession).spawn({
            ...options as LocalOptions,
            cols,
            rows,
          });
          break;

        default:
          throw new Error(`Unknown protocol: ${protocol}`);
      }

      const activeSession: ActiveSession = {
        id: sessionId,
        protocol,
        session,
        ws,
        cols,
        rows,
      };

      // Set up data handler
      session.on('data', (data: string) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({
            type: 'output',
            sessionId,
            data,
          }));
        }
      });

      // Set up close handler
      session.on('close', () => {
        this.handleSessionClose(sessionId);
      });

      // Set up error handler
      session.on('error', (err: Error) => {
        logger.error(`Session error: ${sessionId}`, err);
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({
            type: 'error',
            sessionId,
            message: err.message,
          }));
        }
      });

      this.sessions.set(sessionId, activeSession);

      // Save to database
      store.createSession({
        id: sessionId,
        protocol,
        host: options.host,
        port: options.port,
      });

      logger.info(`Session created: ${sessionId} (${protocol})`);
      return sessionId;
    } catch (err) {
      logger.error(`Failed to create session:`, err);
      // Send error to client
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          type: 'error',
          message: err instanceof Error ? err.message : 'Failed to create session',
        }));
      }
      throw err;
    }
  }

  handleInput(sessionId: string, data: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    session.session.write(data);
  }

  handleResize(sessionId: string, cols: number, rows: number): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    session.cols = cols;
    session.rows = rows;
    session.session.resize(cols, rows);
  }

  closeSession(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    // Close the session
    session.session.close();

    // Update database
    store.updateSessionStatus(sessionId, 'closed');

    this.sessions.delete(sessionId);
    logger.info(`Session closed: ${sessionId}`);
  }

  private handleSessionClose(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    // Notify client
    if (session.ws.readyState === WebSocket.OPEN) {
      session.ws.send(JSON.stringify({
        type: 'exit',
        sessionId,
      }));
    }

    // Update database
    store.updateSessionStatus(sessionId, 'closed');

    this.sessions.delete(sessionId);
    logger.info(`Session ended: ${sessionId}`);
  }

  getSession(sessionId: string): ActiveSession | undefined {
    return this.sessions.get(sessionId);
  }

  getActiveSessions(): ActiveSession[] {
    return Array.from(this.sessions.values());
  }

  closeAllSessions(): void {
    for (const [id] of this.sessions) {
      this.closeSession(id);
    }
  }

  // Clean up sessions for a disconnected WebSocket
  cleanupWebSocket(ws: WebSocket): void {
    for (const [id, session] of this.sessions) {
      if (session.ws === ws) {
        this.closeSession(id);
      }
    }
  }
}

export const sessionManager = new SessionManager();
