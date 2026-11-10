/**
 * High-frequency telemetry store, kept outside React state.
 *
 * Every frame source (live 1 Hz preview, historical replay, simulator) goes
 * through `ingest`, i.e. through the frozen protocol parser. Canvas and
 * Three.js read the buffers directly in their animation loops; React panels
 * subscribe through a throttled notifier.
 */
import { DEFAULT_RANGE_CONFIG, parseImuFrameHex, type ImuParseResult, type SensorRangeConfig } from '../protocol/imu';
import { CHANNELS, type ChannelId } from '../api/types';
import { SixAxisRing } from '../lib/ring';
import { nsDiffMs, toNs } from '../lib/ns';
import { windowStats, type WindowStats } from '../lib/stats';
import { GRAVITY_STANDARD } from '../protocol/imu';

export type SourceKind = 'live' | 'replay' | 'sim';

export interface Euler {
  roll: number;
  pitch: number;
  yaw: number;
}

export type AttitudeSource = 'quaternion' | 'euler';

export const RING_CAPACITY = 8192;

export class ChannelTrack {
  readonly id: ChannelId;
  readonly ring = new SixAxisRing(RING_CAPACITY);
  /** Normalised [w, x, y, z] from message 0x02. */
  quat: [number, number, number, number] | null = null;
  quatNs: bigint | null = null;
  euler: Euler | null = null;
  eulerNs: bigint | null = null;
  port: [number, number, number, number] | null = null;
  lastParsed: ImuParseResult | null = null;
  lastNs: bigint | null = null;
  lastValidNs: bigint | null = null;
  total = 0;
  invalid = 0;
  regressions = 0;
  byMessage = new Map<number, number>();
  /** Rotor speed. Only the simulator provides one; real data has no RPM source. */
  rpm: number | null = null;

  constructor(id: ChannelId) {
    this.id = id;
  }

  reset(): void {
    this.ring.clear();
    this.quat = null;
    this.quatNs = null;
    this.euler = null;
    this.eulerNs = null;
    this.port = null;
    this.lastParsed = null;
    this.lastNs = null;
    this.lastValidNs = null;
    this.total = 0;
    this.invalid = 0;
    this.regressions = 0;
    this.byMessage.clear();
    this.rpm = null;
  }

  /** Preferred attitude: a valid quaternion, else the Euler-angle frame. */
  attitude(): { source: AttitudeSource; quat: [number, number, number, number] | null; euler: Euler | null } | null {
    const q = this.quat;
    const e = this.euler;
    if (q && (!e || (this.quatNs ?? 0n) >= (this.eulerNs ?? 0n) - 1_000_000_000n)) {
      return { source: 'quaternion', quat: q, euler: quatToEuler(q) };
    }
    if (e) return { source: 'euler', quat: null, euler: e };
    return null;
  }
}

export type IngestResult = 'ok' | 'invalid' | 'regressed' | 'bad-time';

export interface IngestFrame {
  utc_ns: string;
  raw_hex: string;
}

type Listener = () => void;

export class TelemetryStore {
  source: SourceKind = 'sim';
  epochNs: bigint | null = null;
  /** Anchor (ms since epoch) for the right edge of waveform windows. */
  headMs = 0;
  version = 0;
  readonly tracks: Record<ChannelId, ChannelTrack>;
  private listeners = new Set<Listener>();
  private flushTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    this.tracks = Object.fromEntries(CHANNELS.map((c) => [c, new ChannelTrack(c)])) as Record<ChannelId, ChannelTrack>;
  }

  reset(source: SourceKind): void {
    this.source = source;
    this.epochNs = null;
    this.headMs = 0;
    for (const c of CHANNELS) this.tracks[c].reset();
    this.bump();
  }

  setEpoch(ns: bigint): void {
    this.epochNs = ns;
  }

  toMs(ns: bigint): number {
    return this.epochNs === null ? 0 : nsDiffMs(ns, this.epochNs);
  }

  epochPlusMs(ms: number): bigint | null {
    return this.epochNs === null ? null : this.epochNs + BigInt(Math.round(ms * 1e6));
  }

  ingest(channel: ChannelId, frame: IngestFrame, advanceHead = true): IngestResult {
    const track = this.tracks[channel];
    const ns = toNs(frame.utc_ns);
    if (ns === null) return 'bad-time';
    if (this.epochNs === null) this.epochNs = ns;
    track.total++;
    const parsed = parseImuFrameHex(frame.raw_hex, DEFAULT_RANGE_CONFIG);
    track.lastParsed = parsed;
    let result: IngestResult = 'ok';
    if (track.lastNs !== null && ns < track.lastNs) {
      // UTC went backwards: start a fresh waveform segment instead of reordering.
      track.regressions++;
      track.ring.clear();
      result = 'regressed';
    }
    track.lastNs = ns;
    if (!parsed.valid) {
      track.invalid++;
      this.bump();
      return 'invalid';
    }
    track.lastValidNs = ns;
    track.byMessage.set(parsed.messageId, (track.byMessage.get(parsed.messageId) ?? 0) + 1);
    const p = parsed.payload;
    const tMs = this.toMs(ns);
    switch (p.kind) {
      case 'six_axis':
        track.ring.push(tMs, p.raw);
        break;
      case 'attitude':
        track.euler = { roll: p.rollDeg, pitch: p.pitchDeg, yaw: p.yawDeg };
        track.eulerNs = ns;
        break;
      case 'quaternion': {
        const n = Math.hypot(p.q0, p.q1, p.q2, p.q3);
        if (n > 0.5) {
          track.quat = [p.q0 / n, p.q1 / n, p.q2 / n, p.q3 / n];
          track.quatNs = ns;
        }
        break;
      }
      case 'port_status':
        track.port = [p.d0, p.d1, p.d2, p.d3];
        break;
      default:
        break;
    }
    if (advanceHead && tMs > this.headMs) this.headMs = tMs;
    this.bump();
    return result;
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /** Mark data changed; React subscribers are notified at most every 150 ms. */
  bump(): void {
    this.version++;
    if (this.flushTimer !== null) return;
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      for (const l of this.listeners) l();
    }, 150);
  }
}

export const telemetry = new TelemetryStore();

/* ───────────────────────── derived quantities ───────────────────────── */

export function quatToEuler([w, x, y, z]: [number, number, number, number]): Euler {
  const sinr = 2 * (w * x + y * z);
  const cosr = 1 - 2 * (x * x + y * y);
  const sinp = 2 * (w * y - z * x);
  const siny = 2 * (w * z + x * y);
  const cosy = 1 - 2 * (y * y + z * z);
  const r2d = 180 / Math.PI;
  return {
    roll: Math.atan2(sinr, cosr) * r2d,
    pitch: (Math.abs(sinp) >= 1 ? (Math.sign(sinp) * Math.PI) / 2 : Math.asin(sinp)) * r2d,
    yaw: Math.atan2(siny, cosy) * r2d,
  };
}

export function accScaleG(range: SensorRangeConfig): number {
  return range.accRangeG / 32768;
}

export function gyroScaleDps(range: SensorRangeConfig): number {
  return range.gyroRangeDps / 32768;
}

export interface ChannelWindowMetrics {
  n: number;
  spanMs: number;
  /** Per-axis stats in g. */
  acc: [WindowStats, WindowStats, WindowStats];
  /** Per-axis stats in deg/s. */
  gyro: [WindowStats, WindowStats, WindowStats];
  /** |a| in g. */
  accMag: WindowStats;
  /**
   * Vibration: tri-axis vector AC RMS √(σx²+σy²+σz²) in g. Removing each axis'
   * DC first keeps gravity out — |a| alone barely moves under lateral vibration.
   */
  vibRms: number;
}

/** Statistics over samples in (headMs − windowMs, headMs]. null if fewer than 2 samples. */
export function channelWindowMetrics(
  track: ChannelTrack,
  range: SensorRangeConfig,
  headMs: number,
  windowMs: number
): ChannelWindowMetrics | null {
  const ring = track.ring;
  const from = ring.lowerBound(headMs - windowMs);
  const to = ring.lowerBound(headMs + 1e-6);
  const n = to - from;
  if (n < 2) return null;
  const ka = accScaleG(range);
  const kg = gyroScaleDps(range);
  const buf: Float64Array[] = Array.from({ length: 7 }, () => new Float64Array(n));
  for (let i = 0; i < n; i++) {
    const li = from + i;
    const ax = ring.rawAt(li, 0) * ka;
    const ay = ring.rawAt(li, 1) * ka;
    const az = ring.rawAt(li, 2) * ka;
    buf[0][i] = ax;
    buf[1][i] = ay;
    buf[2][i] = az;
    buf[3][i] = ring.rawAt(li, 3) * kg;
    buf[4][i] = ring.rawAt(li, 4) * kg;
    buf[5][i] = ring.rawAt(li, 5) * kg;
    buf[6][i] = Math.hypot(ax, ay, az);
  }
  const s = buf.map((b) => windowStats(b)!);
  return {
    n,
    spanMs: ring.timeAt(to - 1) - ring.timeAt(from),
    acc: [s[0], s[1], s[2]],
    gyro: [s[3], s[4], s[5]],
    accMag: s[6],
    vibRms: Math.hypot(s[0].acRms, s[1].acRms, s[2].acRms),
  };
}

export const G_TO_MS2 = GRAVITY_STANDARD;
