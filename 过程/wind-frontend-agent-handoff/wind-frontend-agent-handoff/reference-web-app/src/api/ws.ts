/**
 * WebSocket with first-message authentication.
 *
 * The token is never placed in the URL: right after `open` the client sends
 * `{"token": "..."}` (the server allows 5 s). Close code 1008 means either an
 * authentication failure or — for /api/replay — a query error, which the server
 * announces first with `{"type":"error","detail":...}`.
 */

export type CloseKind = 'normal' | 'auth' | 'query-error' | 'network' | 'client' | 'other';

export interface CloseInfo {
  kind: CloseKind;
  code: number;
  detail: string;
}

export function classifyClose(code: number, serverError: string | null, clientInitiated: boolean): CloseInfo {
  if (clientInitiated) return { kind: 'client', code, detail: '客户端主动断开' };
  if (code === 1000) return { kind: 'normal', code, detail: '服务端正常关闭' };
  if (code === 1008) {
    return serverError !== null
      ? { kind: 'query-error', code, detail: serverError }
      : { kind: 'auth', code, detail: '认证失败：读取 token 无效或超时' };
  }
  if (code === 1006) return { kind: 'network', code, detail: '连接异常中断（网络或代理）' };
  return { kind: 'other', code, detail: serverError ?? `连接关闭（code ${code}）` };
}

/** Minimal surface of the browser WebSocket used here; lets tests inject a fake. */
export interface SocketLike {
  readonly readyState: number;
  onopen: ((ev: unknown) => void) | null;
  onmessage: ((ev: { data: unknown }) => void) | null;
  onclose: ((ev: { code: number }) => void) | null;
  onerror: ((ev: unknown) => void) | null;
  send(data: string): void;
  close(code?: number, reason?: string): void;
}

export type SocketFactory = (url: string) => SocketLike;

export const browserSocketFactory: SocketFactory = (url) => new WebSocket(url) as unknown as SocketLike;

export interface AuthedSocketHandlers {
  onOpen?: () => void;
  onMessage: (msg: Record<string, unknown>) => void;
  onClose: (info: CloseInfo) => void;
}

export interface AuthedSocket {
  close(): void;
}

export function openAuthedSocket(
  url: string,
  token: string,
  handlers: AuthedSocketHandlers,
  factory: SocketFactory = browserSocketFactory
): AuthedSocket {
  const ws = factory(url);
  let serverError: string | null = null;
  let clientClosed = false;
  let finished = false;

  ws.onopen = () => {
    ws.send(JSON.stringify({ token: token.trim() }));
    handlers.onOpen?.();
  };
  ws.onmessage = (ev) => {
    if (clientClosed) return;
    let msg: unknown;
    try {
      msg = JSON.parse(String(ev.data));
    } catch {
      return;
    }
    if (!msg || typeof msg !== 'object') return;
    const m = msg as Record<string, unknown>;
    if (m.type === 'error') {
      serverError = typeof m.detail === 'string' ? m.detail : JSON.stringify(m.detail);
      return;
    }
    handlers.onMessage(m);
  };
  ws.onerror = () => {
    /* the close event carries the useful information */
  };
  ws.onclose = (ev) => {
    if (finished) return;
    finished = true;
    handlers.onClose(classifyClose(ev.code, serverError, clientClosed));
  };

  return {
    close() {
      if (clientClosed) return;
      clientClosed = true;
      try {
        ws.close(1000, 'client');
      } catch {
        /* already closed */
      }
    },
  };
}
