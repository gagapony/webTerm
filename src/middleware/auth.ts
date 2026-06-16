import { Request, Response, NextFunction } from 'express';
import { store } from '../services/connection-store';
import { hashPassword, comparePassword } from '../utils/crypto';
import { config } from '../config';
import { logger } from '../utils/logger';

// Extend Express Session
declare module 'express-session' {
  interface SessionData {
    userId: number;
    username: string;
  }
}

export async function initializeDefaultUser(): Promise<void> {
  const userCount = store.userCount();
  if (userCount === 0) {
    const hash = await hashPassword(config.auth.defaultPassword);
    store.createUser(config.auth.defaultUsername, hash);
    logger.info(`Default user created: ${config.auth.defaultUsername}`);
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (req.session && req.session.userId) {
    next();
  } else {
    res.status(401).json({ error: 'Authentication required' });
  }
}

export async function handleLogin(req: Request, res: Response): Promise<void> {
  const { username, password } = req.body;

  logger.info(`Login attempt for user: ${username}`);

  if (!username || !password) {
    res.status(400).json({ error: 'Username and password required' });
    return;
  }

  const user = store.getUser(username);
  if (!user) {
    logger.warn(`Login failed: user not found - ${username}`);
    res.status(401).json({ error: 'Invalid credentials' });
    return;
  }

  const valid = await comparePassword(password, user.password_hash);
  if (!valid) {
    logger.warn(`Login failed: invalid password - ${username}`);
    res.status(401).json({ error: 'Invalid credentials' });
    return;
  }

  req.session.userId = user.id;
  req.session.username = user.username;

  logger.info(`User logged in successfully: ${username}`);
  res.json({ success: true, username: user.username });
}

export function handleLogout(req: Request, res: Response): void {
  const username = req.session.username;
  req.session.destroy((err) => {
    if (err) {
      logger.error('Logout error:', err);
      res.status(500).json({ error: 'Logout failed' });
      return;
    }
    logger.info(`User logged out: ${username}`);
    res.json({ success: true });
  });
}
