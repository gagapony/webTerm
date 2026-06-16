import { EventEmitter } from 'events';
import net from 'net';
import { logger } from '../utils/logger';

export interface TelnetOptions {
  host: string;
  port: number;
  timeout?: number;
}

export class TelnetSession extends EventEmitter {
  private socket: net.Socket | null = null;
  private connected: boolean = false;
  private buffer: string = '';

  constructor() {
    super();
  }

  async connect(options: TelnetOptions): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeout = options.timeout || 10000;

      this.socket = net.createConnection({
        host: options.host,
        port: options.port,
      });

      const timeoutId = setTimeout(() => {
        this.socket?.destroy();
        reject(new Error('Connection timeout'));
      }, timeout);

      this.socket.on('connect', () => {
        clearTimeout(timeoutId);
        this.connected = true;
        logger.info(`Telnet connected to ${options.host}:${options.port}`);

        // Send initial telnet negotiations
        this.sendNegotiation();

        resolve();
      });

      this.socket.on('data', (data: Buffer) => {
        // Process telnet protocol bytes
        const processed = this.processTelnetData(data);
        if (processed) {
          this.emit('data', processed);
        }
      });

      this.socket.on('close', () => {
        clearTimeout(timeoutId);
        this.connected = false;
        this.emit('close');
      });

      this.socket.on('error', (err) => {
        clearTimeout(timeoutId);
        this.connected = false;
        logger.error('Telnet error:', err);
        reject(err);
      });
    });
  }

  private sendNegotiation(): void {
    // Basic telnet negotiation - suppress go-ahead, echo
    if (this.socket) {
      const negotiations = Buffer.from([
        255, 251, 3,  // IAC WILL SUPPRESS-GO-AHEAD
        255, 251, 1,  // IAC WILL ECHO
        255, 253, 31, // IAC DO NAWS
      ]);
      this.socket.write(negotiations);
    }
  }

  private processTelnetData(data: Buffer): string | null {
    let result = '';
    let i = 0;

    while (i < data.length) {
      if (data[i] === 255 && i + 2 < data.length) {
        // IAC command
        const cmd = data[i + 1];
        const opt = data[i + 2];

        if (cmd === 251 || cmd === 252) {
          // WILL/WONT - respond with DO/DONT
          const response = cmd === 251
            ? Buffer.from([255, 253, opt])  // IAC DO
            : Buffer.from([255, 254, opt]);  // IAC DONT
          this.socket?.write(response);
          i += 3;
        } else if (cmd === 253 || cmd === 254) {
          // DO/DONT - respond with WILL/WONT
          const response = cmd === 253
            ? Buffer.from([255, 251, opt])  // IAC WILL
            : Buffer.from([255, 252, opt]);  // IAC WONT
          this.socket?.write(response);
          i += 3;
        } else if (cmd === 240) {
          // SE - end of subnegotiation
          i += 2;
        } else {
          i += 2;
        }
      } else if (data[i] === 255 && i + 1 < data.length && data[i + 1] === 255) {
        // Escaped IAC
        result += String.fromCharCode(255);
        i += 2;
      } else {
        result += String.fromCharCode(data[i]);
        i++;
      }
    }

    return result || null;
  }

  write(data: string): void {
    if (this.socket && this.connected) {
      this.socket.write(data);
    }
  }

  resize(cols: number, rows: number): void {
    // Send NAWS negotiation
    if (this.socket && this.connected) {
      const naws = Buffer.from([
        255, 250, 31,  // IAC SB NAWS
        (cols >> 8) & 0xff, cols & 0xff,
        (rows >> 8) & 0xff, rows & 0xff,
        255, 240,       // IAC SE
      ]);
      this.socket.write(naws);
    }
  }

  close(): void {
    if (this.socket) {
      this.socket.destroy();
    }
    this.connected = false;
  }

  isConnected(): boolean {
    return this.connected;
  }
}
