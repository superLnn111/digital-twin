#!/usr/bin/env python3
"""Zero-dependency contract-faithful local backend for wind-monitoring frontend development.

Runs on Python 3.10+ standard library only (no pip/Nix dependencies required).
Implements all HTTP and WebSocket endpoints from contracts/api-contract.md:
  - GET /health
  - GET /openapi.json
  - GET /api/gateways
  - GET /api/sessions
  - GET /api/frames (including 2-segments-per-page cursor pagination & empty-page hops)
  - WS  /api/live   (5s first-message token auth + 1 Hz live status stream)
  - WS  /api/replay (5s first-message token auth + paged frame push + 1008/1000 close semantics)

Supports both direct paths (/api/...) and proxy-prefixed paths (/wind-v2/api/...).
Default Read Token: wind-dev-token
"""

from __future__ import annotations

import argparse
import asyncio
import base64
import hashlib
import hmac
import json
import math
import struct
import time
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlparse

HERE = Path(__file__).resolve().parent
CONTRACTS_DIR = HERE.parent / "contracts"
DECODED_PATH = HERE / "sample-segments-decoded.json"
OPENAPI_PATH = CONTRACTS_DIR / "openapi.json"
SEGMENTS_PER_PAGE = 2


def make_imu_frame_hex(msg_id: int, values: list[int]) -> str:
    payload = struct.pack(f"<{len(values)}h", *[max(-32768, min(32767, int(v))) for v in values])
    header = bytes([0x55, 0x55, msg_id & 0xFF, len(payload)])
    body = header + payload
    checksum = sum(body) & 0xFF
    return (body + bytes([checksum])).hex()


class MockStore:
    def __init__(self, decoded_file: Path, openapi_file: Path) -> None:
        raw = json.loads(decoded_file.read_text(encoding="utf-8"))
        self.segments: list[dict] = sorted(
            raw["segments"],
            key=lambda s: (s["header"]["start_utc_ns"], s["segment_id"]),
        )
        self.openapi = json.loads(openapi_file.read_text(encoding="utf-8"))
        self.boot_utc_ns = time.time_ns() - 3600 * 1_000_000_000
        self.start_mono = time.monotonic()
        self.tick = 0

    def live_gateways(self) -> list[dict]:
        self.tick += 1
        now_ns = time.time_ns()
        mono_ns = int((time.monotonic() - self.start_mono) * 1e9)
        uptime_sec = round((now_ns - self.boot_utc_ns) / 1e9, 3)
        channels_obj = {}
        for idx, ch in enumerate(["usb-if00", "usb-if02", "usb-if04", "usb-if06"]):
            phase = self.tick * 0.25 + idx * 0.7
            ax = int(math.sin(phase) * 700 + idx * 60)
            ay = int(math.cos(phase * 1.2) * 540)
            az = 8192 + int(math.sin(phase * 2.0) * 190)
            gx = int(math.sin(phase) * 320)
            gy = int(math.cos(phase) * 260)
            gz = int(math.sin(phase * 0.5) * 410)
            channels_obj[ch] = {
                "updated_utc_ns": str(now_ns - 50_000_000),
                "running": True,
                "frames": 1200 + self.tick * 50,
                "segments": 3,
                "quality": {
                    "checksum_errors": 1 if ch == "usb-if04" else 0,
                    "length_errors": 0,
                    "discarded_bytes": 4 if ch == "usb-if04" else 0,
                    "incomplete_bytes": 0,
                },
                "read_bytes": (1200 + self.tick * 50) * 17,
                "queue_bytes": 0,
                "queue_peak_bytes": 512,
                "latest": {
                    "utc_ns": str(now_ns - 50_000_000),
                    "monotonic_ns": str(mono_ns),
                    "message_id": 3,
                    "raw_hex": make_imu_frame_hex(0x03, [ax, ay, az, gx, gy, gz]),
                },
            }
        return [
            {
                "gateway_id": "rpi5",
                "online": True,
                "received_utc_ns": str(now_ns),
                "status": {
                    "channels": channels_obj,
                    "host": {
                        "boot_utc_ns": str(self.boot_utc_ns),
                        "uptime_sec": uptime_sec,
                        "cpu_temp_mc": 62400 + int(math.sin(self.tick * 0.1) * 1200),
                        "disk_used_percent": 28.4,
                        "throttled_hex": "0x0",
                        "ext5v_v": round(4.985 + math.sin(self.tick * 0.2) * 0.012, 4),
                        "undervoltage_alarm": False,
                        "firmware_sample_utc_ns": str(now_ns - (self.tick % 30) * 1_000_000_000),
                    },
                },
            }
        ]

    def sessions(self, gateway_id: str | None = None) -> list[dict]:
        grouped: dict[tuple[str, str], list[dict]] = {}
        for s in self.segments:
            h = s["header"]
            if gateway_id and h["gateway_id"] != gateway_id:
                continue
            key = (h["gateway_id"], h["session_id"])
            grouped.setdefault(key, []).append(h)
        out = []
        for (gw, sess), headers in sorted(grouped.items()):
            starts = [h["start_utc_ns"] for h in headers if h["start_utc_ns"] is not None]
            ends = [h["end_utc_ns"] for h in headers if h["end_utc_ns"] is not None]
            out.append({
                "gateway_id": gw,
                "session_id": sess,
                "segments": len(headers),
                "frames": sum(h["frame_count"] for h in headers),
                "start_ns": str(min(starts)) if starts else None,
                "end_ns": str(max(ends)) if ends else None,
                "checksum_errors": sum(h["quality"]["checksum_errors"] for h in headers),
                "length_errors": sum(h["quality"]["length_errors"] for h in headers),
                "discarded_bytes": sum(h["quality"]["discarded_bytes"] for h in headers),
                "incomplete_bytes": sum(h["quality"]["incomplete_bytes"] for h in headers),
            })
        return out

    def page(
        self,
        gateway_id: str,
        channel_id: str,
        session_id: str | None = None,
        since_ns: int | None = None,
        until_ns: int | None = None,
        message_id: int | None = None,
        cursor: str | None = None,
        limit: int = 100,
    ) -> dict:
        if not (1 <= limit <= 1000) or (message_id is not None and not (0 <= message_id <= 255)):
            raise ValueError("limit must be 1..1000 and message_id 0..255")
        if since_ns is not None and until_ns is not None and since_ns > until_ns:
            raise ValueError("since_ns must not exceed until_ns")

        matching = []
        for s in self.segments:
            h = s["header"]
            if h["gateway_id"] != gateway_id or h["channel_id"] != channel_id or h["frame_count"] <= 0:
                continue
            if session_id is not None and h["session_id"] != session_id:
                continue
            if since_ns is not None and h["end_utc_ns"] < since_ns:
                continue
            if until_ns is not None and h["start_utc_ns"] > until_ns:
                continue
            matching.append(s)

        start_idx = 0
        cursor_id = None
        if cursor:
            if ":" not in cursor:
                raise ValueError("cursor is outside this query")
            cursor_id, off_str = cursor.split(":", 1)
            try:
                start_idx = int(off_str)
            except ValueError as err:
                raise ValueError("cursor is outside this query") from err
            found = None
            for idx, s in enumerate(matching):
                if s["segment_id"] == cursor_id:
                    found = idx
                    break
            if found is None or start_idx < 0:
                raise ValueError("cursor is outside this query")
            matching = matching[found:]

        rows = matching[: SEGMENTS_PER_PAGE + 1]
        frames = []
        for seg_i, seg in enumerate(rows[:SEGMENTS_PER_PAGE]):
            seg_id = seg["segment_id"]
            rec_list = seg["frames"]
            offset = start_idx if seg_id == cursor_id else 0
            if offset > len(rec_list):
                raise ValueError("record cursor is outside the segment")
            for rec_i in range(offset, len(rec_list)):
                f = rec_list[rec_i]
                utc_int = int(f["utc_ns"])
                if since_ns is not None and utc_int < since_ns:
                    continue
                if until_ns is not None and utc_int > until_ns:
                    continue
                if message_id is not None and f["message_id"] != message_id:
                    continue
                frames.append({
                    "segment_id": seg_id,
                    "session_id": seg["header"]["session_id"],
                    "utc_ns": f["utc_ns"],
                    "monotonic_ns": f["monotonic_ns"],
                    "message_id": f["message_id"],
                    "raw_hex": f["raw_hex"],
                    "time_basis": seg["header"]["time_basis"],
                })
                after = rec_i + 1
                if len(frames) == limit:
                    next_cursor = (
                        f"{seg_id}:{after}"
                        if after < len(rec_list)
                        else f"{rows[seg_i + 1]['segment_id']}:0"
                        if seg_i + 1 < len(rows)
                        else None
                    )
                    return {"frames": frames, "next_cursor": next_cursor}

        return {
            "frames": frames,
            "next_cursor": f"{rows[SEGMENTS_PER_PAGE]['segment_id']}:0"
            if len(rows) > SEGMENTS_PER_PAGE
            else None,
        }


# Minimal RFC 6455 WebSocket helpers (stdlib only)
WS_GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"


async def ws_send_frame(writer: asyncio.StreamWriter, opcode: int, payload: bytes) -> None:
    head = bytearray([0x80 | (opcode & 0x0F)])
    n = len(payload)
    if n < 126:
        head.append(n)
    elif n < 65536:
        head.append(126)
        head.extend(struct.pack("!H", n))
    else:
        head.append(127)
        head.extend(struct.pack("!Q", n))
    writer.write(bytes(head) + payload)
    await writer.drain()


async def ws_send_json(writer: asyncio.StreamWriter, obj: dict) -> None:
    data = json.dumps(obj, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    await ws_send_frame(writer, 0x1, data)


async def ws_close(writer: asyncio.StreamWriter, code: int = 1000) -> None:
    try:
        await ws_send_frame(writer, 0x8, struct.pack("!H", code))
    except Exception:
        pass
    try:
        writer.close()
        await writer.wait_closed()
    except Exception:
        pass


async def ws_recv_text(reader: asyncio.StreamReader) -> str | None:
    while True:
        hdr = await reader.readexactly(2)
        opcode = hdr[0] & 0x0F
        masked = (hdr[1] & 0x80) != 0
        length = hdr[1] & 0x7F
        if length == 126:
            length = struct.unpack("!H", await reader.readexactly(2))[0]
        elif length == 127:
            length = struct.unpack("!Q", await reader.readexactly(8))[0]
        if length > 64 * 1024:
            raise ValueError("frame too large")
        mask = await reader.readexactly(4) if masked else b""
        data = bytearray(await reader.readexactly(length))
        if masked:
            for i in range(length):
                data[i] ^= mask[i & 3]
        if opcode == 0x8:
            return None
        if opcode == 0x1:
            return data.decode("utf-8")


def parse_page_query(qs: dict[str, list[str]]) -> dict:
    def one(k: str) -> str | None:
        v = qs.get(k)
        return v[0] if v else None

    gw = one("gateway_id")
    ch = one("channel_id")
    if not gw or not ch:
        raise ValueError("gateway_id and channel_id are required")
    return {
        "gateway_id": gw,
        "channel_id": ch,
        "session_id": one("session_id"),
        "since_ns": int(one("since_ns")) if one("since_ns") is not None else None,
        "until_ns": int(one("until_ns")) if one("until_ns") is not None else None,
        "message_id": int(one("message_id")) if one("message_id") is not None else None,
        "cursor": one("cursor"),
        "limit": int(one("limit")) if one("limit") is not None else 100,
    }


async def handle_client(
    reader: asyncio.StreamReader,
    writer: asyncio.StreamWriter,
    store: MockStore,
    expected_token: str,
) -> None:
    try:
        raw_head = await reader.readuntil(b"\r\n\r\n")
    except Exception:
        writer.close()
        return

    lines = raw_head.decode("latin-1").split("\r\n")
    if not lines or not lines[0]:
        writer.close()
        return
    parts = lines[0].split(" ")
    if len(parts) < 2:
        writer.close()
        return
    method, raw_target = parts[0].upper(), parts[1]
    headers: dict[str, str] = {}
    for line in lines[1:]:
        if ":" in line:
            k, v = line.split(":", 1)
            headers[k.strip().lower()] = v.strip()

    parsed = urlparse(raw_target)
    path = unquote(parsed.path)
    if path.startswith("/wind-v2/"):
        path = path[len("/wind-v2") :]
    elif path == "/wind-v2":
        path = "/"
    qs = parse_qs(parsed.query)

    # CORS preflight
    if method == "OPTIONS":
        resp = (
            "HTTP/1.1 204 No Content\r\n"
            "Access-Control-Allow-Origin: *\r\n"
            "Access-Control-Allow-Headers: Authorization, Content-Type, Accept\r\n"
            "Access-Control-Allow-Methods: GET, POST, PUT, OPTIONS\r\n"
            "Connection: close\r\n\r\n"
        )
        writer.write(resp.encode("latin-1"))
        await writer.drain()
        writer.close()
        return

    # WebSocket upgrade
    if headers.get("upgrade", "").lower() == "websocket" and path in ("/api/live", "/api/replay"):
        ws_key = headers.get("sec-websocket-key", "")
        accept = base64.b64encode(hashlib.sha1((ws_key + WS_GUID).encode("ascii")).digest()).decode("ascii")
        handshake = (
            "HTTP/1.1 101 Switching Protocols\r\n"
            "Upgrade: websocket\r\n"
            "Connection: Upgrade\r\n"
            f"Sec-WebSocket-Accept: {accept}\r\n\r\n"
        )
        writer.write(handshake.encode("latin-1"))
        await writer.drain()

        # First-message authentication within 5s
        try:
            first_msg = await asyncio.wait_for(ws_recv_text(reader), timeout=5.0)
            if first_msg is None:
                await ws_close(writer, 1008)
                return
            payload = json.loads(first_msg)
            token = payload.get("token") if isinstance(payload, dict) else None
            if not isinstance(token, str) or not hmac.compare_digest(token, expected_token):
                await ws_close(writer, 1008)
                return
        except Exception:
            await ws_close(writer, 1008)
            return

        if path == "/api/live":
            try:
                while True:
                    await ws_send_json(writer, {"type": "status", "gateways": store.live_gateways()})
                    await asyncio.sleep(1.0)
            except Exception:
                return
        else:
            try:
                q = parse_page_query(qs)
                while True:
                    page = store.page(**q)
                    await ws_send_json(writer, {"type": "frames", **page})
                    if page["next_cursor"] is None:
                        await ws_close(writer, 1000)
                        return
                    q["cursor"] = page["next_cursor"]
                    await asyncio.sleep(0.01)
            except ValueError as err:
                try:
                    await ws_send_json(writer, {"type": "error", "detail": str(err)})
                except Exception:
                    pass
                await ws_close(writer, 1008)
                return
            except Exception:
                return

    # HTTP Bearer auth check
    def send_json(status: int, reason: str, body_obj: dict) -> bytes:
        raw_body = json.dumps(body_obj, ensure_ascii=False).encode("utf-8")
        head = (
            f"HTTP/1.1 {status} {reason}\r\n"
            "Content-Type: application/json; charset=utf-8\r\n"
            f"Content-Length: {len(raw_body)}\r\n"
            "Access-Control-Allow-Origin: *\r\n"
            "Connection: close\r\n\r\n"
        ).encode("latin-1")
        return head + raw_body

    auth = headers.get("authorization", "")
    if not auth.startswith("Bearer "):
        writer.write(send_json(401, "Unauthorized", {"detail": "Bearer token required"}))
        await writer.drain()
        writer.close()
        return
    if not hmac.compare_digest(auth[7:], expected_token):
        writer.write(send_json(401, "Unauthorized", {"detail": "invalid read token"}))
        await writer.drain()
        writer.close()
        return

    try:
        if method == "GET" and path == "/health":
            writer.write(send_json(200, "OK", {"ok": True}))
        elif method == "GET" and path == "/openapi.json":
            writer.write(send_json(200, "OK", store.openapi))
        elif method == "GET" and path == "/api/gateways":
            writer.write(send_json(200, "OK", {"gateways": store.live_gateways()}))
        elif method == "GET" and path == "/api/sessions":
            gw = qs.get("gateway_id", [None])[0]
            writer.write(send_json(200, "OK", {"sessions": store.sessions(gw)}))
        elif method == "GET" and path == "/api/frames":
            q = parse_page_query(qs)
            writer.write(send_json(200, "OK", store.page(**q)))
        else:
            writer.write(send_json(404, "Not Found", {"detail": f"Unknown route: {method} {path}"}))
    except ValueError as err:
        writer.write(send_json(400, "Bad Request", {"detail": str(err)}))
    await writer.drain()
    writer.close()


async def run_server(host: str, port: int, token: str) -> None:
    store = MockStore(DECODED_PATH, OPENAPI_PATH)
    server = await asyncio.start_server(
        lambda r, w: handle_client(r, w, store, token),
        host=host,
        port=port,
    )
    print("=" * 72)
    print(f"[wind-mock-backend] Listening on http://{host}:{port} (and /wind-v2 prefix)")
    print(f"[wind-mock-backend] Read Token : {token}")
    print(f"[wind-mock-backend] Sessions   : {store.sessions()}")
    print("=" * 72)
    async with server:
        await server.serve_forever()


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--host", default="127.0.0.1")
    p.add_argument("--port", type=int, default=8101)
    p.add_argument("--token", default="wind-dev-token")
    args = p.parse_args()
    asyncio.run(run_server(args.host, args.port, args.token))


if __name__ == "__main__":
    main()
