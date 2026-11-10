import { afterEach, describe, expect, it, vi } from 'vitest';
import { Simulator } from './simulator';
import { TelemetryStore } from '../telemetry/store';
import { CHANNELS } from '../api/types';
import { readHost } from '../lib/host';

describe('Simulator', () => {
  afterEach(() => vi.useRealTimers());

  it('emits time-ordered frames that pass the protocol parser', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-04T06:00:00Z'));
    const store = new TelemetryStore();
    const sim = new Simulator(store, () => ({ accRangeG: 4, gyroRangeDps: 2000 }));
    sim.start();
    for (let i = 0; i < 25; i++) {
      vi.advanceTimersByTime(40);
      sim.tick();
    }
    for (const c of CHANNELS) {
      const t = store.tracks[c];
      expect(t.regressions).toBe(0);
      expect(t.invalid).toBe(0);
      expect(t.ring.size).toBeGreaterThanOrEqual(99);
      expect(t.attitude()?.source).toBe('quaternion');
      expect(t.byMessage.get(1)).toBeGreaterThan(0);
    }
  });

  it('produces a status snapshot with the documented host shape', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-04T06:00:00Z'));
    const sim = new Simulator(new TelemetryStore(), () => ({ accRangeG: 4, gyroRangeDps: 2000 }));
    sim.start();
    sim.tick();
    const snap = sim.snapshot();
    const host = readHost(snap.status?.host)!;
    expect(host.ext5vV).not.toBeNull();
    expect(host.throttled?.value).toBe(0);
    expect(typeof snap.status?.host?.boot_utc_ns).toBe('string');
    expect(Object.keys(snap.status?.channels ?? {})).toEqual([...CHANNELS]);
  });
});
