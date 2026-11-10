/**
 * Collector quality counters are per-process cumulative values that reset to 0
 * when the collector restarts. They count rejected candidates/bytes, not lost
 * samples, so no "completeness %" is derived from them.
 */

export const QUALITY_KEYS = ['checksum_errors', 'length_errors', 'discarded_bytes', 'incomplete_bytes'] as const;
export type QualityKey = (typeof QUALITY_KEYS)[number];
export type QualityCounters = Record<QualityKey, number | null>;

export const QUALITY_LABELS: Record<QualityKey, string> = {
  checksum_errors: '校验错',
  length_errors: '长度错',
  discarded_bytes: '丢弃字节',
  incomplete_bytes: '不完整字节',
};

export function readQuality(q: unknown): QualityCounters {
  const o = q && typeof q === 'object' ? (q as Record<string, unknown>) : {};
  const out = {} as QualityCounters;
  for (const k of QUALITY_KEYS) {
    const v = o[k];
    out[k] = typeof v === 'number' && Number.isFinite(v) ? v : null;
  }
  return out;
}

export interface QualityDelta {
  /** Increase since the previous snapshot; null if unknown on either side or after a reset. */
  delta: QualityCounters;
  /** A counter went down: the collector restarted and the baseline was re-established. */
  reset: boolean;
  /** At least one counter increased. */
  increased: boolean;
}

export function diffQuality(prev: QualityCounters | null, cur: QualityCounters): QualityDelta {
  const delta = {} as QualityCounters;
  let reset = false;
  let increased = false;
  for (const k of QUALITY_KEYS) {
    const a = prev?.[k] ?? null;
    const b = cur[k];
    if (a === null || b === null) {
      delta[k] = null;
      continue;
    }
    if (b < a) {
      reset = true;
      delta[k] = null;
      continue;
    }
    delta[k] = b - a;
    if (b > a) increased = true;
  }
  if (reset) for (const k of QUALITY_KEYS) delta[k] = null;
  return { delta, reset, increased: !reset && increased };
}

export function anyNonZero(q: QualityCounters): boolean {
  return QUALITY_KEYS.some((k) => (q[k] ?? 0) > 0);
}
