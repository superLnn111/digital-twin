/**
 * Nanosecond timestamp helpers.
 *
 * Every nanosecond quantity in the API is a decimal string. These helpers keep
 * the full value in BigInt and only convert *differences* to Number, split into
 * whole milliseconds plus the sub-millisecond remainder.
 */

const DECIMAL_NS = /^-?\d{1,20}$/;
const NS_PER_MS = 1_000_000n;

/** Strictly parse a decimal nanosecond string. Anything else is null (unknown). */
export function toNs(value: unknown): bigint | null {
  if (typeof value !== 'string') return null;
  const s = value.trim();
  if (!DECIMAL_NS.test(s)) return null;
  try {
    return BigInt(s);
  } catch {
    return null;
  }
}

export function nowNs(): bigint {
  return BigInt(Date.now()) * NS_PER_MS;
}

/** a - b in milliseconds: whole ms and the ns remainder are converted separately. */
export function nsDiffMs(a: bigint, b: bigint): number {
  const d = a - b;
  return Number(d / NS_PER_MS) + Number(d % NS_PER_MS) / 1e6;
}

/** Milliseconds elapsed since `ns` (browser clock). null when ns is unknown. */
export function ageMs(ns: string | null | undefined, now: bigint = nowNs()): number | null {
  const t = toNs(ns);
  if (t === null) return null;
  return nsDiffMs(now, t);
}

/** Ordering of two decimal ns strings without precision loss. Invalid values sort first. */
export function compareNs(a: string | null | undefined, b: string | null | undefined): number {
  const x = toNs(a);
  const y = toNs(b);
  if (x === null && y === null) return 0;
  if (x === null) return -1;
  if (y === null) return 1;
  return x < y ? -1 : x > y ? 1 : 0;
}

const pad = (n: number | bigint, w = 2) => String(n).padStart(w, '0');

function splitNs(ns: bigint): { date: Date; subMsNs: bigint; msInSecond: bigint } {
  // floor division so that negative values stay consistent
  let ms = ns / NS_PER_MS;
  let rem = ns % NS_PER_MS;
  if (rem < 0n) {
    rem += NS_PER_MS;
    ms -= 1n;
  }
  const date = new Date(Number(ms));
  return { date, subMsNs: rem, msInSecond: ((ms % 1000n) + 1000n) % 1000n };
}

export type FractionDigits = 0 | 3 | 6 | 9;

/** Local wall clock, e.g. 14:03:22.415 or 14:03:22.415207 */
export function formatClock(ns: bigint | null, digits: FractionDigits = 3, utc = false): string {
  if (ns === null) return '—';
  const { date, subMsNs, msInSecond } = splitNs(ns);
  if (Number.isNaN(date.getTime())) return '—';
  const h = utc ? date.getUTCHours() : date.getHours();
  const m = utc ? date.getUTCMinutes() : date.getMinutes();
  const s = utc ? date.getUTCSeconds() : date.getSeconds();
  const base = `${pad(h)}:${pad(m)}:${pad(s)}`;
  if (digits === 0) return base;
  const frac = `${pad(msInSecond, 3)}${pad(subMsNs, 6)}`.slice(0, digits);
  return `${base}.${frac}`;
}

/** Local date + time, e.g. 2026-10-27 22:05:29 */
export function formatDateTime(ns: bigint | null, utc = false): string {
  if (ns === null) return '—';
  const { date } = splitNs(ns);
  if (Number.isNaN(date.getTime())) return '—';
  const y = utc ? date.getUTCFullYear() : date.getFullYear();
  const mo = (utc ? date.getUTCMonth() : date.getMonth()) + 1;
  const d = utc ? date.getUTCDate() : date.getDate();
  return `${y}-${pad(mo)}-${pad(d)} ${formatClock(ns, 0, utc)}`;
}

/** Human duration for ms spans: 830 ms, 12.4 s, 3 min 05 s, 2 h 03 min, 4 d 06 h */
export function formatDuration(ms: number | null): string {
  if (ms === null || !Number.isFinite(ms)) return '—';
  const neg = ms < 0;
  const a = Math.abs(ms);
  let out: string;
  if (a < 1000) out = `${a.toFixed(0)} ms`;
  else if (a < 60_000) out = `${(a / 1000).toFixed(1)} s`;
  else if (a < 3_600_000) {
    const m = Math.floor(a / 60_000);
    out = `${m} min ${pad(Math.floor((a % 60_000) / 1000))} s`;
  } else if (a < 86_400_000) {
    const h = Math.floor(a / 3_600_000);
    out = `${h} h ${pad(Math.floor((a % 3_600_000) / 60_000))} min`;
  } else {
    const d = Math.floor(a / 86_400_000);
    out = `${d} d ${pad(Math.floor((a % 86_400_000) / 3_600_000))} h`;
  }
  return neg ? `−${out}` : out;
}

/** Relative age label; negative ages (clock skew) are shown explicitly. */
export function formatAge(ms: number | null): string {
  if (ms === null) return '未知';
  if (ms < -1500) return `超前 ${formatDuration(-ms)}`;
  if (ms < 1000) return '刚刚';
  return `${formatDuration(ms)} 前`;
}

/**
 * Accept either a raw decimal ns string or a local datetime (`YYYY-MM-DDTHH:MM[:SS[.fff]]`,
 * a space is also allowed as separator). Returns null for empty / unparsable input.
 */
export function parseTimeInput(input: string): bigint | null {
  const s = input.trim();
  if (!s) return null;
  if (DECIMAL_NS.test(s)) return toNs(s);
  const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,9}))?)?$/.exec(s);
  if (!m) return null;
  const [, y, mo, d, h, mi, sec = '0', frac = ''] = m;
  const date = new Date(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(sec), 0);
  if (Number.isNaN(date.getTime())) return null;
  const fracNs = BigInt((frac + '000000000').slice(0, 9));
  return BigInt(date.getTime()) * NS_PER_MS + fracNs;
}

/** Inverse of parseTimeInput for display in a text field (local time, ms precision). */
export function formatTimeInput(ns: bigint | null): string {
  if (ns === null) return '';
  const { date, msInSecond } = splitNs(ns);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(
    date.getMinutes()
  )}:${pad(date.getSeconds())}.${pad(msInSecond, 3)}`;
}
