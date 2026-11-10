/** Nanosecond string utilities — BigInt preserves every digit, never through Number. */

const US = 1_000n;
const MS = 1_000_000n;
const SEC = 1_000_000_000n;

export function toNs(sec: number, frac: string): bigint | null {
  if (!Number.isFinite(sec)) return null;
  const fracNorm = (frac ?? '').replace(/[.,]/g, '').padEnd(9, '0').slice(0, 9);
  if (!/^\d{9}$/.test(fracNorm)) return null;
  return BigInt(Math.trunc(sec)) * SEC + BigInt(fracNorm);
}

export function parseNs(value: string | null | undefined): bigint | null {
  if (value == null) return null;
  const s = String(value).trim();
  if (!/^\d+$/.test(s)) return null;
  try {
    return BigInt(s);
  } catch {
    return null;
  }
}

export function nsToMs(ns: bigint): number {
  const whole = ns / MS;
  const rem = ns % MS;
  return Number(whole) + Number(rem) / 1e6;
}

export function nsToUs(ns: bigint): number {
  const whole = ns / US;
  const rem = ns % US;
  return Number(whole) + Number(rem) / 1e3;
}

export function nsDiffMs(aNs: bigint, bNs: bigint): number {
  return nsToMs(aNs - bNs);
}

export function formatClock(ns: bigint, baseNs?: bigint): string {
  const n = baseNs !== undefined ? ns - baseNs : ns;
  const sign = n < 0n ? '-' : '';
  const abs = n < 0n ? -n : n;
  const s = abs / SEC;
  const ms = (abs % SEC) / MS;
  return `${sign}${s}.${ms.toString().padStart(3, '0')}`;
}

/** Full UTC wall clock, e.g. `2026-01-02 03:04:05.123`. */
export function formatWallClockNs(ns: bigint): string {
  const ms = Number(ns / MS);
  const remMs = ns % MS;
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return ns.toString();
  const pad = (x: number, n = 2) => String(x).padStart(n, '0');
  return (
    `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ` +
    `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}.` +
    `${pad(Number(remMs), 3)}`
  );
}

/** Relative age in a compact human form; returns null if unknown. */
export function formatAge(ns: bigint | null, nowNs: bigint): string | null {
  if (ns === null || ns <= 0n) return null;
  const delta = nowNs - ns;
  if (delta < 0n) return null;
  if (delta < MS) return '<1 ms';
  if (delta < SEC) return `${nsDiffMs(nowNs, ns).toFixed(0)} ms`;
  const totalSec = Number(delta / SEC);
  if (totalSec < 60) return `${totalSec.toFixed(0)} s`;
  if (totalSec < 3600) return `${Math.floor(totalSec / 60)} m ${Math.floor(totalSec % 60)} s`;
  if (totalSec < 86400) return `${Math.floor(totalSec / 3600)} h ${Math.floor((totalSec % 3600) / 60)} m`;
  return `${Math.floor(totalSec / 86400)} d ${Math.floor((totalSec % 86400) / 3600)} h`;
}