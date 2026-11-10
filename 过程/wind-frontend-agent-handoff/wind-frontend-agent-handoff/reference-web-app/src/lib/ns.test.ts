import { describe, expect, it } from 'vitest';
import { ageMs, compareNs, formatClock, formatDuration, nsDiffMs, parseTimeInput, toNs } from './ns';

describe('ns helpers', () => {
  it('parses only strict decimal strings', () => {
    expect(toNs('1790000000000000123')).toBe(1790000000000000123n);
    expect(toNs(' -5 ')).toBe(-5n);
    expect(toNs('0x10')).toBeNull();
    expect(toNs('1e9')).toBeNull();
    expect(toNs('')).toBeNull();
    expect(toNs(null)).toBeNull();
    expect(toNs(1790000000000000000)).toBeNull();
  });

  it('keeps sub-millisecond precision on 19-digit timestamps', () => {
    // Number('1790000000000000123') would round to ...000000; BigInt keeps it exact.
    const a = toNs('1790000000000123456')!;
    const b = toNs('1790000000000000000')!;
    expect(nsDiffMs(a, b)).toBeCloseTo(0.123456, 6);
    expect(Number('1790000000000123456') - Number('1790000000000000000')).not.toBe(123456);
  });

  it('orders ns strings without Number conversion', () => {
    expect(compareNs('1790000000000000001', '1790000000000000000')).toBe(1);
    expect(compareNs('1790000000000000000', '1790000000000000001')).toBe(-1);
    expect(compareNs('9', '10')).toBe(-1);
    expect(compareNs(null, '1')).toBe(-1);
  });

  it('computes age against a reference and reports unknown as null', () => {
    expect(ageMs('1000000000', 3_000_000_000n)).toBe(2000);
    expect(ageMs(null, 1n)).toBeNull();
    expect(ageMs('garbage', 1n)).toBeNull();
  });

  it('formats UTC clock with microseconds from the ns remainder', () => {
    expect(formatClock(1790000000123456789n, 6, true)).toBe('14:13:20.123456');
    expect(formatClock(null)).toBe('—');
  });

  it('formats durations', () => {
    expect(formatDuration(830)).toBe('830 ms');
    expect(formatDuration(12_400)).toBe('12.4 s');
    expect(formatDuration(185_000)).toBe('3 min 05 s');
    expect(formatDuration(null)).toBe('—');
  });

  it('accepts raw ns or local datetime input', () => {
    expect(parseTimeInput('1790000000000000000')).toBe(1790000000000000000n);
    const local = parseTimeInput('2026-10-27 22:05:29.250');
    expect(local).toBe(BigInt(new Date(2026, 9, 27, 22, 5, 29, 0).getTime()) * 1_000_000n + 250_000_000n);
    expect(parseTimeInput('yesterday')).toBeNull();
    expect(parseTimeInput('')).toBeNull();
  });
});
