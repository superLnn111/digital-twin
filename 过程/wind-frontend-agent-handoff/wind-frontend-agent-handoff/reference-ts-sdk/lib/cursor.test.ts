import { describe, expect, it } from 'vitest';
import { followCursor, type CursorPage } from './cursor';
import { SixAxisRing } from './ring';
import { niceCeil, windowStats } from './stats';

describe('followCursor', () => {
  it('keeps following through empty pages until next_cursor is null', async () => {
    const pages: Record<string, CursorPage<number>> = {
      start: { frames: [1, 2], next_cursor: 'a' },
      a: { frames: [], next_cursor: 'b' },
      b: { frames: [], next_cursor: 'c' },
      c: { frames: [], next_cursor: 'd' },
      d: { frames: [], next_cursor: 'e' },
      e: { frames: [], next_cursor: 'f' },
      f: { frames: [], next_cursor: 'g' },
      g: { frames: [3], next_cursor: null },
    };
    const seen: (string | null)[] = [];
    const r = await followCursor(
      async (cursor) => {
        seen.push(cursor);
        return pages[cursor ?? 'start'];
      },
      { fresh: true },
      100
    );
    expect(r.frames).toEqual([1, 2, 3]);
    expect(r.done).toBe(true);
    expect(r.nextCursor).toBeNull();
    expect(r.emptyPages).toBe(6);
    expect(seen).toEqual([null, 'a', 'b', 'c', 'd', 'e', 'f', 'g']);
  });

  it('stops at the wanted count and returns the cursor to continue', async () => {
    const r = await followCursor(
      async (cursor) => ({ frames: [Number(cursor ?? 0)], next_cursor: String(Number(cursor ?? 0) + 1) }),
      { fresh: false, cursor: '5' },
      3
    );
    expect(r.frames).toEqual([5, 6, 7]);
    expect(r.done).toBe(false);
    expect(r.nextCursor).toBe('8');
  });

  it('an empty first page with a cursor is not the end', async () => {
    let calls = 0;
    const r = await followCursor(
      async () => (++calls === 1 ? { frames: [], next_cursor: 'x' } : { frames: [], next_cursor: null }),
      { fresh: true },
      10
    );
    expect(calls).toBe(2);
    expect(r.done).toBe(true);
  });

  it('honours abort', async () => {
    const ctl = new AbortController();
    ctl.abort();
    await expect(followCursor(async () => ({ frames: [], next_cursor: 'x' }), { fresh: true }, 1, { signal: ctl.signal })).rejects.toThrow();
  });
});

describe('SixAxisRing', () => {
  it('wraps and keeps logical order', () => {
    const r = new SixAxisRing(4);
    for (let i = 0; i < 6; i++) r.push(i * 10, [i, i, i, i, i, i]);
    expect(r.size).toBe(4);
    expect([0, 1, 2, 3].map((i) => r.timeAt(i))).toEqual([20, 30, 40, 50]);
    expect(r.rawAt(0, 2)).toBe(2);
    expect(r.lowerBound(35)).toBe(2);
    expect(r.lowerBound(0)).toBe(0);
    expect(r.lowerBound(99)).toBe(4);
    expect(r.lastTime()).toBe(50);
  });
});

describe('windowStats', () => {
  it('computes rms, ac rms, peak and peak-to-peak', () => {
    const s = windowStats([1, -1, 1, -1])!;
    expect(s.rms).toBeCloseTo(1);
    expect(s.acRms).toBeCloseTo(1);
    expect(s.p2p).toBe(2);
    const dc = windowStats([2, 2, 2])!;
    expect(dc.rms).toBeCloseTo(2);
    expect(dc.acRms).toBeCloseTo(0);
    expect(windowStats([])).toBeNull();
  });

  it('nice axis bounds', () => {
    expect(niceCeil(0.37)).toBeCloseTo(0.5);
    expect(niceCeil(1.2)).toBe(2);
    expect(niceCeil(7)).toBe(10);
    expect(niceCeil(0)).toBe(1);
  });
});
