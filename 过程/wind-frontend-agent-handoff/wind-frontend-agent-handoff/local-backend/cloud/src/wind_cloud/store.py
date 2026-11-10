"""A segment file is the data; SQLite stores only its searchable metadata."""

from contextlib import contextmanager
import hashlib
from pathlib import Path
import re
import sqlite3

from wind_proto import decode_segment, load_segment, publish_bytes

MAX_UPLOAD = 8 * 1024 * 1024
MAX_OUTPUT = 16 * 1024 * 1024
SEGMENTS_PER_PAGE = 2
ID_PATTERN = re.compile(r"[0-9a-f]{64}\Z")


class Conflict(ValueError):
    pass


class Store:
    def __init__(self, root):
        self.root = Path(root)
        with self.connection() as db:
            db.execute("PRAGMA journal_mode=WAL")
            db.executescript("""
                CREATE TABLE IF NOT EXISTS segments (
                    id TEXT PRIMARY KEY, gateway TEXT NOT NULL, channel TEXT NOT NULL,
                    session TEXT NOT NULL, start_ns INTEGER, end_ns INTEGER,
                    frames INTEGER NOT NULL, valid_bytes INTEGER NOT NULL,
                    checksum_errors INTEGER NOT NULL, length_errors INTEGER NOT NULL,
                    discarded_bytes INTEGER NOT NULL, incomplete_bytes INTEGER NOT NULL,
                    time_basis TEXT NOT NULL);
                CREATE INDEX IF NOT EXISTS time_window
                    ON segments(gateway,channel,start_ns,id);
                CREATE INDEX IF NOT EXISTS session_list ON segments(gateway,session);
            """)

    @contextmanager
    def connection(self):
        db = sqlite3.connect(self.root / "index.sqlite3", timeout=10, isolation_level=None)
        db.row_factory = sqlite3.Row
        try:
            yield db
        finally:
            db.close()

    def path(self, segment_id):
        if not ID_PATTERN.fullmatch(segment_id):
            raise ValueError("segment ID must be a lowercase SHA-256 digest")
        return self.root / "segments" / f"{segment_id}.wind.zst"

    def ingest(self, segment_id, body, gateway):
        path = self.path(segment_id)
        if len(body) > MAX_UPLOAD:
            raise OverflowError("compressed segment exceeds 8 MiB")
        if hashlib.sha256(body).hexdigest() != segment_id:
            raise Conflict("body does not match the requested content ID")
        with self.connection() as db:
            row = db.execute("SELECT gateway FROM segments WHERE id=?", (segment_id,)).fetchone()
            if row:
                if row[0] != gateway:
                    raise PermissionError("segment belongs to another gateway")
                return False
        segment = decode_segment(body, max_output_bytes=MAX_OUTPUT)
        segment.validate()
        h = segment.header
        if h["gateway_id"] != gateway:
            raise PermissionError("token cannot upload for this gateway")
        q = h["quality"]
        with self.connection() as db:
            # Native SQLite serializes concurrent publishers, including another
            # process retrying the same ID after a lost HTTP acknowledgement.
            db.execute("BEGIN IMMEDIATE")
            if db.execute("SELECT 1 FROM segments WHERE id=?", (segment_id,)).fetchone():
                db.execute("COMMIT")
                return False
            if path.exists():
                with path.open("rb") as handle:
                    if hashlib.file_digest(handle, "sha256").hexdigest() != segment_id:
                        raise Conflict("unindexed stored object is corrupt; retained for inspection")
            else:
                publish_bytes(path, body)
            db.execute("INSERT INTO segments VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)", (
                segment_id, gateway, h["channel_id"], h["session_id"],
                h["start_utc_ns"], h["end_utc_ns"], h["frame_count"], h["valid_bytes"],
                q["checksum_errors"], q["length_errors"], q["discarded_bytes"], q["incomplete_bytes"],
                h["time_basis"]))
            db.execute("COMMIT")
        return True

    def sessions(self, gateway=None):
        where, args = ("WHERE gateway=?", (gateway,)) if gateway else ("", ())
        with self.connection() as db:
            rows = db.execute(f"""SELECT gateway AS gateway_id,session AS session_id,COUNT(*) AS segments,
                SUM(frames) AS frames,MIN(start_ns) AS start_ns,MAX(end_ns) AS end_ns,
                SUM(checksum_errors) AS checksum_errors,SUM(length_errors) AS length_errors,
                SUM(discarded_bytes) AS discarded_bytes,SUM(incomplete_bytes) AS incomplete_bytes
                FROM segments {where} GROUP BY gateway,session ORDER BY gateway,session""", args)
            return [{**dict(row), "start_ns": str(row["start_ns"]) if row["start_ns"] is not None else None,
                     "end_ns": str(row["end_ns"]) if row["end_ns"] is not None else None} for row in rows]

    def page(self, gateway_id, channel_id, session_id=None, since_ns=None, until_ns=None,
             message_id=None, cursor=None, limit=100):
        if not 1 <= limit <= 1000 or (message_id is not None and not 0 <= message_id <= 255):
            raise ValueError("limit must be 1..1000 and message_id 0..255")
        if since_ns is not None and until_ns is not None and since_ns > until_ns:
            raise ValueError("since_ns must not exceed until_ns")
        where = "gateway=? AND channel=? AND frames>0"
        args = [gateway_id, channel_id]
        for condition, value in (("session=?", session_id), ("end_ns>=?", since_ns), ("start_ns<=?", until_ns)):
            if value is not None:
                where += " AND " + condition
                args.append(value)
        position, cursor_id = 0, None
        with self.connection() as db:
            if cursor:
                cursor_id, offset = cursor.split(":")
                self.path(cursor_id)
                position = int(offset)
                row = db.execute("SELECT start_ns FROM segments WHERE " + where + " AND id=?",
                                 [*args, cursor_id]).fetchone()
                if row is None or position < 0:
                    raise ValueError("cursor is outside this query")
                where += " AND (start_ns,id)>=(?,?)"
                args.extend((row[0], cursor_id))
            rows = db.execute("SELECT id,time_basis FROM segments WHERE " + where
                              + " ORDER BY start_ns,id LIMIT ?", [*args, SEGMENTS_PER_PAGE + 1]).fetchall()
        frames = []
        for index, row in enumerate(rows[:SEGMENTS_PER_PAGE]):
            segment = load_segment(self.path(row["id"]))
            start = position if row["id"] == cursor_id else 0
            for after, frame in segment.select(start, since_ns, until_ns, message_id):
                frames.append({"segment_id": row["id"], "utc_ns": str(frame.utc_ns),
                               "monotonic_ns": str(frame.monotonic_ns), "message_id": frame.message_id,
                               "raw_hex": frame.raw.hex(), "time_basis": row["time_basis"],
                               "session_id": segment.header["session_id"]})
                if len(frames) == limit:
                    next_cursor = (f"{row['id']}:{after}" if after < len(segment.records) else
                                   f"{rows[index + 1]['id']}:0" if index + 1 < len(rows) else None)
                    return {"frames": frames, "next_cursor": next_cursor}
        return {"frames": frames, "next_cursor":
                f"{rows[SEGMENTS_PER_PAGE]['id']}:0" if len(rows) > SEGMENTS_PER_PAGE else None}
