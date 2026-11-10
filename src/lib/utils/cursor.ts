/**
 * Cursor-following helper.
 *
 * The cloud backend may return a page with `frames` empty and `next_cursor`
 * non-null (e.g. a page full of segments whose `frame_count` is 0). The client
 * must keep following `next_cursor` until `frames` has data or the cursor is
 * null. This helper normalizes that behaviour.
 */

export interface CursorPage {
  frames: unknown[];
  next_cursor: string | null;
}

export interface FollowCursorResult {
  frames: unknown[];
  next_cursor: string | null;
  hops: number;
  maxHopsExceeded: boolean;
}

export async function followCursor(
  fetchPage: (cursor: string | null) => Promise<CursorPage>,
  maxHops = 16
): Promise<FollowCursorResult> {
  let cursor: string | null = null;
  let hops = 0;
  const acc: unknown[] = [];
  for (;;) {
    const page = await fetchPage(cursor);
    acc.push(...page.frames);
    hops++;
    if (page.next_cursor === null) {
      return { frames: acc, next_cursor: null, hops, maxHopsExceeded: false };
    }
    if (page.frames.length > 0) {
      return { frames: acc, next_cursor: page.next_cursor, hops, maxHopsExceeded: false };
    }
    if (hops >= maxHops) {
      return { frames: acc, next_cursor: page.next_cursor, hops, maxHopsExceeded: true };
    }
    cursor = page.next_cursor;
  }
}