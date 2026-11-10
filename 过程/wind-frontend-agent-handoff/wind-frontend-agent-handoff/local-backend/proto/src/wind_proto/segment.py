"""One self-contained Zstd frame: a JSON header followed by aligned IMU records."""

from compression import zstd
from dataclasses import dataclass
import json
import os
from pathlib import Path
import struct
from typing import Iterator

from .imu import Frame, Quality, valid_frame

MAGIC = b"WIND1\r\n\x1a"
HEADER_LENGTH = struct.Struct("<I")
CLOCKS = struct.Struct("<qQ")
TIME_BASES = {"read_return", "legacy_frame_acceptance"}


@dataclass(frozen=True, slots=True)
class Segment:
    header: dict
    records: bytes

    def select(self, start=0, since_ns=None, until_ns=None, message_id=None):
        """Yield (next byte offset, frame); skip unselected payloads without decoding."""
        if not 0 <= start <= len(self.records):
            raise ValueError("record cursor is outside the segment")
        position = start
        while position < len(self.records):
            if len(self.records) - position < CLOCKS.size + 5:
                raise ValueError("truncated frame record")
            utc, mono = CLOCKS.unpack_from(self.records, position)
            start = position + CLOCKS.size
            end = start + 5 + self.records[start + 3]
            if self.records[start:start + 2] != b"\x55\x55" or end > len(self.records):
                raise ValueError("unaligned or truncated frame record")
            if ((since_ns is None or utc >= since_ns)
                    and (until_ns is None or utc <= until_ns)
                    and (message_id is None or self.records[start + 2] == message_id)):
                yield end, Frame(utc, mono, self.records[start:end])
            position = end

    def frames(self) -> Iterator[Frame]:
        """Decode aligned records, without byte-stream resynchronization."""
        for _, frame in self.select():
            yield frame

    def validate(self) -> None:
        """Validate once at import/network boundaries, not on every query."""
        builder = SegmentBuilder(
            self.header["gateway_id"], self.header["channel_id"],
            self.header["session_id"], self.header["time_basis"],
        )
        for frame in self.frames():
            builder.append(frame)
        expected = builder.header(Quality(**self.header["quality"]))
        if self.header != expected:
            raise ValueError("segment header disagrees with its records")

    def compressed(self) -> bytes:
        header = json.dumps(self.header, separators=(",", ":"),
                            ensure_ascii=False, allow_nan=False).encode("utf-8")
        content = MAGIC + HEADER_LENGTH.pack(len(header)) + header + self.records
        return zstd.compress(content, options={
            zstd.CompressionParameter.compression_level: 1,
            zstd.CompressionParameter.checksum_flag: 1,
        })


class SegmentBuilder:
    """Buffer a short segment as packed bytes, not thousands of Python objects."""

    def __init__(self, gateway_id: str, channel_id: str, session_id: str,
                 time_basis: str = "read_return") -> None:
        if not all(isinstance(v, str) and v for v in (gateway_id, channel_id, session_id)):
            raise ValueError("gateway, channel and session labels must be nonempty strings")
        if time_basis not in TIME_BASES:
            raise ValueError("unknown timestamp semantics")
        self.identity = dict(gateway_id=gateway_id, channel_id=channel_id,
                             session_id=session_id, time_basis=time_basis)
        self._records = bytearray()
        self.count = 0
        self.valid_bytes = 0
        self.first_mono = self.last_mono = None
        self.min_utc = self.max_utc = None

    def append(self, frame: Frame) -> None:
        if not valid_frame(frame.raw):
            raise ValueError("segments accept only complete checksum-valid frames")
        if self.last_mono is not None and frame.monotonic_ns < self.last_mono:
            raise ValueError("monotonic clock reset: start a separate segment")
        clocks = CLOCKS.pack(frame.utc_ns, frame.monotonic_ns)
        self._records.extend(clocks)
        self._records.extend(frame.raw)
        if not self.count:
            self.first_mono = frame.monotonic_ns
            self.min_utc = self.max_utc = frame.utc_ns
        self.last_mono = frame.monotonic_ns
        self.min_utc = min(self.min_utc, frame.utc_ns)
        self.max_utc = max(self.max_utc, frame.utc_ns)
        self.count += 1
        self.valid_bytes += len(frame.raw)

    def header(self, quality: Quality) -> dict:
        counts = quality.as_dict()
        if any(type(v) is not int or v < 0 for v in counts.values()):
            raise ValueError("quality counters must be nonnegative integers")
        return {**self.identity, "frame_count": self.count,
                "valid_bytes": self.valid_bytes,
                "start_utc_ns": self.min_utc, "end_utc_ns": self.max_utc,
                "start_monotonic_ns": self.first_mono, "end_monotonic_ns": self.last_mono,
                "quality": counts}

    def seal(self, quality: Quality | None = None) -> Segment:
        return Segment(self.header(quality or Quality()), bytes(self._records))


def load_segment(path: str | Path) -> Segment:
    """Decode standard Zstd, including its checksum; no legacy format dispatch."""
    return decode_segment(Path(path).read_bytes())


def decode_segment(data: bytes, max_output_bytes: int | None = None) -> Segment:
    # RFC 8878 frame descriptor bit 2: our single format requires a checksum.
    if len(data) < 5 or data[:4] != b"\x28\xb5\x2f\xfd" or not data[4] & 4:
        raise ValueError("segment must be a standard Zstd frame with a content checksum")
    decoder = zstd.ZstdDecompressor()
    content = decoder.decompress(data, max_length=-1 if max_output_bytes is None else max_output_bytes + 1)
    if max_output_bytes is not None and len(content) > max_output_bytes:
        raise OverflowError("segment exceeds the decompressed size limit")
    if not decoder.eof or decoder.unused_data:
        raise ValueError("expected one complete Zstd frame without trailing data")
    if len(content) < len(MAGIC) + HEADER_LENGTH.size or content[:len(MAGIC)] != MAGIC:
        raise ValueError("not a WIND1 segment")
    size = HEADER_LENGTH.unpack_from(content, len(MAGIC))[0]
    start = len(MAGIC) + HEADER_LENGTH.size
    end = start + size
    if end > len(content):
        raise ValueError("truncated segment header")
    header = json.loads(content[start:end])
    if not isinstance(header, dict):
        raise ValueError("segment header must be an object")
    return Segment(header, content[end:])


def publish_segment(path: str | Path, segment: Segment) -> None:
    """Publish into a caller-owned directory. Never recover or clean old tails.

    Each writer owns a distinct segment name. An existing final or temporary
    file is an error, not permission to overwrite data.
    """
    publish_bytes(path, segment.compressed())


def publish_bytes(path: str | Path, data: bytes) -> None:
    """Publish already validated bytes with file and parent-directory synchronization."""
    path = Path(path)
    if path.exists():
        raise FileExistsError(path)
    temporary = path.with_name(path.name + ".tmp")
    with temporary.open("xb") as handle:
        handle.write(data)
        handle.flush()
        os.fsync(handle.fileno())
    temporary.rename(path)
    directory = os.open(path.parent, os.O_RDONLY | os.O_DIRECTORY)
    try:
        os.fsync(directory)
    finally:
        os.close(directory)
