"""ATK-IMU901 framing. Its checksum is additive modulo 256, not a CRC."""

from dataclasses import asdict, dataclass
import struct

MAGIC = b"\x55\x55"
MAX_PAYLOAD = 64
REGISTERS = {"SENSTA": 2, "GYROFSR": 3, "ACCFSR": 4, "BAUD": 7,
             "RETURNSET": 8, "RETURNRATE": 10}


@dataclass(frozen=True, slots=True)
class Frame:
    utc_ns: int
    monotonic_ns: int
    raw: bytes

    @property
    def message_id(self) -> int:
        return self.raw[2]


@dataclass(slots=True)
class Quality:
    checksum_errors: int = 0
    length_errors: int = 0
    discarded_bytes: int = 0
    incomplete_bytes: int = 0

    def as_dict(self) -> dict[str, int]:
        return asdict(self)


def valid_frame(raw: bytes) -> bool:
    return (5 <= len(raw) <= MAX_PAYLOAD + 5 and raw[:2] == MAGIC
            and raw[3] + 5 == len(raw) and sum(raw[:-1]) & 255 == raw[-1])


class Parser:
    """Synchronize in RAM; discard noise and retain only an incomplete suffix.

    Each emitted frame receives the timestamp of the read completing it.
    A cursor scans the input once; no per-frame prefix deletion or reslicing.
    Quality counters are cumulative. finish() accounts for an abandoned tail;
    do not call finish() when merely rotating a segment.
    """

    def __init__(self) -> None:
        self.quality = Quality()
        self._pending = b""

    def feed(self, data: bytes, utc_ns: int, monotonic_ns: int) -> list[Frame]:
        data = self._pending + data
        frames = []
        position = 0
        while position < len(data):
            start = data.find(MAGIC, position)
            if start < 0:
                start = len(data) - int(data.endswith(b"\x55"))
                self.quality.discarded_bytes += start - position
                position = start
                break
            self.quality.discarded_bytes += start - position
            position = start
            if len(data) - start < 4:
                break
            length = data[start + 3]
            if length > MAX_PAYLOAD:
                self.quality.length_errors += 1
            elif len(data) - start < length + 5:
                break
            else:
                raw = data[start:start + length + 5]
                if sum(raw[:-1]) & 255 == raw[-1]:
                    frames.append(Frame(utc_ns, monotonic_ns, raw))
                    position = start + length + 5
                    continue
                self.quality.checksum_errors += 1
            position = start + 1
            self.quality.discarded_bytes += 1
        self._pending = data[position:]
        return frames

    @property
    def pending_bytes(self) -> int:
        return len(self._pending)

    def finish(self) -> None:
        self.quality.incomplete_bytes += len(self._pending)
        self._pending = b""


def six_axis(raw: bytes) -> tuple[int, ...]:
    """Return ax, ay, az, gx, gy, gz integers, without assuming sensor ranges."""
    if not valid_frame(raw) or raw[2:4] != b"\x03\x0c":
        raise ValueError("expected a valid six-axis frame")
    return struct.unpack("<6h", raw[4:-1])


def read_register(name: str) -> bytes:
    """Build a read-only request. No configuration write command is exposed."""
    prefix = b"\x55\xaf" + bytes((REGISTERS[name] | 0x80, 1, 0))
    return prefix + bytes((sum(prefix) & 255,))


def register_value(response: bytes) -> tuple[int, int]:
    if (len(response) != 6 or response[:2] != b"\x55\xaf"
            or response[3] != 1 or sum(response[:-1]) & 255 != response[-1]):
        raise ValueError("invalid register response")
    return response[2] & 0x7f, response[4]
