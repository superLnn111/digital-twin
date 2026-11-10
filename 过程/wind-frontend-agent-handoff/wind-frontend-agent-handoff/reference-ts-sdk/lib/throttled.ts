/**
 * Decode `vcgencmd get_throttled` output.
 *
 * Bits 0–3 describe the *current* condition, bits 16–19 the "has occurred" sticky
 * flags. On the gateway the rpi hwmon driver polls and clears the sticky bits
 * every ~2 s, so the high bits only cover a short recent window, never the full
 * history since boot. The value itself is cached up to 30 s by the uploader.
 */

export interface ThrottleFlag {
  key: 'undervoltage' | 'freqCapped' | 'throttled' | 'softTempLimit';
  label: string;
  now: boolean;
  occurred: boolean;
}

export interface ThrottledReading {
  value: number;
  hex: string;
  flags: ThrottleFlag[];
  /** Bits set outside the documented 0–3 / 16–19 range. */
  unknownBits: number;
  anyNow: boolean;
  anyOccurred: boolean;
}

const FLAG_DEFS: { key: ThrottleFlag['key']; label: string; bit: number }[] = [
  { key: 'undervoltage', label: '欠压', bit: 0 },
  { key: 'freqCapped', label: '频率封顶', bit: 1 },
  { key: 'throttled', label: '降频节流', bit: 2 },
  { key: 'softTempLimit', label: '软温控', bit: 3 },
];

const KNOWN_MASK = 0x000f000f;

export function decodeThrottled(hex: unknown): ThrottledReading | null {
  if (typeof hex !== 'string') return null;
  const s = hex.trim();
  if (!/^0x[0-9a-f]{1,8}$/i.test(s)) return null;
  const value = Number.parseInt(s.slice(2), 16) >>> 0;
  const flags = FLAG_DEFS.map(({ key, label, bit }) => ({
    key,
    label,
    now: ((value >>> bit) & 1) === 1,
    occurred: ((value >>> (bit + 16)) & 1) === 1,
  }));
  return {
    value,
    hex: `0x${value.toString(16)}`,
    flags,
    unknownBits: (value & ~KNOWN_MASK) >>> 0,
    anyNow: flags.some((f) => f.now),
    anyOccurred: flags.some((f) => f.occurred),
  };
}
