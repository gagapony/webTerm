import { EventEmitter } from 'events';
import { logger } from '../utils/logger';

export interface LocalOptions {
  shell?: string;
  cwd?: string;
  env?: Record<string, string>;
  cols?: number;
  rows?: number;
}

export class LocalSession extends EventEmitter {
  private process: any = null;
  private connected: boolean = false;
  private cols: number = 80;
  private rows: number = 24;
  private useNodePty: boolean = false;
  private resolvedShell: string = '';

  constructor() {
    super();
  }

  getShell(): string {
    return this.resolvedShell;
  }

  spawn(options: LocalOptions = {}): void {
    // Try to find a valid shell
    let shell = options.shell || process.env.SHELL;
    if (!shell) {
      const shellPaths = ['/bin/bash', '/bin/sh', '/run/current-system/sw/bin/bash', '/usr/bin/bash'];
      for (const path of shellPaths) {
        try {
          require('fs').accessSync(path);
          shell = path;
          break;
        } catch {}
      }
    }
    shell = shell || '/bin/sh';
    this.resolvedShell = shell;

    const cwd = options.cwd || process.env.HOME || '/tmp';
    this.cols = options.cols || 80;
    this.rows = options.rows || 24;

    try {
      // Try to use node-pty for proper PTY support
      try {
        const pty = require('node-pty');
        this.process = pty.spawn(shell, [], {
          name: 'xterm-256color',
          cols: this.cols,
          rows: this.rows,
          cwd,
          env: { ...process.env, ...options.env } as Record<string, string>,
        });
        this.useNodePty = true;
        logger.info(`Local shell spawned with node-pty: ${shell} in ${cwd}`);
      } catch (e) {
        // Fallback to script command
        const { spawn } = require('child_process');
        this.process = spawn('script', ['-q', '-f', '-c', shell, '/dev/null'], {
          cwd,
          env: {
            ...process.env,
            ...options.env,
            TERM: 'xterm-256color',
            COLUMNS: String(this.cols),
            LINES: String(this.rows),
            SHELL: shell,
          },
          stdio: ['pipe', 'pipe', 'pipe'],
        });
        this.useNodePty = false;
        logger.info(`Local shell spawned with script: ${shell} in ${cwd}`);
      }

      this.connected = true;

      if (this.useNodePty) {
        this.process.onData((data: string) => {
          this.emit('data', data);
        });
        this.process.onExit(({ exitCode }: { exitCode: number }) => {
          this.connected = false;
          logger.info(`Local shell exited with code ${exitCode}`);
          this.emit('close', exitCode);
        });
      } else {
        this.process.stdout?.on('data', (data: Buffer) => {
          this.emit('data', data.toString());
        });
        this.process.stderr?.on('data', (data: Buffer) => {
          this.emit('data', data.toString());
        });
        this.process.on('exit', (code: number) => {
          this.connected = false;
          logger.info(`Local shell exited with code ${code}`);
          this.emit('close', code);
        });
        this.process.on('error', (err: Error) => {
          this.connected = false;
          logger.error('Local shell error:', err);
          this.emit('error', err);
        });
      }

      if (this.process.pid) {
        logger.info(`Local shell PID: ${this.process.pid}`);
      }
    } catch (err) {
      logger.error('Failed to spawn local shell:', err);
      throw err;
    }
  }

  write(data: string): void {
    if (this.process && this.connected) {
      if (this.useNodePty) {
        this.process.write(data);
      } else if (this.process.stdin) {
        this.process.stdin.write(data);
      }
    }
  }

  resize(cols: number, rows: number): void {
    this.cols = cols;
    this.rows = rows;

    if (this.process && this.connected) {
      if (this.useNodePty) {
        this.process.resize(cols, rows);
      }
      // Without node-pty, resize is not supported
    }
  }

  close(): void {
    if (this.process) {
      if (this.useNodePty) {
        this.process.kill();
      } else {
        this.process.kill();
      }
    }
    this.connected = false;
  }

  isConnected(): boolean {
    return this.connected;
  }
}
