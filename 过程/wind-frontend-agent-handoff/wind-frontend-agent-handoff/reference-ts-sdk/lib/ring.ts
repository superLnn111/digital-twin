/**
 * Fixed-capacity ring buffer of six-axis samples.
 *
 * Raw int16 values are kept (not physical units) so that switching the
 * accelerometer/gyro range re-scales the whole history consistently.
 */
export class SixAxisRing {
  readonly capacity: number;
  readonly t: Float64Array;
  readonly raw: Int16Array;
  private head = 0;
  private count = 0;

  constructor(capacity: number) {
    this.capacity = capacity;
    this.t = new Float64Array(capacity);
    this.raw = new Int16Array(capacity * 6);
  }

  get size(): number {
    return this.count;
  }

  clear(): void {
    this.head = 0;
    this.count = 0;
  }

  push(tMs: number, raw: ArrayLike<number>): void {
    const i = this.head;
    this.t[i] = tMs;
    const o = i * 6;
    for (let k = 0; k < 6; k++) this.raw[o + k] = raw[k];
    this.head = (i + 1) % this.capacity;
    if (this.count < this.capacity) this.count++;
  }

  /** Physical slot of the i-th oldest sample. */
  slot(i: number): number {
    return (this.head - this.count + i + this.capacity * 2) % this.capacity;
  }

  timeAt(i: number): number {
    return this.t[this.slot(i)];
  }

  rawAt(i: number, axis: number): number {
    return this.raw[this.slot(i) * 6 + axis];
  }

  lastTime(): number | null {
    return this.count === 0 ? null : this.timeAt(this.count - 1);
  }

  /**
   * Index of the first sample with t >= tMs (logical index). Assumes timestamps are
   * non-decreasing, which holds within a stream because regressions are not pushed.
   */
  lowerBound(tMs: number): number {
    let lo = 0;
    let hi = this.count;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (this.timeAt(mid) < tMs) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }
}
