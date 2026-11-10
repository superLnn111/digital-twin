/**
 * /api/frames cursor following.
 *
 * Each request scans at most two segments, so an empty `frames` array with a
 * non-null `next_cursor` is normal and must be followed. Only `next_cursor ===
 * null` ends the query. There is deliberately no "max empty hops" cut-off; the
 * caller stops via AbortSignal or by reaching the wanted number of frames.
 */

export interface CursorPage<T> {
  frames: T[];
  next_cursor: string | null;
}

export interface FollowProgress {
  pages: number;
  emptyPages: number;
  collected: number;
}

export interface FollowResult<T> extends FollowProgress {
  frames: T[];
  /** Cursor to continue from; null means the query is complete. */
  nextCursor: string | null;
  done: boolean;
}

export type CursorStart = { fresh: true } | { fresh: false; cursor: string };

export async function followCursor<T>(
  fetchPage: (cursor: string | null, signal?: AbortSignal) => Promise<CursorPage<T>>,
  start: CursorStart,
  want: number,
  opts: { signal?: AbortSignal; onProgress?: (p: FollowProgress) => void } = {}
): Promise<FollowResult<T>> {
  const frames: T[] = [];
  let cursor: string | null = start.fresh ? null : start.cursor;
  let pages = 0;
  let emptyPages = 0;
  for (;;) {
    if (opts.signal?.aborted) throw new DOMException('aborted', 'AbortError');
    const page = await fetchPage(cursor, opts.signal);
    pages++;
    if (page.frames.length === 0) emptyPages++;
    for (const f of page.frames) frames.push(f);
    cursor = page.next_cursor;
    opts.onProgress?.({ pages, emptyPages, collected: frames.length });
    if (cursor === null) return { frames, nextCursor: null, done: true, pages, emptyPages, collected: frames.length };
    if (frames.length >= want) {
      return { frames, nextCursor: cursor, done: false, pages, emptyPages, collected: frames.length };
    }
  }
}
