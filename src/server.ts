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

  // Static files — layered cache strategy:
  //   HTML        → no-cache            (always revalidate via ETag/Last-Modified)
  //   JS/CSS/font → 1y immutable        (URL carries ?v=N cache-buster)
  //   images      → 1y immutable        (uploads include timestamp in filename)
  //   favicon     → 1 day               (Chrome's favicon cache is quirky)
  //   default     → no-cache            (conservative)
  const STATIC_MAX_AGE = 31536000; // 1 year in seconds

  function setStaticCacheHeaders(res: Response, filePath: string): void {
    const ext = path.extname(filePath).toLowerCase();
    if (ext === '.html') {
      res.setHeader('Cache-Control', 'no-cache');
    } else if (['.js', '.css', '.otf', '.woff', '.woff2', '.ttf'].includes(ext)) {
      res.setHeader('Cache-Control', `public, max-age=${STATIC_MAX_AGE}, immutable`);
    } else if (['.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg'].includes(ext)) {
      res.setHeader('Cache-Control', `public, max-age=${STATIC_MAX_AGE}, immutable`);
    } else if (ext === '.ico') {
      res.setHeader('Cache-Control', 'public, max-age=86400');
    } else {
      res.setHeader('Cache-Control', 'no-cache');
    }
  }

  const staticOpts = {
    etag: true,
    lastModified: true,
    maxAge: 0,
    setHeaders: (res: Response, filePath: string) => {
      setStaticCacheHeaders(res, filePath);
    },
  };
  app.use(express.static(path.join(process.cwd(), 'public'), staticOpts));

  // API routes
  app.use('/api', apiRoutes);
  app.use('/api/backgrounds', backgroundsRouter);

  // Serve uploaded backgrounds (same layered cache strategy — filenames
  // include a Date.now() timestamp so immutable caching is safe).
  app.use('/backgrounds', express.static(path.join(__dirname, '../data/backgrounds'), staticOpts));

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
