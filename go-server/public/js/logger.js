// WebTerm Logger - configurable log levels for frontend

const LOG_LEVELS = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
  NONE: 4
};

class Logger {
  constructor() {
    // Default to DEBUG in development, INFO in production
    this.level = LOG_LEVELS.DEBUG;
    this.prefix = '[WebTerm]';
  }

  setLevel(level) {
    if (typeof level === 'string') {
      this.level = LOG_LEVELS[level.toUpperCase()] || LOG_LEVELS.DEBUG;
    } else {
      this.level = level;
    }
  }

  _log(level, levelName, ...args) {
    if (level < this.level) return;

    const timestamp = new Date().toISOString().substring(11, 23);
    const prefix = `${this.prefix}[${timestamp}][${levelName}]`;

    switch (levelName) {
      case 'DEBUG':
        console.debug(prefix, ...args);
        break;
      case 'INFO':
        console.info(prefix, ...args);
        break;
      case 'WARN':
        console.warn(prefix, ...args);
        break;
      case 'ERROR':
        console.error(prefix, ...args);
        break;
    }
  }

  debug(...args) {
    this._log(LOG_LEVELS.DEBUG, 'DEBUG', ...args);
  }

  info(...args) {
    this._log(LOG_LEVELS.INFO, 'INFO', ...args);
  }

  warn(...args) {
    this._log(LOG_LEVELS.WARN, 'WARN', ...args);
  }

  error(...args) {
    this._log(LOG_LEVELS.ERROR, 'ERROR', ...args);
  }
}

// Global logger instance
window.logger = new Logger();
