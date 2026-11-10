/**
 * One /api/replay WebSocket per channel with bounded client-side buffering.
 *
 * The server pushes pages back-to-back (it only honours TCP backpressure, which
 * browsers do not expose). When the local queue reaches the high-water mark the
 * stream "parks": it closes the socket and remembers the `next_cursor` of the
 * last page it accepted. Once the player drains below the low-water mark the
 * stream reconnects with that cursor. Only a page whose `next_cursor` is null
 * marks the end; a 1000 close without it is reported as a truncated stream.
 */
import { openAuthedSocket, type AuthedSocket, type SocketFactory, browserSocketFactory } from '../api/ws';
import type { FrameRecord } from '../api/types';

export type StreamState = 'idle' | 'connecting' | 'streaming' | 'parked' | 'ended' | 'error' | 'stopped';

export interface ReplayStreamOptions {
  /** Builds the socket URL for a given cursor (null = from the start of the query). */
  url: (cursor: string | null) => string;
  token: string;
  highWater?: number;
  lowWater?: number;
  factory?: SocketFactory;
  onChange?: () => void;
}

export class ReplayChannelStream {
  state: StreamState = 'idle';
  error: string | null = null;
  pages = 0;
  emptyPages = 0;
  received = 0;
  connections = 0;
  private queue: FrameRecord[] = [];
  private qHead = 0;
  /** Cursor to continue from; meaningful once at least one page was accepted. */
  private resumeCursor: string | null = null;
  private acceptedAny = false;
  private sawEnd = false;
  private sock: AuthedSocket | null = null;
  private gen = 0;
  private readonly high: number;
  private readonly low: number;
  private readonly opts: ReplayStreamOptions;

  constructor(opts: ReplayStreamOptions) {
    this.opts = opts;
    this.high = opts.highWater ?? 2000;
    this.low = opts.lowWater ?? 1000;
  }

  get ended(): boolean {
    return this.state === 'ended';
  }

  /** No more frames will ever arrive (ended, failed or stopped). */
  get finalised(): boolean {
    return this.state === 'ended' || this.state === 'error' || this.state === 'stopped';
  }

  pending(): number {
    return this.queue.length - this.qHead;
  }

  peek(): FrameRecord | undefined {
    return this.queue[this.qHead];
  }

  /** Most recently received frame still in the queue. */
  peekLast(): FrameRecord | undefined {
    return this.pending() > 0 ? this.queue[this.queue.length - 1] : undefined;
  }

  shift(): FrameRecord | undefined {
    const f = this.queue[this.qHead];
    if (f === undefined) return undefined;
    this.qHead++;
    if (this.qHead > 4096 && this.qHead * 2 > this.queue.length) {
      this.queue = this.queue.slice(this.qHead);
      this.qHead = 0;
    }
    return f;
  }

  start(): void {
    if (this.state !== 'idle') return;
    this.connect(null);
  }

  /** Called by the consumer after draining frames. */
  maybeResume(): void {
    if (this.state === 'parked' && this.pending() <= this.low) this.connect(this.resumeCursor);
  }

  retry(): void {
    if (this.state !== 'error') return;
    this.error = null;
    this.connect(this.acceptedAny ? this.resumeCursor : null);
  }

  stop(): void {
    this.gen++;
    this.sock?.close();
    this.sock = null;
    if (!this.finalised) this.state = 'stopped';
    this.changed();
  }

  private changed(): void {
    this.opts.onChange?.();
  }

  private connect(cursor: string | null): void {
    const gen = ++this.gen;
    this.connections++;
    this.state = 'connecting';
    this.changed();
    this.sock = openAuthedSocket(
      this.opts.url(cursor),
      this.opts.token,
      {
        onOpen: () => {
          if (gen !== this.gen) return;
          this.state = 'streaming';
          this.changed();
        },
        onMessage: (m) => {
          if (gen !== this.gen) return;
          this.onPage(m);
        },
        onClose: (info) => {
          if (gen !== this.gen) return;
          this.sock = null;
          if (this.sawEnd) {
            this.state = 'ended';
          } else if (info.kind === 'client') {
            // parked or stopped deliberately: state already set
          } else if (info.kind === 'normal') {
            this.state = 'error';
            this.error = '服务端以 1000 关闭，但未收到 null 游标：流被截断';
          } else {
            this.state = 'error';
            this.error = info.detail;
          }
          this.changed();
        },
      },
      this.opts.factory ?? browserSocketFactory
    );
  }

  private onPage(m: Record<string, unknown>): void {
    if (m.type !== 'frames') return;
    const frames = m.frames;
    const next = m.next_cursor;
    if (!Array.isArray(frames) || !(next === null || typeof next === 'string')) {
      this.state = 'error';
      this.error = '回放页格式不符：缺少 frames 数组或 next_cursor';
      this.gen++;
      this.sock?.close();
      this.sock = null;
      this.changed();
      return;
    }
    this.pages++;
    if (frames.length === 0) this.emptyPages++;
    for (const f of frames as FrameRecord[]) this.queue.push(f);
    this.received += frames.length;
    this.acceptedAny = true;
    this.resumeCursor = next;
    if (next === null) {
      this.sawEnd = true;
      this.state = 'ended';
    } else if (this.pending() >= this.high) {
      this.state = 'parked';
      this.sock?.close();
    }
    this.changed();
  }
}
