import { Router, Request, Response } from 'express';
import { store } from '../services/connection-store';
import { requireAuth, handleLogin, handleLogout } from '../middleware/auth';
import { CreateConnectionDTO, UpdateConnectionDTO } from '../models/connection';
import { join } from 'path';
import { existsSync, createReadStream, readdirSync } from 'fs';
import { config } from '../config';

const router = Router();

// Auth routes
router.post('/auth/login', handleLogin);
router.post('/auth/logout', handleLogout);

// Connection routes
router.get('/connections', requireAuth, (req: Request, res: Response) => {
  const connections = store.getConnections();
  res.json(connections);
});

router.post('/connections', requireAuth, (req: Request, res: Response) => {
  const data: CreateConnectionDTO = req.body;

  if (!data.name || !data.protocol) {
    res.status(400).json({ error: 'Name and protocol required' });
    return;
  }

  const connection = store.createConnection(data);
  res.status(201).json(connection);
});

router.put('/connections/:id', requireAuth, (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  const data: UpdateConnectionDTO = req.body;

  const connection = store.updateConnection(id, data);
  if (!connection) {
    res.status(404).json({ error: 'Connection not found' });
    return;
  }

  res.json(connection);
});

router.delete('/connections/:id', requireAuth, (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  const deleted = store.deleteConnection(id);

  if (!deleted) {
    res.status(404).json({ error: 'Connection not found' });
    return;
  }

  res.json({ success: true });
});

// Session routes
router.get('/sessions', requireAuth, (req: Request, res: Response) => {
  const sessions = store.getSessions();
  res.json(sessions);
});

// Settings routes — GET is public (UI preferences, no sensitive data),
// PUT requires auth so only logged-in admin can change them.
router.get('/settings', (req: Request, res: Response) => {
  const settings = store.getSettings();
  res.json(settings || {});
});

router.put('/settings', requireAuth, (req: Request, res: Response) => {
  store.saveSettings(req.body);
  res.json({ success: true });
});

// Recording routes
router.get('/recordings', requireAuth, (req: Request, res: Response) => {
  const logDir = config.logs.directory;

  if (!existsSync(logDir)) {
    res.json([]);
    return;
  }

  try {
    const files = readdirSync(logDir).filter(f => f.endsWith('.cast'));
    const recordings = files.map(f => ({
      id: f.replace('.cast', ''),
      filename: f,
      path: join(logDir, f),
    }));

    res.json(recordings);
  } catch (err) {
    res.json([]);
  }
});

router.get('/recordings/:id/download', requireAuth, (req: Request, res: Response) => {
  const logPath = join(config.logs.directory, `${req.params.id}.cast`);

  if (!existsSync(logPath)) {
    res.status(404).json({ error: 'Recording not found' });
    return;
  }

  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', `attachment; filename="${req.params.id}.cast"`);
  createReadStream(logPath).pipe(res);
});

export default router;
