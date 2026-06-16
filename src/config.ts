import path from 'path';

export const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  host: process.env.HOST || '0.0.0.0',

  session: {
    secret: process.env.SESSION_SECRET || 'webterm-secret-change-in-production',
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
  },

  database: {
    path: process.env.DB_PATH || path.join(process.cwd(), 'data', 'webterm.db'),
  },

  logs: {
    directory: process.env.LOG_DIR || path.join(process.cwd(), 'data', 'logs'),
  },

  auth: {
    defaultUsername: process.env.ADMIN_USER || 'admin',
    defaultPassword: process.env.ADMIN_PASS || 'admin',
  },

  terminal: {
    defaultCols: 80,
    defaultRows: 24,
  },
};
