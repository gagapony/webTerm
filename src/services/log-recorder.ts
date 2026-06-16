import { createWriteStream, WriteStream, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import { config } from '../config';
import { logger } from '../utils/logger';

interface CastHeader {
  version: 2;
  width: number;
  height: number;
  timestamp: number;
}

export class LogRecorder {
  private stream: WriteStream | null = null;
  private startTime: number = 0;
  private sessionId: string = '';
  private active: boolean = false;

  start(sessionId: string, cols: number, rows: number): void {
    if (this.active) {
      this.stop();
    }

    this.sessionId = sessionId;
    this.startTime = Date.now();

    // Ensure log directory exists
    const logDir = config.logs.directory;
    if (!existsSync(logDir)) {
      mkdirSync(logDir, { recursive: true });
    }

    const logPath = join(logDir, `${sessionId}.cast`);

    // Write asciinema v2 header
    const header: CastHeader = {
      version: 2,
      width: cols,
      height: rows,
      timestamp: Math.floor(this.startTime / 1000),
    };

    this.stream = createWriteStream(logPath);
    this.stream.write(JSON.stringify(header) + '\n');
    this.active = true;

    logger.debug(`Log recording started: ${logPath}`);
  }

  writeOutput(data: string): void {
    if (!this.active || !this.stream) return;

    const timestamp = (Date.now() - this.startTime) / 1000;
    const event = JSON.stringify([timestamp, 'o', data]);
    this.stream.write(event + '\n');
  }

  writeInput(data: string): void {
    if (!this.active || !this.stream) return;

    const timestamp = (Date.now() - this.startTime) / 1000;
    const event = JSON.stringify([timestamp, 'i', data]);
    this.stream.write(event + '\n');
  }

  stop(): string {
    if (!this.active) {
      return '';
    }

    this.active = false;
    if (this.stream) {
      this.stream.end();
      this.stream = null;
    }

    const logPath = join(config.logs.directory, `${this.sessionId}.cast`);
    logger.debug(`Log recording stopped: ${logPath}`);
    return logPath;
  }

  isActive(): boolean {
    return this.active;
  }
}
