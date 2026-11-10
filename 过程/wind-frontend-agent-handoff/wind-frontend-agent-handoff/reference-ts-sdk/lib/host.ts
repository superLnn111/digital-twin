/**
 * Interpretation of the Raspberry Pi 5 `status.host` object.
 *
 * The cloud stores the object verbatim; fields may be missing, null, or of an
 * unexpected type. Anything not a proper value is reported as unknown — never 0.
 */
import { decodeThrottled, type ThrottledReading } from './throttled';
import { nsDiffMs, toNs } from './ns';

export type Level = 'ok' | 'warn' | 'alarm' | 'unknown';

export interface HostReading {
  bootNs: bigint | null;
  uptimeSec: number | null;
  cpuTempC: number | null;
  diskUsedPercent: number | null;
  throttled: ThrottledReading | null;
  /** Raw throttled_hex if it was present but not parseable. */
  throttledRaw: string | null;
  ext5vV: number | null;
  undervoltageAlarm: boolean | null;
  firmwareSampleNs: bigint | null;
  /** Fields not part of the documented contract, kept verbatim. */
  extra: [string, unknown][];
}

export const KNOWN_HOST_FIELDS = [
  'boot_utc_ns',
  'uptime_sec',
  'cpu_temp_mc',
  'disk_used_percent',
  'throttled_hex',
  'ext5v_v',
  'undervoltage_alarm',
  'firmware_sample_utc_ns',
] as const;

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** Returns null when the gateway sent no host object (older uploader). */
export function readHost(host: unknown): HostReading | null {
  if (host === null || typeof host !== 'object' || Array.isArray(host)) return null;
  const h = host as Record<string, unknown>;
  const mc = num(h.cpu_temp_mc);
  const throttled = decodeThrottled(h.throttled_hex);
  return {
    bootNs: toNs(h.boot_utc_ns),
    uptimeSec: num(h.uptime_sec),
    cpuTempC: mc === null ? null : mc / 1000,
    diskUsedPercent: num(h.disk_used_percent),
    throttled,
    throttledRaw: throttled === null && typeof h.throttled_hex === 'string' ? h.throttled_hex : null,
    ext5vV: num(h.ext5v_v),
    undervoltageAlarm: typeof h.undervoltage_alarm === 'boolean' ? h.undervoltage_alarm : null,
    firmwareSampleNs: toNs(h.firmware_sample_utc_ns),
    extra: Object.entries(h).filter(([k]) => !(KNOWN_HOST_FIELDS as readonly string[]).includes(k)),
  };
}

/** Pi 5 soft-throttles at 80 °C and hard-throttles at 85 °C. */
export function tempLevel(c: number | null): Level {
  if (c === null) return 'unknown';
  if (c >= 80) return 'alarm';
  if (c >= 70) return 'warn';
  return 'ok';
}

/** EXT5V nominal 5.0–5.1 V; the PMIC reports undervoltage near 4.63 V. */
export function voltageLevel(v: number | null): Level {
  if (v === null) return 'unknown';
  if (v < 4.75) return 'alarm';
  if (v < 4.9) return 'warn';
  return 'ok';
}

export function diskLevel(p: number | null): Level {
  if (p === null) return 'unknown';
  if (p >= 90) return 'alarm';
  if (p >= 80) return 'warn';
  return 'ok';
}

export function undervoltageLevel(alarm: boolean | null): Level {
  if (alarm === null) return 'unknown';
  return alarm ? 'alarm' : 'ok';
}

export function throttledLevel(t: ThrottledReading | null): Level {
  if (t === null) return 'unknown';
  if (t.anyNow) return 'alarm';
  if (t.anyOccurred) return 'warn';
  return 'ok';
}

/**
 * The firmware readings are cached for 30 s by the uploader (failures too), so an
 * attempt older than this means the uploader is not refreshing them as designed.
 */
export const FIRMWARE_STALE_MS = 45_000;

export interface FirmwareFreshness {
  ageMs: number | null;
  stale: boolean;
  /** An attempt was made, but both values came back null. */
  attemptedWithoutReading: boolean;
}

export function firmwareFreshness(h: HostReading, referenceNs: bigint | null): FirmwareFreshness {
  const ageMs = h.firmwareSampleNs !== null && referenceNs !== null ? nsDiffMs(referenceNs, h.firmwareSampleNs) : null;
  return {
    ageMs,
    stale: ageMs !== null && ageMs > FIRMWARE_STALE_MS,
    attemptedWithoutReading: h.firmwareSampleNs !== null && h.throttled === null && h.ext5vV === null,
  };
}

/**
 * boot_utc_ns is "now − uptime" and jitters with sampling and clock sync, so only
 * a large shift or an uptime that went backwards counts as a reboot.
 */
export const BOOT_SHIFT_TOLERANCE_MS = 120_000;

export function detectReboot(prev: HostReading | null, next: HostReading | null): boolean {
  if (!prev || !next) return false;
  if (prev.uptimeSec !== null && next.uptimeSec !== null && next.uptimeSec + 5 < prev.uptimeSec) return true;
  if (prev.bootNs !== null && next.bootNs !== null) {
    return Math.abs(nsDiffMs(next.bootNs, prev.bootNs)) > BOOT_SHIFT_TOLERANCE_MS;
  }
  return false;
}

export function worstLevel(levels: Level[]): Level {
  if (levels.includes('alarm')) return 'alarm';
  if (levels.includes('warn')) return 'warn';
  if (levels.every((l) => l === 'unknown')) return 'unknown';
  return 'ok';
}
