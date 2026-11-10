import { describe, expect, it } from 'vitest';
import {
  buildImuFrameHex,
  diffNsToMs,
  GRAVITY_STANDARD,
  parseImuFrameHex,
  parseNsBigInt,
} from './imu';

describe('parseImuFrameHex', () => {
  it('correctly decodes the canonical six-axis frame 5555030c010002000300040005000600ce', () => {
    const sample = '5555030c010002000300040005000600ce';
    const res = parseImuFrameHex(sample, { accRangeG: 4, gyroRangeDps: 2000 });

    expect(res.valid).toBe(true);
    if (!res.valid) return;

    expect(res.messageId).toBe(0x03);
    expect(res.length).toBe(12);
    expect(res.checksum).toBe(0xce);
    expect(res.payload.kind).toBe('six_axis');
    if (res.payload.kind !== 'six_axis') return;

    expect(res.payload.raw).toEqual([1, 2, 3, 4, 5, 6]);
    expect(res.payload.axRaw).toBe(1);
    expect(res.payload.ayRaw).toBe(2);
    expect(res.payload.azRaw).toBe(3);
    expect(res.payload.gxRaw).toBe(4);
    expect(res.payload.gyRaw).toBe(5);
    expect(res.payload.gzRaw).toBe(6);

    expect(res.payload.ax).toBeCloseTo((1 / 32768) * 4 * GRAVITY_STANDARD, 8);
    expect(res.payload.ay).toBeCloseTo((2 / 32768) * 4 * GRAVITY_STANDARD, 8);
    expect(res.payload.az).toBeCloseTo((3 / 32768) * 4 * GRAVITY_STANDARD, 8);
    expect(res.payload.gx).toBeCloseTo((4 / 32768) * 2000, 8);
    expect(res.payload.gy).toBeCloseTo((5 / 32768) * 2000, 8);
    expect(res.payload.gz).toBeCloseTo((6 / 32768) * 2000, 8);
  });

  it('decodes negative int16 values and custom sensor ranges (16g, 500 dps)', () => {
    const hex = buildImuFrameHex(0x03, [-16384, 8192, -32768, 16384, -8192, 4096]);
    const res = parseImuFrameHex(hex, { accRangeG: 16, gyroRangeDps: 500 });

    expect(res.valid).toBe(true);
    if (!res.valid || res.payload.kind !== 'six_axis') return;

    expect(res.payload.raw).toEqual([-16384, 8192, -32768, 16384, -8192, 4096]);
    expect(res.payload.ax).toBeCloseTo(-0.5 * 16 * GRAVITY_STANDARD, 6);
    expect(res.payload.gx).toBeCloseTo(0.5 * 500, 6);
    expect(res.payload.gy).toBeCloseTo(-0.25 * 500, 6);
  });

  it('decodes attitude frame (message_id === 0x01, length === 6)', () => {
    const hex = buildImuFrameHex(0x01, [16384, -8192, 3276]);
    const res = parseImuFrameHex(hex);

    expect(res.valid).toBe(true);
    if (!res.valid || res.payload.kind !== 'attitude') return;

    expect(res.payload.raw).toEqual([16384, -8192, 3276]);
    expect(res.payload.rollDeg).toBeCloseTo(90, 5);
    expect(res.payload.pitchDeg).toBeCloseTo(-45, 5);
    expect(res.payload.yawDeg).toBeCloseTo((3276 / 32768) * 180, 5);
  });

  it('decodes quaternion frame (message_id === 0x02, length === 8)', () => {
    const hex = buildImuFrameHex(0x02, [16384, 0, -16384, 8192]);
    const res = parseImuFrameHex(hex);

    expect(res.valid).toBe(true);
    if (!res.valid || res.payload.kind !== 'quaternion') return;

    expect(res.payload.q0).toBeCloseTo(0.5, 5);
    expect(res.payload.q1).toBeCloseTo(0, 5);
    expect(res.payload.q2).toBeCloseTo(-0.5, 5);
    expect(res.payload.q3).toBeCloseTo(0.25, 5);
  });

  it('decodes port status frame (message_id === 0x06, length === 8)', () => {
    const hex = buildImuFrameHex(0x06, [100, 200, -300, 400]);
    const res = parseImuFrameHex(hex);

    expect(res.valid).toBe(true);
    if (!res.valid || res.payload.kind !== 'port_status') return;

    expect(res.payload.raw).toEqual([100, 200, -300, 400]);
    expect(res.payload.d2).toBe(-300);
  });

  it('rejects frames with bad checksum, wrong header, or mismatched length', () => {
    const badChecksum = '5555030c010002000300040005000600cf';
    expect(parseImuFrameHex(badChecksum).valid).toBe(false);

    const badHeader = '55aa030c010002000300040005000600ce';
    expect(parseImuFrameHex(badHeader).valid).toBe(false);

    const badLength = '5555030a010002000300040005000600cc';
    expect(parseImuFrameHex(badLength).valid).toBe(false);
  });

  it('handles BigInt nanosecond timestamps without precision loss', () => {
    const startNs = '1790000000000000000';
    const endNs = '1790000000125500000';
    expect(parseNsBigInt(startNs)).toBe(1790000000000000000n);
    expect(diffNsToMs(endNs, startNs)).toBeCloseTo(125.5, 4);
  });
});
