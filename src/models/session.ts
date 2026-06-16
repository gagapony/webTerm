export type SessionStatus = 'active' | 'closed' | 'error';

export interface Session {
  id: string;
  connection_id: number | null;
  protocol: string;
  host: string | null;
  port: number | null;
  started_at: string;
  ended_at: string | null;
  log_path: string | null;
  status: SessionStatus;
}

export interface CreateSessionDTO {
  id: string;
  connection_id?: number;
  protocol: string;
  host?: string;
  port?: number;
}
