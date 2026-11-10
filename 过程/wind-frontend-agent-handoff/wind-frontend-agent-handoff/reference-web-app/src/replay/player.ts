/**
 * Replay clock: drives all channel streams from one shared play-head, using the
 * frames' own utc_ns. Server record order is preserved; frames sharing a
 * timestamp are consumed together. A timestamp regression pauses playback and
 * is shown as a break, instead of being silently reordered.
 */
import { CHANNELS, type ChannelId, type FrameRecord } from '../api/types';
import { toNs } from '../lib/ns';
import type { TelemetryStore } from '../telemetry/store';
import type { ReplayChannelStream } from './stream';

export type PlayerPhase = 'priming' | 'playing' | 'paused' | 'buffering' | 'break' | 'finished';

export interface ReplayBreak {
  channel: ChannelId;
  fromNs: bigint;
  toNs: bigint;
}

/** Maximum frames applied per tick, so high speeds cannot freeze the UI. */
const MAX_FRAMES_PER_TICK = 6000;

export class ReplayPlayer {
  phase: PlayerPhase = 'priming';
  speed = 1;
  playheadNs: bigint | null = null;
  startNs: bigint | null = null;
  brk: ReplayBreak | null = null;
  badTime = 0;
  readonly streams: Partial<Record<ChannelId, ReplayChannelStream>>;
  private lastNs: Partial<Record<ChannelId, bigint>> = {};
  private allowRegression = new Set<ChannelId>();
  private wantPlay = true;
  private readonly store: TelemetryStore;

  constructor(streams: Partial<Record<ChannelId, ReplayChannelStream>>, store: TelemetryStore) {
    this.streams = streams;
    this.store = store;
  }

  private entries(): [ChannelId, ReplayChannelStream][] {
    return CHANNELS.flatMap((c) => (this.streams[c] ? [[c, this.streams[c]!] as [ChannelId, ReplayChannelStream]] : []));
  }

  start(): void {
    for (const [, s] of this.entries()) s.start();
  }

  stop(): void {
    for (const [, s] of this.entries()) s.stop();
  }

  play(): void {
    this.wantPlay = true;
    if (this.phase === 'paused') this.phase = 'playing';
  }

  pause(): void {
    this.wantPlay = false;
    if (this.phase === 'playing' || this.phase === 'buffering') this.phase = 'paused';
  }

  /** Accept the regression on the break channel and continue. */
  continueAfterBreak(): void {
    if (!this.brk) return;
    this.allowRegression.add(this.brk.channel);
    this.brk = null;
    this.phase = this.wantPlay ? 'playing' : 'paused';
  }

  private headNs(s: ReplayChannelStream): bigint | null | undefined {
    for (;;) {
      const f = s.peek();
      if (!f) return undefined;
      const ns = toNs(f.utc_ns);
      if (ns !== null) return ns;
      s.shift();
      this.badTime++;
    }
  }

  /** Advance by wall-clock dt (ms). Returns true when anything changed. */
  tick(dtMs: number): boolean {
    const entries = this.entries();
    if (this.phase === 'finished') return false;

    if (this.phase === 'priming') {
      // Wait until every stream has a first frame or is finalised.
      let earliest: bigint | null = null;
      for (const [, s] of entries) {
        const h = this.headNs(s);
        if (h === undefined) {
          if (!s.finalised) return false;
          continue;
        }
        if (h !== null && (earliest === null || h < earliest)) earliest = h;
      }
      if (earliest === null) {
        this.phase = 'finished';
        return true;
      }
      this.startNs = earliest;
      this.playheadNs = earliest;
      this.store.setEpoch(earliest);
      this.store.headMs = 0;
      this.phase = this.wantPlay ? 'playing' : 'paused';
      this.consumeUpTo(earliest, entries);
      return true;
    }

    if (this.phase === 'break' || this.phase === 'paused' || this.playheadNs === null) return false;

    // Buffering: an unfinished stream has nothing queued, so we cannot know what comes next.
    const starving = entries.some(([, s]) => !s.finalised && s.pending() === 0);
    if (starving) {
      if (this.phase !== 'buffering') {
        this.phase = 'buffering';
        return true;
      }
      return false;
    }
    if (this.phase === 'buffering') this.phase = 'playing';

    const step = BigInt(Math.max(0, Math.round(Math.min(dtMs, 250) * this.speed * 1e6)));
    let target = this.playheadNs + step;
    // An unfinished stream may still deliver frames up to now-unknown times: never
    // let the clock run past the last frame it has queued, or those frames would
    // arrive "in the past".
    for (const [, s] of entries) {
      if (s.finalised) continue;
      const last = toNs(s.peekLast()?.utc_ns);
      if (last !== null && last < target) target = last > this.playheadNs ? last : this.playheadNs;
    }
    const consumed = this.consumeUpTo(target, entries);
    // consumeUpTo may switch the phase to 'break'; re-read it without narrowing
    if ((this.phase as PlayerPhase) === 'break') return true;
    const next = consumed.limited ? consumed.reachedNs : target;
    if (next > this.playheadNs) this.playheadNs = next;
    this.store.headMs = this.store.toMs(this.playheadNs);
    this.store.bump();

    if (entries.every(([, s]) => s.finalised && s.pending() === 0)) this.phase = 'finished';
    return true;
  }

  private consumeUpTo(
    target: bigint,
    entries: [ChannelId, ReplayChannelStream][]
  ): { limited: boolean; reachedNs: bigint } {
    let budget = MAX_FRAMES_PER_TICK;
    let reached = target;
    let limited = false;
    for (const [c, s] of entries) {
      for (;;) {
        const h = this.headNs(s);
        if (h === undefined || h === null || h > target) break;
        const last = this.lastNs[c];
        if (last !== undefined && h < last && !this.allowRegression.has(c)) {
          this.brk = { channel: c, fromNs: last, toNs: h };
          this.phase = 'break';
          s.maybeResume();
          return { limited: true, reachedNs: reached };
        }
        if (budget <= 0) {
          limited = true;
          if (h < reached) reached = h;
          break;
        }
        const f = s.shift() as FrameRecord;
        if (last !== undefined && h < last) this.allowRegression.delete(c);
        this.lastNs[c] = h;
        this.store.ingest(c, f, false);
        budget--;
      }
      s.maybeResume();
    }
    return { limited, reachedNs: reached };
  }

  /** Total frames still queued locally. */
  queued(): number {
    return this.entries().reduce((a, [, s]) => a + s.pending(), 0);
  }
}
