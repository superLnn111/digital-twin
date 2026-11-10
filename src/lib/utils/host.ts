/**
 * Host telemetry interpretation for `status.host`.
 *
 * Every field is nullable / may be absent — the panel must render
 * `未知` (unknown) instead of guessing. The `ext5v_v` voltage is the
 * authoritative 5 V rail reading and the primary undervoltage signal.
 */

import { readThrottled, type ThrottledView } from './throttled';

export interface HostReading {
  bootUtcNs: bigint | null;
  uptimeSec: number | null;
  cpuTempC: number | null;
  diskUsedPercent: number | null;
  throttled: ThrottledView | null;
  ext5vV: number | null;
  undervoltageAlarm: boolean | null;
  firmwareSampleUtcNs: bigint | null;
}

export function readHost(host: Record<string, unknown> | null | undefined): HostReading {
  const h = host ?? {};
  return {
    bootUtcNs: toNullableBigInt(h.boot_utc_ns),
    uptimeSec: toNullableNumber(h.uptime_sec),
    cpuTempC: toNullableNumber(h.cpu_temp_mc, (v) => v / 1000),
    diskUsedPercent: toNullableNumber(h.disk_used_percent),
    throttled: readThrottled(typeof h.throttled_hex === 'string' ? h.throttled_hex : null),
    ext5vV: toNullableNumber(h.ext5v_v),
    undervoltageAlarm: typeof h.undervoltage_alarm === 'boolean' ? h.undervoltage_alarm : null,
    firmwareSampleUtcNs: toNullableBigInt(h.firmware_sample_utc_ns),
  };
}

function toNullableBigInt(v: unknown): bigint | null {
  if (v == null) return null;
  try {
    const n = BigInt(String(v).trim());
    return n > 0n ? n : null;
  } catch {
    return null;
  }
}

function toNullableNumber(v: unknown, transform?: (n: number) => number): number | null {
  if (v == null) return null;
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n)) return null;
  return transform ? transform(n) : n;
}

/** True when the host has (re)booted between two readings of the same gateway. */
export function detectReboot(prev: HostReading | null, next: HostReading): boolean {
  if (!prev) return false;
  if (prev.bootUtcNs !== null && next.bootUtcNs !== null) {
    if (next.bootUtcNs !== prev.bootUtcNs) return true;
  }
  if (prev.uptimeSec !== null && next.uptimeSec !== null && next.uptimeSec < prev.uptimeSec - 1) {
    return true;
  }
  return false;
}