import session from 'express-session';
import { config } from '../config';

declare module 'express-session' {
  interface SessionData {
    userId: number;
    username: string;
  }
}

export const sessionMiddleware = session({
  secret: config.session.secret,
  resave: true,
  saveUninitialized: true,
  cookie: {
    maxAge: config.session.maxAge,
    httpOnly: true,
    secure: 'auto', // Auto-detect based on request
    sameSite: 'lax',
    path: '/',
  },
});
