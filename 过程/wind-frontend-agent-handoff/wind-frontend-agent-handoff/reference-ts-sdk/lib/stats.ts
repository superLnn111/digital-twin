/** Time-domain statistics over a window of samples. */

export interface WindowStats {
  n: number;
  mean: number;
  rms: number;
  /** RMS after removing the mean (AC component). */
  acRms: number;
  peak: number;
  min: number;
  max: number;
  p2p: number;
}

export function windowStats(values: ArrayLike<number>, start = 0, end = values.length): WindowStats | null {
  const n = end - start;
  if (n <= 0) return null;
  let sum = 0;
  let sumSq = 0;
  let min = Infinity;
  let max = -Infinity;
  for (let i = start; i < end; i++) {
    const v = values[i];
    sum += v;
    sumSq += v * v;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  const mean = sum / n;
  const rms = Math.sqrt(sumSq / n);
  const variance = Math.max(0, sumSq / n - mean * mean);
  return {
    n,
    mean,
    rms,
    acRms: Math.sqrt(variance),
    peak: Math.max(Math.abs(min), Math.abs(max)),
    min,
    max,
    p2p: max - min,
  };
}

/** "Nice" axis bound ≥ v from the 1-2-5 sequence. */
export function niceCeil(v: number): number {
  if (!(v > 0) || !Number.isFinite(v)) return 1;
  const exp = Math.floor(Math.log10(v));
  const base = 10 ** exp;
  const f = v / base;
  const nice = f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10;
  return nice * base;
}
