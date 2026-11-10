/** Time-domain statistics over a sliding window of six-axis samples. */

import { RingBuffer } from './ring';

export interface AxisStats {
  min: number;
  max: number;
  mean: number;
  rms: number;
  acRms: number;
  std: number;
  peakToPeak: number;
}

export interface SixAxisStats {
  count: number;
  ax: AxisStats | null;
  ay: AxisStats | null;
  az: AxisStats | null;
  gx: AxisStats | null;
  gy: AxisStats | null;
  gz: AxisStats | null;
  accMagnitudeRms: number | null;
}

export function computeAxisStats(values: number[]): AxisStats | null {
  if (values.length === 0) return null;
  let min = Infinity;
  let max = -Infinity;
  let sum = 0;
  let sumSq = 0;
  for (const v of values) {
    if (v < min) min = v;
    if (v > max) max = v;
    sum += v;
    sumSq += v * v;
  }
  const n = values.length;
  const mean = sum / n;
  const rms = Math.sqrt(sumSq / n);
  const variance = Math.max(0, sumSq / n - mean * mean);
  const std = Math.sqrt(variance);
  return {
    min,
    max,
    mean,
    rms,
    acRms: Math.sqrt(Math.max(0, rms * rms - mean * mean)),
    std,
    peakToPeak: max - min,
  };
}

export function computeStats(ring: RingBuffer): SixAxisStats {
  const ax = computeAxisStats(ring.ax);
  const ay = computeAxisStats(ring.ay);
  const az = computeAxisStats(ring.az);
  const gx = computeAxisStats(ring.gx);
  const gy = computeAxisStats(ring.gy);
  const gz = computeAxisStats(ring.gz);
  const mags: number[] = [];
  for (let i = 0; i < ring.size; i++) {
    mags.push(Math.hypot(ring.ax[i], ring.ay[i], ring.az[i]));
  }
  const accMag = computeAxisStats(mags);
  return {
    count: ring.size,
    ax,
    ay,
    az,
    gx,
    gy,
    gz,
    accMagnitudeRms: accMag?.rms ?? null,
  };
}