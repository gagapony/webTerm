import { Client, ClientChannel, ConnectConfig } from 'ssh2';
import { EventEmitter } from 'events';
import { logger } from '../utils/logger';

export interface SSHOptions {
  host: string;
  port: number;
  username: string;
  password?: string;
  privateKey?: string;
  passphrase?: string;
  cols?: number;
  rows?: number;
}

export class SSHSession extends EventEmitter {
  private client: Client;
  private stream: ClientChannel | null = null;
  private connected: boolean = false;

  constructor() {
    super();
    this.client = new Client();
  }

  async connect(options: SSHOptions): Promise<void> {
    return new Promise((resolve, reject) => {
      const config: ConnectConfig = {
        host: options.host,
        port: options.port,
        username: options.username,
        readyTimeout: 10000,
        keepaliveInterval: 10000,
      };

      if (options.password) {
        config.password = options.password;
      }

      if (options.privateKey) {
        config.privateKey = options.privateKey;
        if (options.passphrase) {
          config.passphrase = options.passphrase;
        }
      }

      this.client.on('ready', () => {
        logger.info(`SSH connected to ${options.host}:${options.port}`);

        this.client.shell(
          {
            term: 'xterm-256color',
            cols: options.cols || 80,
            rows: options.rows || 24,
          },
          (err, stream) => {
            if (err) {
              logger.error('SSH shell error:', err);
              reject(err);
              return;
            }

            this.stream = stream;
            this.connected = true;

            stream.on('data', (data: Buffer) => {
              this.emit('data', data.toString());
            });

            stream.on('close', () => {
              this.connected = false;
              this.emit('close');
            });

            stream.stderr.on('data', (data: Buffer) => {
              this.emit('data', data.toString());
            });

            resolve();
          }
        );
      });

      this.client.on('error', (err) => {
        logger.error('SSH client error:', err);
        this.connected = false;
        reject(err);
      });

      this.client.on('end', () => {
        this.connected = false;
        this.emit('close');
      });

      this.client.connect(config);
    });
  }

  write(data: string): void {
    if (this.stream && this.connected) {
      this.stream.write(data);
    }
  }

  resize(cols: number, rows: number): void {
    if (this.stream && this.connected) {
      this.stream.setWindow(rows, cols, 0, 0);
    }
  }

  close(): void {
    if (this.stream) {
      this.stream.close();
    }
    this.client.end();
    this.connected = false;
  }

  isConnected(): boolean {
    return this.connected;
  }
}
