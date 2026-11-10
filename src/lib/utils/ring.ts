/** Fixed-capacity ring buffer of six-axis samples (acc in m/s², gyro in °/s). */

export interface RingSample {
  /** unix epoch seconds */
  t: number;
  ax: number;
  ay: number;
  az: number;
  gx: number;
  gy: number;
  gz: number;
}

export class RingBuffer {
  readonly capacity: number;
  readonly t: number[] = [];
  readonly ax: number[] = [];
  readonly ay: number[] = [];
  readonly az: number[] = [];
  readonly gx: number[] = [];
  readonly gy: number[] = [];
  readonly gz: number[] = [];

  constructor(capacity = 4096) {
    this.capacity = capacity;
  }

  get size(): number {
    return this.ax.length;
  }

  get full(): boolean {
    return this.size >= this.capacity;
  }

  clear(): void {
    this.t.length = 0;
    this.ax.length = 0;
    this.ay.length = 0;
    this.az.length = 0;
    this.gx.length = 0;
    this.gy.length = 0;
    this.gz.length = 0;
  }

  push(sample: RingSample): void {
    if (this.full) {
      this.t.shift();
      this.ax.shift();
      this.ay.shift();
      this.az.shift();
      this.gx.shift();
      this.gy.shift();
      this.gz.shift();
    }
    this.t.push(sample.t);
    this.ax.push(sample.ax);
    this.ay.push(sample.ay);
    this.az.push(sample.az);
    this.gx.push(sample.gx);
    this.gy.push(sample.gy);
    this.gz.push(sample.gz);
  }
}