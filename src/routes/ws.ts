import { WebSocket, WebSocketServer } from 'ws';
import { IncomingMessage } from 'http';
import { sessionManager } from '../services/session-manager';
import { logger } from '../utils/logger';

interface WSMessage {
  type: string;
  sessionId?: string;
  data?: string;
  cols?: number;
  rows?: number;
  protocol?: 'ssh' | 'telnet';
  host?: string;
  port?: number;
  username?: string;
  password?: string;
}

export function setupWebSocket(wss: WebSocketServer): void {
  wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
    logger.info('WebSocket client connected');

    ws.on('message', async (raw: Buffer) => {
      try {
        const message: WSMessage = JSON.parse(raw.toString());
        await handleMessage(ws, message);
      } catch (err) {
        logger.error('WebSocket message error:', err);
        ws.send(JSON.stringify({
          type: 'error',
          message: err instanceof Error ? err.message : 'Unknown error',
        }));
      }
    });

    ws.on('close', () => {
      logger.info('WebSocket client disconnected');
      sessionManager.cleanupWebSocket(ws);
    });

    ws.on('error', (err) => {
      logger.error('WebSocket error:', err);
    });
  });
}

async function handleMessage(ws: WebSocket, message: WSMessage): Promise<void> {
  logger.info('Received WebSocket message:', message.type);

  switch (message.type) {
    case 'create': {
      if (!message.protocol) {
        ws.send(JSON.stringify({
          type: 'error',
          message: 'Protocol required',
        }));
        return;
      }

      try {
        const result = await sessionManager.createSession(ws, message.protocol, {
          host: message.host,
          port: message.port,
          username: message.username,
          password: message.password,
          cols: message.cols || 80,
          rows: message.rows || 24,
        });

        ws.send(JSON.stringify({
          type: 'created',
          sessionId: result.sessionId,
          protocol: message.protocol,
        }));
      } catch (err) {
        ws.send(JSON.stringify({
          type: 'error',
          message: err instanceof Error ? err.message : 'Connection failed',
        }));
      }
      break;
    }

    case 'input': {
      if (!message.sessionId || !message.data) return;
      sessionManager.handleInput(message.sessionId, message.data);
      break;
    }

    case 'resize': {
      if (!message.sessionId || !message.cols || !message.rows) return;
      sessionManager.handleResize(message.sessionId, message.cols, message.rows);
      break;
    }

    case 'close': {
      if (!message.sessionId) return;
      sessionManager.closeSession(message.sessionId);
      break;
    }

    default:
      logger.warn(`Unknown message type: ${message.type}`);
  }
}
