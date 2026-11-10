/** Quality counters for a channel. All counters are monotonic. */

export interface QualityCounters {
  checksum_errors: number | null;
  length_errors: number | null;
  discarded_bytes: number | null;
  incomplete_bytes: number | null;
}

export function readQuality(q: Record<string, unknown> | null | undefined): QualityCounters {
  const o = q ?? {};
  return {
    checksum_errors: toCounter(o.checksum_errors),
    length_errors: toCounter(o.length_errors),
    discarded_bytes: toCounter(o.discarded_bytes),
    incomplete_bytes: toCounter(o.incomplete_bytes),
  };
}

function toCounter(v: unknown): number | null {
  if (v == null) return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
}

export interface QualityDelta {
  increased: boolean;
  reset: boolean;
}

/** Compare two monotonic counters; a decrease implies the gateway restarted. */
export function diffQuality(prev: QualityCounters | null, next: QualityCounters): QualityDelta {
  if (!prev) return { increased: false, reset: false };
  const keys: (keyof QualityCounters)[] = [
    'checksum_errors',
    'length_errors',
    'discarded_bytes',
    'incomplete_bytes',
  ];
  let increased = false;
  let reset = false;
  for (const k of keys) {
    const a = prev[k];
    const b = next[k];
    if (a === null || b === null) continue;
    if (b > a) increased = true;
    if (b < a) reset = true;
  }
  return { increased, reset };
}