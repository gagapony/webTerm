import 'dotenv/config';
import express, { Response } from 'express';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import path from 'path';
import { config } from './config';
import { sessionMiddleware } from './middleware/session';
import { initializeDefaultUser } from './middleware/auth';
import apiRoutes from './routes/api';
import backgroundsRouter from './routes/backgrounds';
import { setupWebSocket } from './routes/ws';
import { sessionManager } from './services/session-manager';
import { logger } from './utils/logger';

async function main() {
  // Initialize Express
  const app = express();
  const server = createServer(app);

  // Trust proxy for reverse proxy support
  app.set('trust proxy', 1);

  // Middleware
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use(sessionMiddleware);

  // Static files — serve with Cache-Control: no-cache so browsers always
  // revalidate via ETag/Last-Modified. Prevents stale cached JS/HTML from
  // running old code after a deploy (e.g. the autoConnectLocal regression).
  const staticOpts = {
    etag: true,
    lastModified: true,
    maxAge: 0,
    setHeaders: (res: Response) => {
      res.setHeader('Cache-Control', 'no-cache');
    },
  };
  app.use(express.static(path.join(process.cwd(), 'public'), staticOpts));

  // API routes
  app.use('/api', apiRoutes);
  app.use('/api/backgrounds', backgroundsRouter);

  // Serve uploaded backgrounds
  app.use('/backgrounds', express.static(path.join(__dirname, '../data/backgrounds')));

  // WebSocket server
  const wss = new WebSocketServer({ server });
  setupWebSocket(wss);

  // Initialize default user
  await initializeDefaultUser();

  // Graceful shutdown
  process.on('SIGINT', () => {
    logger.info('Shutting down...');
    sessionManager.closeAllSessions();
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    logger.info('Shutting down...');
    sessionManager.closeAllSessions();
    process.exit(0);
  });

  // Start server
  server.listen(config.port, config.host, () => {
    logger.info(`WebTerm server running at http://${config.host}:${config.port}`);
  });
}

main().catch((err) => {
  logger.error('Failed to start server:', err);
  process.exit(1);
});
