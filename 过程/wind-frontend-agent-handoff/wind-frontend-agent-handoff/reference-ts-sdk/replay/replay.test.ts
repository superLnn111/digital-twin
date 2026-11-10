import { describe, expect, it } from 'vitest';
import { classifyClose, openAuthedSocket, type SocketLike } from '../api/ws';
import { framesSearchParams, formatErrorDetail } from '../api/client';
import { ReplayChannelStream } from './stream';
import { ReplayPlayer } from './player';
import { TelemetryStore } from '../telemetry/store';
import { buildImuFrameHex } from '../protocol/imu';
import type { FrameRecord } from '../api/types';

class FakeSocket implements SocketLike {
  readyState = 0;
  sent: string[] = [];
  closedByClient = false;
  onopen: ((ev: unknown) => void) | null = null;
  onmessage: ((ev: { data: unknown }) => void) | null = null;
  onclose: ((ev: { code: number }) => void) | null = null;
  onerror: ((ev: unknown) => void) | null = null;
  constructor(readonly url: string) {}
  send(d: string) {
    this.sent.push(d);
  }
  close() {
    this.closedByClient = true;
    // browsers fire close asynchronously; emulate synchronously for tests
    this.onclose?.({ code: 1000 });
  }
  open() {
    this.readyState = 1;
    this.onopen?.({});
  }
  msg(obj: unknown) {
    this.onmessage?.({ data: JSON.stringify(obj) });
  }
  serverClose(code: number) {
    this.onclose?.({ code });
  }
}

const frame = (ns: bigint, hex = buildImuFrameHex(0x03, [100, 0, 2048, 0, 0, 0])): FrameRecord => ({
  segment_id: 's',
  session_id: 'x',
  utc_ns: String(ns),
  monotonic_ns: '0',
  message_id: 3,
  raw_hex: hex,
  time_basis: 'read_return',
});

describe('authenticated websocket', () => {
  it('sends the token as the first message and keeps it out of the URL', () => {
    const socks: FakeSocket[] = [];
    openAuthedSocket('ws://h/api/live', 'secret', { onMessage: () => {}, onClose: () => {} }, (u) => {
      const s = new FakeSocket(u);
      socks.push(s);
      return s;
    });
    socks[0].open();
    expect(socks[0].url).not.toContain('secret');
    expect(JSON.parse(socks[0].sent[0])).toEqual({ token: 'secret' });
  });

  it('distinguishes 1008 auth failure from a replay query error', () => {
    expect(classifyClose(1008, null, false).kind).toBe('auth');
    expect(classifyClose(1008, 'since_ns must not exceed until_ns', false)).toMatchObject({ kind: 'query-error' });
    expect(classifyClose(1000, null, false).kind).toBe('normal');
    expect(classifyClose(1006, null, false).kind).toBe('network');
    expect(classifyClose(1000, null, true).kind).toBe('client');
  });

  it('surfaces the server error detail before 1008', () => {
    let info: ReturnType<typeof classifyClose> | null = null;
    let sock!: FakeSocket;
    openAuthedSocket('ws://h', 't', { onMessage: () => {}, onClose: (i) => (info = i) }, (u) => (sock = new FakeSocket(u)));
    sock.open();
    sock.msg({ type: 'error', detail: 'bad cursor' });
    sock.serverClose(1008);
    expect(info).toMatchObject({ kind: 'query-error', detail: 'bad cursor' });
  });
});

describe('http helpers', () => {
  it('never puts a token into query params and passes cursors verbatim', () => {
    const p = framesSearchParams({ gateway_id: 'rpi5', channel_id: 'usb-if00', since_ns: '1790000000000000001' }, 'abc:12');
    expect(p.get('cursor')).toBe('abc:12');
    expect(p.get('since_ns')).toBe('1790000000000000001');
    expect([...p.keys()]).not.toContain('token');
  });

  it('formats 422 validation lists', () => {
    expect(formatErrorDetail({ detail: [{ loc: ['query', 'limit'], msg: 'too large' }] }, 422)).toBe('limit: too large');
    expect(formatErrorDetail({ detail: 'cursor out of range' }, 400)).toBe('cursor out of range');
  });
});

describe('ReplayChannelStream', () => {
  function setup(high = 4, low = 2) {
    const socks: FakeSocket[] = [];
    const urls: (string | null)[] = [];
    const s = new ReplayChannelStream({
      url: (c) => {
        urls.push(c);
        return `ws://h/api/replay${c ? `?cursor=${c}` : ''}`;
      },
      token: 't',
      highWater: high,
      lowWater: low,
      factory: (u) => {
        const k = new FakeSocket(u);
        socks.push(k);
        return k;
      },
    });
    return { s, socks, urls };
  }

  it('follows empty pages and ends only on a null cursor', () => {
    const { s, socks } = setup(100, 50);
    s.start();
    socks[0].open();
    socks[0].msg({ type: 'frames', frames: [], next_cursor: 'a' });
    expect(s.state).toBe('streaming');
    socks[0].msg({ type: 'frames', frames: [frame(1n)], next_cursor: null });
    socks[0].serverClose(1000);
    expect(s.state).toBe('ended');
    expect(s.emptyPages).toBe(1);
    expect(s.pending()).toBe(1);
  });

  it('reports a 1000 close without a null cursor as truncated', () => {
    const { s, socks } = setup(100, 50);
    s.start();
    socks[0].open();
    socks[0].msg({ type: 'frames', frames: [frame(1n)], next_cursor: 'a' });
    socks[0].serverClose(1000);
    expect(s.state).toBe('error');
    expect(s.error).toMatch(/截断/);
  });

  it('parks at the high-water mark and resumes from the last accepted cursor', () => {
    const { s, socks, urls } = setup(4, 2);
    s.start();
    socks[0].open();
    socks[0].msg({ type: 'frames', frames: [frame(1n), frame(2n)], next_cursor: 'c1' });
    socks[0].msg({ type: 'frames', frames: [frame(3n), frame(4n)], next_cursor: 'c2' });
    expect(s.state).toBe('parked');
    expect(socks[0].closedByClient).toBe(true);
    // late page from the old socket must be ignored
    socks[0].msg({ type: 'frames', frames: [frame(5n)], next_cursor: 'c3' });
    expect(s.pending()).toBe(4);
    s.shift();
    s.maybeResume();
    expect(socks.length).toBe(1);
    s.shift();
    s.maybeResume();
    expect(socks.length).toBe(2);
    expect(urls).toEqual([null, 'c2']);
    socks[1].open();
    expect(JSON.parse(socks[1].sent[0])).toEqual({ token: 't' });
  });

  it('retries from the cursor after an error', () => {
    const { s, socks, urls } = setup(100, 50);
    s.start();
    socks[0].open();
    socks[0].msg({ type: 'frames', frames: [frame(1n)], next_cursor: 'k' });
    socks[0].serverClose(1006);
    expect(s.state).toBe('error');
    s.retry();
    expect(urls).toEqual([null, 'k']);
  });
});

describe('ReplayPlayer', () => {
  function streamWith(frames: FrameRecord[]) {
    let sock!: FakeSocket;
    const s = new ReplayChannelStream({ url: () => 'ws://h', token: 't', factory: (u) => (sock = new FakeSocket(u)) });
    s.start();
    sock.open();
    sock.msg({ type: 'frames', frames, next_cursor: null });
    sock.serverClose(1000);
    return s;
  }

  it('plays by timestamp across channels and finishes', () => {
    const store = new TelemetryStore();
    const base = 1790000000000000000n;
    const a = streamWith([frame(base), frame(base + 10_000_000n), frame(base + 20_000_000n)]);
    const b = streamWith([frame(base + 5_000_000n), frame(base + 5_000_000n)]);
    const p = new ReplayPlayer({ 'usb-if00': a, 'usb-if02': b }, store);
    p.tick(0);
    expect(p.phase).toBe('playing');
    expect(p.startNs).toBe(base);
    expect(store.tracks['usb-if00'].ring.size).toBe(1);
    p.tick(6); // +6 ms → both same-timestamp frames on channel 2 consumed together
    expect(store.tracks['usb-if02'].ring.size).toBe(2);
    expect(store.tracks['usb-if00'].ring.size).toBe(1);
    p.tick(50);
    expect(p.phase).toBe('finished');
    expect(store.tracks['usb-if00'].ring.size).toBe(3);
  });

  it('pauses on a timestamp regression instead of reordering', () => {
    const store = new TelemetryStore();
    const base = 1790000000000000000n;
    const a = streamWith([frame(base), frame(base + 10_000_000n), frame(base + 4_000_000n), frame(base + 12_000_000n)]);
    const p = new ReplayPlayer({ 'usb-if00': a }, store);
    p.tick(0);
    p.tick(20);
    expect(p.phase).toBe('break');
    expect(p.brk).toMatchObject({ channel: 'usb-if00', fromNs: base + 10_000_000n, toNs: base + 4_000_000n });
    p.continueAfterBreak();
    p.tick(20);
    expect(store.tracks['usb-if00'].regressions).toBe(1);
    expect(p.phase).toBe('finished');
  });

  it('a query with no frames finishes immediately', () => {
    const p = new ReplayPlayer({ 'usb-if00': streamWith([]) }, new TelemetryStore());
    p.tick(0);
    expect(p.phase).toBe('finished');
  });

  it('never runs the clock past the last queued frame of an unfinished stream', () => {
    const store = new TelemetryStore();
    const base = 1790000000000000000n;
    const done = streamWith([frame(base), frame(base + 500_000_000n)]);
    let sock!: FakeSocket;
    const partial = new ReplayChannelStream({ url: () => 'ws://h', token: 't', factory: (u) => (sock = new FakeSocket(u)) });
    partial.start();
    sock.open();
    sock.msg({ type: 'frames', frames: [frame(base + 10_000_000n)], next_cursor: 'more' });
    const p = new ReplayPlayer({ 'usb-if00': done, 'usb-if02': partial }, store);
    p.tick(0);
    p.tick(100);
    // only 10 ms are known for usb-if02, so the play-head must wait there
    expect(p.playheadNs).toBe(base + 10_000_000n);
    const before = p.playheadNs!;
    sock.msg({ type: 'frames', frames: [frame(base + 20_000_000n), frame(base + 300_000_000n)], next_cursor: null });
    p.tick(100);
    expect(p.playheadNs! >= before).toBe(true);
    expect(store.tracks['usb-if02'].ring.size).toBe(2);
    expect(store.tracks['usb-if02'].regressions).toBe(0);
  });
});
