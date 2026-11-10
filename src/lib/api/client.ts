import type { FramesPage, FramesQuery, GatewaySnapshot, SessionSummary } from './types';

export interface ApiConfig {
  /** Path prefix of the API root, e.g. "/wind-v2" (dev proxy) or "" */
  base: string;
  token: string;
}

export class ApiError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
  get isAuth(): boolean {
    return this.status === 401 || this.status === 403;
  }
}

/** FastAPI returns `detail` either as a string or (422) as a list of validation items. */
export function formatErrorDetail(body: unknown, status: number): string {
  const detail = body && typeof body === 'object' ? (body as { detail?: unknown }).detail : undefined;
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) {
    const parts = detail.map((d) => {
      if (!d || typeof d !== 'object') return String(d);
      const item = d as { loc?: unknown; msg?: unknown };
      const loc = Array.isArray(item.loc) ? item.loc.filter((x) => x !== 'query').join('.') : '';
      return `${loc ? `${loc}: ` : ''}${typeof item.msg === 'string' ? item.msg : JSON.stringify(d)}`;
    });
    if (parts.length) return parts.join('；');
  }
  if (status === 401) return '读取 token 无效或缺失';
  return `HTTP ${status}`;
}

export function framesSearchParams(q: FramesQuery, cursor: string | null): URLSearchParams {
  const p = new URLSearchParams();
  p.set('gateway_id', q.gateway_id);
  p.set('channel_id', q.channel_id);
  if (q.session_id) p.set('session_id', q.session_id);
  if (q.since_ns) p.set('since_ns', q.since_ns);
  if (q.until_ns) p.set('until_ns', q.until_ns);
  if (q.message_id !== undefined) p.set('message_id', String(q.message_id));
  if (q.limit !== undefined) p.set('limit', String(q.limit));
  if (cursor !== null) p.set('cursor', cursor);
  return p;
}

async function getJson<T>(cfg: ApiConfig, path: string, params?: URLSearchParams, signal?: AbortSignal): Promise<T> {
  const qs = params && [...params.keys()].length ? `?${params.toString()}` : '';
  const res = await fetch(`${cfg.base}${path}${qs}`, {
    headers: { Authorization: `Bearer ${cfg.token.trim()}`, Accept: 'application/json' },
    signal,
  });
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  if (!res.ok) throw new ApiError(res.status, formatErrorDetail(body, res.status));
  return body as T;
}

export const api = {
  health: (cfg: ApiConfig, signal?: AbortSignal) => getJson<{ ok: boolean }>(cfg, '/health', undefined, signal),
  gateways: async (cfg: ApiConfig, signal?: AbortSignal) =>
    (await getJson<{ gateways: GatewaySnapshot[] }>(cfg, '/api/gateways', undefined, signal)).gateways ?? [],
  sessions: async (cfg: ApiConfig, gatewayId?: string, signal?: AbortSignal) => {
    const p = new URLSearchParams();
    if (gatewayId) p.set('gateway_id', gatewayId);
    return (await getJson<{ sessions: SessionSummary[] }>(cfg, '/api/sessions', p, signal)).sessions ?? [];
  },
  framesPage: (cfg: ApiConfig, q: FramesQuery, cursor: string | null, signal?: AbortSignal) =>
    getJson<FramesPage>(cfg, '/api/frames', framesSearchParams(q, cursor), signal),
};

/** WebSocket URL. Query parameters carry only filters — never the token. */
export function wsUrl(base: string, path: string, params?: URLSearchParams): string {
  const loc = window.location;
  const proto = loc.protocol === 'https:' ? 'wss:' : 'ws:';
  const qs = params && [...params.keys()].length ? `?${params.toString()}` : '';
  return `${proto}//${loc.host}${base}${path}${qs}`;
}