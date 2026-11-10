#!/usr/bin/env python3
"""Start wind-cloud on 127.0.0.1:8101 over archived .wind.zst segments with a known read token."""

import argparse
import hashlib
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
for sub in ("proto/src", "cloud/src", "gateway/src", "analysis/src"):
    sys.path.insert(0, str(ROOT / sub))

import uvicorn  # noqa: E402
from wind_cloud.app import create_app  # noqa: E402
from wind_cloud.store import Store  # noqa: E402
from wind_proto import load_segment  # noqa: E402


def sha256_hex(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Index archived .wind.zst files (if needed) and serve wind-cloud on 127.0.0.1:8101."
    )
    parser.add_argument(
        "--data-dir",
        type=Path,
        required=True,
        help="Cloud data directory (either an existing cloud dir with index.sqlite3, or a new dir to store indexed segments).",
    )
    parser.add_argument(
        "--import-dir",
        type=Path,
        default=None,
        help="Optional directory (or verification.json) to recursively import *.wind.zst segments from.",
    )
    parser.add_argument(
        "--token",
        default="wind-dev-token",
        help="Plaintext Read Token to use in the web UI (default: wind-dev-token).",
    )
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8101)
    args = parser.parse_args()

    data_dir: Path = args.data_dir.resolve()
    data_dir.mkdir(parents=True, exist_ok=True)
    (data_dir / "segments").mkdir(exist_ok=True)

    store = Store(data_dir)
    gateways: set[str] = set()

    if args.import_dir is not None:
        src = args.import_dir.resolve()
        zst_paths: list[Path] = []
        if src.is_file() and src.suffix == ".json":
            meta = json.loads(src.read_text())
            for sess in meta.get("sessions", []):
                for stream in sess.get("streams", []):
                    zst_paths.extend(sorted(Path(stream["directory"]).glob("*.wind.zst")))
        else:
            zst_paths = sorted(
                p for p in src.rglob("*.wind.zst") if p.parent != (data_dir / "segments")
            )

        print(f"[serve_archive] 发现 {len(zst_paths)} 个 .wind.zst 历史段文件，正在导入索引...")
        imported = 0
        for path in zst_paths:
            body = path.read_bytes()
            seg_id = hashlib.sha256(body).hexdigest()
            header = load_segment(path).header
            gw = header["gateway_id"]
            gateways.add(gw)
            if store.ingest(seg_id, body, gw):
                imported += 1
        print(f"[serve_archive] 导入完成：新增 {imported} 段（共扫描 {len(zst_paths)} 段）")

    sessions = store.sessions()
    for s in sessions:
        gateways.add(s["gateway_id"])
    if not gateways:
        gateways.add("rpi5")

    auth_file = data_dir / "auth.dev.json"
    auth_payload = {
        "gateways": {gw: sha256_hex(f"gw-token-{gw}-{args.token}") for gw in sorted(gateways)},
        "read_token_sha256": sha256_hex(args.token),
    }
    auth_file.write_text(json.dumps(auth_payload, indent=2))
    auth_file.chmod(0o600)

    print("=" * 68)
    print(f"后端服务地址 : http://{args.host}:{args.port}")
    print(f"前端 Read Token (直接复制到网页「凭证与设置」): {args.token}")
    print(f"当前已索引历史批次 ({len(sessions)} 个):")
    if not sessions:
        print("  (当前 data-dir 暂无历史段，可用 --import-dir 指定包含 .wind.zst 的目录)")
    for s in sessions:
        print(
            f"  - gateway={s['gateway_id']} | session={s['session_id']} | "
            f"segments={s['segments']} | frames={s['frames']}"
        )
    print("=" * 68)

    app = create_app(data_dir, auth_file)
    uvicorn.run(
        app,
        host=args.host,
        port=args.port,
        workers=1,
        ws="websockets",
        ws_max_size=64 * 1024,
        ws_max_queue=1,
        timeout_graceful_shutdown=1,
        access_log=False,
    )


if __name__ == "__main__":
    main()
