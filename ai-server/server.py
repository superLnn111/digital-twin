import torch
import numpy as np
import asyncio
import json
import time
import os
from model import FeatureExtractor, Classifier
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
import uvicorn

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# 设备
DEVICE = torch.device("cuda" if torch.cuda.is_available() else "cpu")

# 加载模型
extractor = FeatureExtractor(in_channels=1).to(DEVICE)
classifier = Classifier(in_features=6400, num_classes=4).to(DEVICE)

extractor.load_state_dict(torch.load("extractor_best.pth", map_location=DEVICE))
classifier.load_state_dict(torch.load("classifier_best.pth", map_location=DEVICE))
extractor.eval()
classifier.eval()

CLASS_NAMES = ["叶片裂纹", "正常", "异物/挂冰", "轴承故障"]

# 信号缓冲区：累积 2048 个采样点后推理一次
BUFFER_SIZE = 2048

connected_clients = []


def run_inference(signal: np.ndarray):
    x = torch.from_numpy(signal).float().unsqueeze(0).unsqueeze(0).to(DEVICE)
    with torch.no_grad():
        features = extractor(x)
        logits = classifier(features)
        probs = torch.softmax(logits, dim=1)
        pred_class = torch.argmax(probs, dim=1).item()
        confidence = probs[0, pred_class].item()
    return pred_class, confidence

def collect_npy_files(data_dir: str):
    files = []
    for root, _, filenames in os.walk(data_dir):
        for f in filenames:
            if f.endswith(".npy"):
                files.append(os.path.join(root, f))
    return files

@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket):
    await ws.accept()
    connected_clients.append(ws)
    try:
        while True:
            await ws.receive_text()
    except WebSocketDisconnect:
        connected_clients.remove(ws)


@app.get("/health")
def health():
    return {"status": "ok", "device": str(DEVICE), "model": "DANN"}

# 后台任务：从本地 .npy 文件读取信号，定时推送给所有连接的客户端
async def auto_diagnose():
    data_dir = os.path.join(os.path.dirname(__file__), "data")
    npy_files = collect_npy_files(data_dir)
    if not npy_files:
        print("[WARN] 未找到 .npy 数据文件")
        return
    print(f"[INFO] 找到 {len(npy_files)} 个 .npy 文件，开始自动诊断")

    while True:
        await asyncio.sleep(2)
        if not connected_clients:
            continue
        try:
            npy_files = collect_npy_files(data_dir)
            if not npy_files:
                continue
            file_path = npy_files[hash(str(time.time())) % len(npy_files)]
            signal = np.load(file_path).flatten()[:BUFFER_SIZE]
            if len(signal) < BUFFER_SIZE:
                signal = np.pad(signal, (0, BUFFER_SIZE - len(signal)))
            signal = (signal - signal.mean()) / (signal.std() + 1e-8)
            pred_class, confidence = run_inference(signal)
            status = "正常" if pred_class == 1 else "异常"
            result = {
                "time": time.strftime("%Y-%m-%d %H:%M:%S"),
                "sensor_data": f"{len(signal)} 采样点",
                "class": pred_class,
                "confidence": round(confidence, 4),
                "status": status,
                "class_name": CLASS_NAMES[pred_class],
            }
            for ws in connected_clients:
                try:
                    await ws.send_text(json.dumps(result, ensure_ascii=False))
                except Exception:
                    pass
        except Exception:
            pass


@app.on_event("startup")
async def startup():
    asyncio.create_task(auto_diagnose())

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)