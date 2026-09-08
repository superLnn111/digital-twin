import asyncio
import json
import uvicorn
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI()
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

clients = []


@app.websocket("/")
async def ws_root(ws: WebSocket):
    await ws.accept()
    clients.append(ws)
    print(f"[连接] 新客户端 (共{len(clients)}个)")
    try:
        while True:
            data = await ws.receive_text()
            # 收到任何数据都广播给所有客户端
            for client in clients:
                try:
                    await client.send_text(data)
                except Exception:
                    pass
    except WebSocketDisconnect:
        clients.remove(ws)
        print(f"[断开] 客户端离开 (剩余{len(clients)}个)")


@app.websocket("/ws")
async def ws_path(ws: WebSocket):
    await ws.accept()
    clients.append(ws)
    print(f"[连接] 新客户端 (共{len(clients)}个)")
    try:
        while True:
            data = await ws.receive_text()
            for client in clients:
                try:
                    await client.send_text(data)
                except Exception:
                    pass
    except WebSocketDisconnect:
        clients.remove(ws)
        print(f"[断开] 客户端离开 (剩余{len(clients)}个)")


if __name__ == "__main__":
    print("传感器数据服务器启动: ws://0.0.0.0:3001")
    uvicorn.run(app, host="0.0.0.0", port=3001)