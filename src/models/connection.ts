export type Protocol = 'ssh' | 'telnet' | 'local';

export interface Connection {
  id: number;
  name: string;
  protocol: Protocol;
  host: string | null;
  port: number | null;
  username: string | null;
  password_encrypted: string | null;
  ssh_key_path: string | null;
  ssh_key_passphrase: string | null;
  options: string | null; // JSON string
  created_at: string;
  updated_at: string;
}

export interface CreateConnectionDTO {
  name: string;
  protocol: Protocol;
  host?: string;
  port?: number;
  username?: string;
  password?: string;
  ssh_key_path?: string;
  ssh_key_passphrase?: string;
  options?: Record<string, any>;
}

export interface UpdateConnectionDTO {
  name?: string;
  host?: string;
  port?: number;
  username?: string;
  password?: string;
  ssh_key_path?: string;
  ssh_key_passphrase?: string;
  options?: Record<string, any>;
}
