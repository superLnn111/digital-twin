"""Authenticated HTTP and WebSocket interfaces; one Uvicorn process."""

import argparse
import asyncio
from compression import zstd
import hashlib
import hmac
import json
from pathlib import Path
import time

from fastapi import Depends, FastAPI, HTTPException, Request, WebSocket, WebSocketDisconnect
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
import uvicorn

from .store import Conflict, MAX_UPLOAD, Store


class PageQuery(BaseModel):
    gateway_id: str
    channel_id: str
    session_id: str | None = None
    since_ns: int | None = Field(default=None, ge=-(1 << 63), le=(1 << 63) - 1)
    until_ns: int | None = Field(default=None, ge=-(1 << 63), le=(1 << 63) - 1)
    message_id: int | None = Field(default=None, ge=0, le=255)
    cursor: str | None = None
    limit: int = Field(default=100, ge=1, le=1000)


def create_app(root, credentials):
    store = Store(root)
    secrets = json.loads(Path(credentials).read_text())
    gateways, read_digest = secrets["gateways"], secrets["read_token_sha256"]
    for digest in [read_digest, *gateways.values()]:
        if not isinstance(digest, str) or len(digest) != 64 or any(c not in "0123456789abcdef" for c in digest):
            raise ValueError("credentials contain an invalid SHA-256 token digest")
    if len(set(gateways.values())) != len(gateways) or read_digest in gateways.values():
        raise ValueError("use distinct gateway and read tokens")
    live = {}
    app = FastAPI(title="Wind monitoring", version="0.1.0", docs_url=None, redoc_url=None, openapi_url=None)

    def digest_token(token):
        return hashlib.sha256(token.encode()).hexdigest()

    def bearer(request):
        authorization = request.headers.get("authorization", "")
        if not authorization.startswith("Bearer "):
            raise HTTPException(401, "Bearer token required")
        return digest_token(authorization[7:])

    def reader(request: Request):
        if not hmac.compare_digest(bearer(request), read_digest):
            raise HTTPException(401, "invalid read token")

    def gateway(request):
        supplied = bearer(request)
        for name, digest in gateways.items():
            if hmac.compare_digest(supplied, digest):
                return name
        raise HTTPException(401, "invalid gateway token")

    async def body(request, limit):
        output = bytearray()
        async for chunk in request.stream():
            output.extend(chunk)
            if len(output) > limit:
                raise HTTPException(413, "request body exceeds the documented limit")
        return bytes(output)

    def snapshots():
        return [{"gateway_id": name, "online": name in live and time.monotonic() - live[name][0] < 5,
                 "received_utc_ns": live[name][1] if name in live else None,
                 "status": live[name][2] if name in live else None} for name in gateways]

    @app.exception_handler(ValueError)
    async def invalid(_request, error):
        return JSONResponse({"detail": str(error)}, status_code=400)

    @app.get("/health", dependencies=[Depends(reader)])
    def health():
        return {"ok": True}

    @app.get("/openapi.json", dependencies=[Depends(reader)])
    def openapi():
        return app.openapi()

    @app.put("/api/segments/{segment_id}")
    async def ingest(segment_id: str, request: Request):
        owner = gateway(request)
        data = await body(request, MAX_UPLOAD)
        try:
            created = await asyncio.to_thread(store.ingest, segment_id, data, owner)
        except Conflict as error:
            raise HTTPException(409, str(error)) from error
        except PermissionError as error:
            raise HTTPException(403, str(error)) from error
        except OverflowError as error:
            raise HTTPException(413, str(error)) from error
        except (KeyError, TypeError, zstd.ZstdError) as error:
            raise HTTPException(400, "invalid segment header") from error
        return JSONResponse({"segment_id": segment_id, "stored": True, "created": created},
                            status_code=201 if created else 200)

    @app.post("/api/gateways/{gateway_id}/status")
    async def status(gateway_id: str, request: Request):
        if gateway(request) != gateway_id:
            raise HTTPException(403, "token cannot report for this gateway")
        value = json.loads(await body(request, 64 * 1024))
        if not isinstance(value, dict) or not isinstance(value.get("channels"), dict):
            raise ValueError("status requires a channels object")
        live[gateway_id] = (time.monotonic(), str(time.time_ns()), value)
        return {"accepted": True}

    @app.get("/api/gateways", dependencies=[Depends(reader)])
    def gateway_list():
        return {"gateways": snapshots()}

    @app.get("/api/sessions", dependencies=[Depends(reader)])
    def sessions(gateway_id: str | None = None):
        return {"sessions": store.sessions(gateway_id)}

    @app.get("/api/frames", dependencies=[Depends(reader)])
    def frames(query: PageQuery = Depends()):
        return JSONResponse(store.page(**query.model_dump()))

    async def ws_auth(socket):
        await socket.accept()
        try:
            message = await asyncio.wait_for(socket.receive_json(), timeout=5)
            token = message.get("token") if isinstance(message, dict) else None
            if not isinstance(token, str) or not hmac.compare_digest(digest_token(token), read_digest):
                raise ValueError("invalid read token")
        except (ValueError, TimeoutError):
            await socket.close(code=1008)
            return False
        return True

    @app.websocket("/api/replay")
    async def replay(socket: WebSocket, query: PageQuery = Depends()):
        try:
            if not await ws_auth(socket):
                return
            while True:
                page = await asyncio.to_thread(store.page, **query.model_dump())
                await socket.send_json({"type": "frames", **page})
                if page["next_cursor"] is None:
                    await socket.close(code=1000)
                    return
                query.cursor = page["next_cursor"]
        except WebSocketDisconnect:
            return
        except ValueError as error:
            await socket.send_json({"type": "error", "detail": str(error)})
            await socket.close(code=1008)

    @app.websocket("/api/live")
    async def live_stream(socket: WebSocket):
        try:
            if not await ws_auth(socket):
                return
            while True:
                await socket.send_json({"type": "status", "gateways": snapshots()})
                await asyncio.sleep(1)
        except WebSocketDisconnect:
            return

    return app


def main():
    cli = argparse.ArgumentParser(description=__doc__)
    cli.add_argument("--data-dir", type=Path, required=True)
    cli.add_argument("--credentials", type=Path, required=True)
    cli.add_argument("--host", default="127.0.0.1")
    cli.add_argument("--port", type=int, default=8101)
    args = cli.parse_args()
    uvicorn.run(create_app(args.data_dir, args.credentials), host=args.host, port=args.port,
                workers=1, ws="websockets", ws_max_size=64 * 1024, ws_max_queue=1,
                timeout_graceful_shutdown=1, access_log=False)


if __name__ == "__main__":
    main()
