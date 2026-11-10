import { describe, expect, it } from 'vitest';
import { decodeThrottled } from './throttled';
import { detectReboot, firmwareFreshness, readHost, tempLevel, voltageLevel } from './host';
import { diffQuality, readQuality } from './quality';

describe('decodeThrottled', () => {
  it('decodes current and recently-occurred bits', () => {
    const r = decodeThrottled('0x50005')!;
    expect(r.flags.find((f) => f.key === 'undervoltage')).toMatchObject({ now: true, occurred: true });
    expect(r.flags.find((f) => f.key === 'throttled')).toMatchObject({ now: true, occurred: true });
    expect(r.flags.find((f) => f.key === 'freqCapped')).toMatchObject({ now: false, occurred: false });
    expect(r.anyNow).toBe(true);
    expect(r.unknownBits).toBe(0);
  });

  it('treats 0x0 as clear and rejects junk', () => {
    expect(decodeThrottled('0x0')).toMatchObject({ value: 0, anyNow: false, anyOccurred: false });
    expect(decodeThrottled(null)).toBeNull();
    expect(decodeThrottled('throttled=0x0')).toBeNull();
    expect(decodeThrottled(5)).toBeNull();
  });

  it('flags undocumented bits', () => {
    expect(decodeThrottled('0x100')!.unknownBits).toBe(0x100);
  });
});

describe('readHost', () => {
  const full = {
    boot_utc_ns: '1789999879750000000',
    uptime_sec: 120.25,
    cpu_temp_mc: 45678,
    disk_used_percent: 25.0,
    throttled_hex: '0x0',
    ext5v_v: 5.0652,
    undervoltage_alarm: false,
    firmware_sample_utc_ns: '1790000000000000000',
    fan_rpm: 3100,
  };

  it('reads the documented example and keeps unknown fields', () => {
    const h = readHost(full)!;
    expect(h.cpuTempC).toBeCloseTo(45.678);
    expect(h.bootNs).toBe(1789999879750000000n);
    expect(h.ext5vV).toBe(5.0652);
    expect(h.undervoltageAlarm).toBe(false);
    expect(h.extra).toEqual([['fan_rpm', 3100]]);
  });

  it('never turns null or missing into zero', () => {
    const h = readHost({ cpu_temp_mc: null, ext5v_v: null, undervoltage_alarm: null })!;
    expect(h.cpuTempC).toBeNull();
    expect(h.ext5vV).toBeNull();
    expect(h.undervoltageAlarm).toBeNull();
    expect(h.diskUsedPercent).toBeNull();
    expect(h.uptimeSec).toBeNull();
    expect(tempLevel(h.cpuTempC)).toBe('unknown');
    expect(voltageLevel(h.ext5vV)).toBe('unknown');
  });

  it('returns null when the gateway sent no host object', () => {
    expect(readHost(undefined)).toBeNull();
    expect(readHost(null)).toBeNull();
  });

  it('distinguishes a firmware attempt without readings', () => {
    const h = readHost({ throttled_hex: null, ext5v_v: null, firmware_sample_utc_ns: '1790000000000000000' })!;
    const f = firmwareFreshness(h, 1790000010000000000n);
    expect(f.attemptedWithoutReading).toBe(true);
    expect(f.ageMs).toBe(10_000);
    expect(f.stale).toBe(false);
    expect(firmwareFreshness(h, 1790000060000000000n).stale).toBe(true);
  });

  it('ignores boot time jitter but detects real reboots', () => {
    const a = readHost(full)!;
    const jitter = readHost({ ...full, boot_utc_ns: '1789999880350000000', uptime_sec: 121.3 })!;
    expect(detectReboot(a, jitter)).toBe(false);
    const rebooted = readHost({ ...full, boot_utc_ns: '1790000500000000000', uptime_sec: 3 })!;
    expect(detectReboot(a, rebooted)).toBe(true);
  });
});

describe('quality counters', () => {
  it('reports deltas and unknowns', () => {
    const a = readQuality({ checksum_errors: 1, length_errors: 0, discarded_bytes: 10 });
    const b = readQuality({ checksum_errors: 3, length_errors: 0, discarded_bytes: 10 });
    const d = diffQuality(a, b);
    expect(d.delta.checksum_errors).toBe(2);
    expect(d.delta.length_errors).toBe(0);
    expect(d.delta.incomplete_bytes).toBeNull();
    expect(d.increased).toBe(true);
    expect(d.reset).toBe(false);
  });

  it('re-baselines when a counter drops (collector restart)', () => {
    const d = diffQuality(readQuality({ checksum_errors: 9 }), readQuality({ checksum_errors: 0 }));
    expect(d.reset).toBe(true);
    expect(d.increased).toBe(false);
    expect(d.delta.checksum_errors).toBeNull();
  });
});
