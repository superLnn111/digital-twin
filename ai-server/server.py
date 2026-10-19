# ============================================================
# server.py — AI 智能诊断 WebSocket 服务端
# ============================================================
# 功能：加载训练好的 DANN 模型，读取本地 .npy 传感器数据文件，
#       每2秒自动推理一次，通过 WebSocket 推送给所有连接的前端客户端
# 核心技术：FastAPI（Web框架）、WebSocket（实时通信）、
#           PyTorch/Torch（深度学习推理）
# ============================================================

# --- 第1组：深度学习库 ---
import torch
# torch — PyTorch 主库，用于加载模型和执行神经网络推理
import numpy as np
# numpy — 科学计算库，处理传感器信号的数组运算

# --- 第2组：异步和通信 ---
import asyncio
# asyncio — Python 异步编程库，用于后台任务（auto_diagnose）的非阻塞执行
import json
# json — 把 Python 字典转为 JSON 字符串，通过 WebSocket 发送给前端
import time
# time — 时间工具，用于生成诊断结果的时间戳
import os
# os — 操作系统接口，用于遍历 data/ 目录找 .npy 文件

# --- 第3组：模型架构 ---
from model import FeatureExtractor, Classifier
# 从 model.py 导入 DANN 模型的两个核心组件：
#   FeatureExtractor — 特征提取器（CNN1D），把4096点信号压缩成6400维特征
#   Classifier       — 分类器（全连接层），把6400维特征映射为4个类别的概率

# --- 第4组：Web 服务框架 ---
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
# FastAPI             — Python 高性能 Web 框架（类似 Flask）
# WebSocket           — WebSocket 连接类型
# WebSocketDisconnect — WebSocket 断开异常（用于捕获客户端断开）
from fastapi.middleware.cors import CORSMiddleware
# CORS — 跨域资源共享，允许前端（localhost:5173）访问后端（localhost:8000）
import uvicorn
# uvicorn — ASGI 服务器，用于运行 FastAPI 应用

# ============================================================
# 第1部分：创建 FastAPI 应用 + CORS 配置
# ============================================================
app = FastAPI()
# 创建 FastAPI 应用实例，后续所有路由（/ws, /health）都注册到它上面

# CORS 中间件 — 允许任何来源（*）访问 API
# 不加这个的话，前端 localhost:5173 发请求会被浏览器拦截（跨域安全策略）
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],     # * = 允许所有来源（开发环境用，生产应限制具体域名）
    allow_methods=["*"],     # 允许所有 HTTP 方法（GET, POST 等）
    allow_headers=["*"],     # 允许所有请求头
)

# ============================================================
# 第2部分：设备检测 + 模型加载
# ============================================================

# 设备选择 — 有 GPU（NVIDIA 显卡）就用 CUDA，否则用 CPU
DEVICE = torch.device("cuda" if torch.cuda.is_available() else "cpu")

# 实例化模型并移到指定设备（GPU 或 CPU）
# FeatureExtractor(in_channels=1) — 单通道传感器信号输入
extractor = FeatureExtractor(in_channels=1).to(DEVICE)

# Classifier(in_features=6400, num_classes=4) — 6400维特征 → 4个类别
#   类别0: 叶片裂纹, 类别1: 正常, 类别2: 异物/挂冰, 类别3: 轴承故障
classifier = Classifier(in_features=6400, num_classes=4).to(DEVICE)

# 加载预训练权重（.pth 文件 = PyTorch 模型参数文件）
# torch.load() 读取训练好的模型参数
# map_location=DEVICE 确保文件即使在 GPU 上训练的也能在 CPU 上加载
# load_state_dict() 把参数赋值给模型
extractor.load_state_dict(torch.load("extractor_best.pth", map_location=DEVICE))
classifier.load_state_dict(torch.load("classifier_best.pth", map_location=DEVICE))

# model.eval() — 切换到评估模式（关闭 Dropout、BatchNorm 等训练专用层）
# 推理时必须调用，否则结果会不稳定
extractor.eval()
classifier.eval()

# 类别名称映射 — 数字 0~3 对应的中文标签
CLASS_NAMES = ["叶片裂纹", "正常", "异物/挂冰", "轴承故障"]

# ============================================================
# 第3部分：全局变量
# ============================================================

# 信号缓冲区大小 — 每次推理取 2048 个采样点
# 实际传感器数据是 4096 点的 .npy 文件，这里截取前 2048 点或用0填充
BUFFER_SIZE = 2048

# connected_clients — 存储所有已连接的 WebSocket 客户端列表
# 用于广播诊断结果：一条结果发给所有前端
connected_clients = []


# ============================================================
# 第4部分：核心推理函数
# ============================================================
def run_inference(signal: np.ndarray):
    """
    对一条传感器信号执行 DANN 推理
    参数:
        signal: numpy 数组，形状为 (BUFFER_SIZE,) —— 2048 个采样点
    返回:
        (pred_class, confidence) — (预测类别编号, 置信度 0~1)
    """
    # 第1步：numpy → torch tensor，添加 batch 维度和 channel 维度
    # .float()           — 转为 float32（PyTorch 默认浮点类型）
    # .unsqueeze(0)      — 添加第0维：[2048] → [1, 2048]（batch 维度）
    # .unsqueeze(0)      — 添加第0维：[1, 2048] → [1, 1, 2048]（channel 维度）
    # 最终形状：[batch=1, channel=1, signal_length=2048]
    x = torch.from_numpy(signal).float().unsqueeze(0).unsqueeze(0).to(DEVICE)

    # 第2步：推理（禁用梯度计算，省显存 + 加速）
    with torch.no_grad():
        features = extractor(x)     # 特征提取：CNN1D 卷积 → 6400维特征向量
        logits = classifier(features)  # 分类：6400维 → 4个类别的原始分数
        probs = torch.softmax(logits, dim=1)  # softmax 把分数转为概率（4个概率和为1）
        pred_class = torch.argmax(probs, dim=1).item()  # 取概率最大的类别编号
        confidence = probs[0, pred_class].item()         # 取该类别对应的概率值

    return pred_class, confidence


# ============================================================
# 第5部分：文件扫描函数
# ============================================================
def collect_npy_files(data_dir: str):
    """
    递归扫描 data/ 目录，收集所有 .npy 文件
    参数:
        data_dir: data 目录的路径
    返回:
        所有 .npy 文件的完整路径列表
    """
    files = []
    # os.walk — 递归遍历目录树
    # root      = 当前目录路径
    # _         = 子目录列表（用 _ 表示不关心）
    # filenames = 文件名列表
    for root, _, filenames in os.walk(data_dir):
        for f in filenames:
            if f.endswith(".npy"):  # 只收集 .npy 后缀的文件
                files.append(os.path.join(root, f))  # 拼接完整路径
    return files


# ============================================================
# 第6部分：API 路由定义
# ============================================================

# --- 路由1：WebSocket 端点 ---
# @app.websocket("/ws") — 将 /ws 路径注册为 WebSocket 端点
# 前端通过 ws://localhost:8000/ws 连接到这里
@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket):
    # await ws.accept() — 接收 WebSocket 连接请求，握手完成后进入通信状态
    await ws.accept()
    
    # 将新客户端加入广播列表
    connected_clients.append(ws)
    
    try:
        # 保持连接活跃：循环等待客户端消息
        # 虽然前端不发消息（只收），但这里需要阻塞住，连接才不会断开
        while True:
            await ws.receive_text()  # 等待客户端发来任意文本
    except WebSocketDisconnect:
        # 客户端断开时（切页面/关浏览器），从广播列表中移除
        connected_clients.remove(ws)


# --- 路由2：健康检查端点 ---
# GET /health — 最简单的健康检查，返回服务器状态
@app.get("/health")
def health():
    return {
        "status": "ok",           # 服务正常
        "device": str(DEVICE),    # 当前运行设备（cuda 或 cpu）
        "model": "DANN"            # 使用的模型名称
    }


# ============================================================
# 第7部分：后台自动诊断任务（核心逻辑）
# ============================================================
async def auto_diagnose():
    """
    后台异步任务：无限循环执行诊断
    每2秒：
      1. 扫描 data/ 目录的 .npy 文件
      2. 随机选一个文件
      3. 加载信号 → 标准化 → 推理
      4. 广播结果给所有连接的 WebSocket 客户端
    """
    # 构建 data 目录的绝对路径（相对于当前 server.py 所在目录）
    data_dir = os.path.join(os.path.dirname(__file__), "data")
    
    # 首次扫描 .npy 文件
    npy_files = collect_npy_files(data_dir)
    if not npy_files:
        print("[WARN] 未找到 .npy 数据文件")
        return  # 没文件就直接退出任务
    print(f"[INFO] 找到 {len(npy_files)} 个 .npy 文件，开始自动诊断")

    # 无限循环 — 服务器不停止，诊断不停止
    while True:
        # asyncio.sleep(2) — 异步等待2秒（不阻塞其他请求）
        # 用 asyncio.sleep 而不是 time.sleep，因为后者会阻塞整个服务器
        await asyncio.sleep(2)
        
        # 没有客户端连接时跳过推理，节省 CPU
        if not connected_clients:
            continue
        
        try:
            # 重新扫描文件列表（支持运行时新增文件）
            npy_files = collect_npy_files(data_dir)
            if not npy_files:
                continue
            
            # 用当前时间的 hash 值取模 → "随机"选一个文件
            # hash(str(time.time())) 产生不同的 hash 值
            # % len(npy_files) 限制索引范围
            file_path = npy_files[hash(str(time.time())) % len(npy_files)]
            
            # 加载 .npy 文件，展平为一维数组，截取前 BUFFER_SIZE 个点
            signal = np.load(file_path).flatten()[:BUFFER_SIZE]
            
            # 如果信号太短（< 2048），用 0 在末尾补齐
            if len(signal) < BUFFER_SIZE:
                signal = np.pad(signal, (0, BUFFER_SIZE - len(signal)))
            
            # 标准化（Z-Score）：(x - 均值) / 标准差
            # 使信号均值为0、标准差为1，和训练时的预处理保持一致
            # 加 1e-8 防止除以 0
            signal = (signal - signal.mean()) / (signal.std() + 1e-8)
            
            # 执行 DANN 推理
            pred_class, confidence = run_inference(signal)
            
            # 判断状态：类别1=正常，其他=异常
            status = "正常" if pred_class == 1 else "异常"
            
            # 构建 JSON 结果（和前端 DiagnosisContext 中定义的接口对应）
            result = {
                "time": time.strftime("%Y-%m-%d %H:%M:%S"),      # 时间戳
                "sensor_data": f"{len(signal)} 采样点",           # 传感器信息
                "class": pred_class,                               # 类别编号
                "confidence": round(confidence, 4),                # 置信度（保留4位小数）
                "status": status,                                  # 正常/异常
                "class_name": CLASS_NAMES[pred_class],             # 类别中文名
            }
            
            # 广播 — 遍历所有已连接的客户端，逐个发送
            for ws in connected_clients:
                try:
                    # json.dumps 把 Python 字典转为 JSON 字符串
                    # ensure_ascii=False 保留中文（否则会转成 \uXXXX 编码）
                    await ws.send_text(json.dumps(result, ensure_ascii=False))
                except Exception:
                    pass  # 发送失败就跳过（可能该客户端刚好断开）
                    
        except Exception:
            pass  # 任何未预期的错误都静默跳过，确保循环不中断


# ============================================================
# 第8部分：应用生命周期事件
# ============================================================
# @app.on_event("startup") — 服务器启动后自动执行
# 这里用于启动后台诊断任务
@app.on_event("startup")
async def startup():
    # asyncio.create_task() — 创建一个异步任务，在事件循环中并发运行
    # 这样 auto_diagnose() 在后台跑，不会阻塞正常的 HTTP/WebSocket 请求
    asyncio.create_task(auto_diagnose())


# ============================================================
# 第9部分：程序入口
# ============================================================
# __name__ == "__main__" — 当直接运行 python server.py 时执行
# （如果是被 import 导入则不执行）
if __name__ == "__main__":
    # uvicorn.run — 启动 ASGI 服务器
    # app              — FastAPI 应用实例
    # host="0.0.0.0"  — 监听所有网络接口（可以从局域网其他机器访问）
    # port=8000        — 端口号（前端 WebSocket 连接 ws://localhost:8000/ws）
    uvicorn.run(app, host="0.0.0.0", port=8000)