# WIND-MONITORING v2 前端开发与后端对接交接包（Agent 专用手册）

> **致正在阅读本文件的 AI Coding Agent（Claude Code / Codex / Cursor / Windsurf / Antigravity）**：
> 你正在协助组员开发或定制「微型风力机多模态状态监测与数字孪生平台（`wind-monitoring` v2）」的 Web 前端。
> 本交接包已经为你准备好**权威后端契约、OpenAPI 定义、真实请求/响应 JSON 样例、可直接复用的 TypeScript 纯函数 SDK（含 46 项单测）、零依赖本地沙盒后端与完整参考前端工程**。
> 请在动手写任何代码前完整阅读本文件。

---

## 1. 交接包目录地图（先看这里）

- `AGENTS.md` / `00_给Agent_先读我.md`：本文件，面向 Agent 的全局契约红线、接口速查与本地联调指南。
- `contracts/`：权威契约与 Schema
  - `contracts/api-contract.md`：后端 HTTP 与 WebSocket 权威接口合同（必读）。
  - `contracts/openapi.json`：由 `wind-cloud` 导出的机器可读 OpenAPI 3.1 定义。
  - `contracts/wire-examples.json`：所有 HTTP 路由与 WebSocket 消息的真实 JSON 载荷样例（含空页游标、1008 错误区分等边缘场景）。
  - `contracts/storage-and-architecture.md`：后端存储、`.wind.zst` 段结构与网关采集边界说明。
  - `contracts/frontend-cleanroom-spec.md`：前端功能目标与架构边界规格说明。
  - `contracts/nginx-wind-monitoring.conf`：生产环境 Nginx 路由定义（`/v2-ui/`、`/wind-v2/`、`/v2-ui/live.mjpeg`）。
- `reference-ts-sdk/`：**可直接复制进任何前端工程（React / Vue / Svelte / Three.js）的零 UI 耦合 TypeScript 核心层（已通过全部 Vitest 单测）**
  - `protocol/imu.ts`（及 `imu.test.ts`）：ATK-IMU901 十六进制帧纯函数解析器（`0x55 0x55` 帧头、小端 `int16`、校验和、`0x01` 姿态角、`0x02` 四元数、`0x03` 六轴与量程换算、`0x06` 端口状态）。
  - `api/types.ts`、`api/client.ts`、`api/ws.ts`：全类型 HTTP Bearer 客户端、WebSocket 首消息认证封装与 1008 关闭码分类器 `classifyClose`。
  - `lib/ns.ts`（及 `ns.test.ts`）：基于 `BigInt` 的纳秒字符串无损解析、时间差计算与格式化工具。
  - `lib/cursor.ts`（及 `cursor.test.ts`）：严格处理“空页但 `next_cursor !== null` 必须继续翻页”的游标循环工具 `followCursor`。
  - `lib/host.ts`、`lib/throttled.ts`、`lib/quality.ts`、`lib/stats.ts`、`lib/ring.ts`：树莓派 5 `status.host` 遥测判读、`vcgencmd get_throttled` 位掩码解码、重启抖动容忍、质量计数增量差分与去直流向量 RMS 计算。
  - `replay/stream.ts`、`replay/player.ts`（及 `replay.test.ts`）：带高低水位有界队列（2000 帧暂停断开记住游标、1000 帧重连续接）的 `/api/replay` 流控制器与多通道共享时间轴播放器。
  - `sim/simulator.ts`（及 `simulator.test.ts`）：脱机仿真信号发生器（生成符合真实 `0x55 0x55` 协议的帧）。
- `local-backend/`：**本地一键启动的后端沙盒与真实样本数据**
  - `standalone_mock_backend.py`：**零第三方依赖（仅需 Python 3.10+ 标准库，Windows / macOS / Linux 直接运行）**的完整契约沙盒后端，支持全部 HTTP 路由与 RFC 6455 WebSocket（`/api/live`、`/api/replay`）。
  - `serve_archive.py` + `proto/` + `cloud/`：生产同款 `wind-cloud` 后端源码（需 Python 3.15 + FastAPI + Uvicorn）。
  - `sample-segments/*.wind.zst` & `sample-segments-decoded.json`：12 个涵盖四通道（`usb-if00`、`usb-if02`、`usb-if04`、`usb-if06`）的真实格式样本段（其中 `usb-if00` 的前两段专门构造了仅含 `0x01` 姿态帧的场景，用于测试查询 `message_id=3` 时的“空页非 null 游标继续翻页”逻辑）。
- `reference-web-app/`：完整的 Vite 6 + React 19 + TypeScript + Three.js 数字孪生工作台参考源码（直接 `npm ci && npm test && npm run dev` 即可运行）。

---

## 2. 不可破坏的五条后端契约红线（Redlines）

1. **认证方式（HTTP Bearer + WebSocket 首条 JSON 握手）**
   - 所有 HTTP 请求（含 `/health` 和 `/openapi.json`）必须携带请求头：`Authorization: Bearer <read_token>`。未携带或错误返回 `401`。
   - WebSocket（`/api/live` 与 `/api/replay`）**严禁把 token 放入 URL 查询参数**。连接 `onopen` 后必须在 **5 秒内**发送首条 JSON 消息：`{"token": "<read_token>"}`。
   - WebSocket 关闭码 `1008` 的两种语义区分（见 `reference-ts-sdk/api/ws.ts` 的 `classifyClose`）：
     - 若服务端在关闭前先发了一条 `{"type": "error", "detail": "..."}`，代表**查询参数错误**（如 `since_ns > until_ns` 或 `cursor` 越界）；
     - 若未发 `error` 直接 `1008` 关闭，代表**认证失败**（读取 token 无效或 5 秒超时未发送认证消息）。
2. **纳秒时间戳精度（`*_ns` 一律字符串 / `BigInt`）**
   - 响应中所有纳秒字段（`utc_ns`、`monotonic_ns`、`boot_utc_ns`、`firmware_sample_utc_ns`、`start_ns`、`end_ns`、`received_utc_ns`、`updated_utc_ns`）均为十进制字符串（例如 `"1790000000000000000"`，约 60 bit）。
   - **严禁直接调用 `Number(utc_ns)` 或 `parseInt(utc_ns)`**（超过 IEEE 754 双精度 53-bit 安全整数，会直接抹平毫秒/微秒精度）。
   - 必须使用 `BigInt` 解析并计算两个时间戳的差值，仅当差值缩小到毫秒/秒级安全范围后才转为 `Number` 用于绘图坐标（请直接复用 `reference-ts-sdk/lib/ns.ts`）。
3. **分页游标死规矩（空页但 `next_cursor !== null` 必须继续）**
   - `GET /api/frames` 与 `WS /api/replay` 每次最多解压扫描 2 个 `.wind.zst` 段。
   - 当某两个段内恰好没有命中筛选条件（如 `message_id` 或时间窗口）的帧时，后端会返回 `{"frames": [], "next_cursor": "<段ID>:0"}`。
   - **即使 `frames` 为空数组 `[]`，只要 `next_cursor !== null`，客户端必须继续请求下一页**；只有 `next_cursor === null` 才代表查询真正结束（请直接复用 `reference-ts-sdk/lib/cursor.ts`）。
   - `WS /api/replay` 同理：只有收到过 `next_cursor === null` 的页之后再收到 `1000` 关闭才算完整回放；若收到 `1000` 关闭但未收到过 `null` 游标，视为流被截断。
4. **网关状态与树莓派 5 本体遥测语义（`online` 与 `null` 红线）**
   - 四路固定通道 ID 为 `usb-if00`（T1）、`usb-if02`（T2）、`usb-if04`（T3）、`usb-if06`（T4）。
   - `gateway.online === true` **只代表云端在最近 5 秒内收到过网关 upload 进程的上报**，不代表串口采集线程存活或传感器数据正常；界面必须同时展示各通道的 `updated_utc_ns`、`latest.utc_ns` 与四项质量计数（`checksum_errors`、`length_errors`、`discarded_bytes`、`incomplete_bytes`）。
   - **任何为 `null` 的指标（如 `cpu_temp_mc`、`ext5v_v`、`throttled_hex`、`undervoltage_alarm`、`latest`）必须渲染为“未知 / 未采样”**，严禁静默当成 `0` 或正常态渲染！
   - `status.host` 细节：
     - `cpu_temp_mc` 单位为毫摄氏度（除以 `1000` 得到 `°C`）。
     - `throttled_hex` 与 `ext5v_v` 在网关端有 30 秒缓存（失败也缓存）；且 Linux 内核 `rpi_volt` 驱动每 2 秒读取并清除固件粘滞位（bits 16–19），因此高位只反映近期窗口，不代表开机以来完整历史。
     - `boot_utc_ns` 是 `now - /proc/uptime` 的估计值，存在采样抖动，只有跳变超过 120 秒或 `uptime_sec` 倒退才可判为重启（见 `reference-ts-sdk/lib/host.ts`）。
5. **ATK-IMU901 原始帧（`raw_hex`）解码规范**
   - 后端不做物理量程换算，只下发通过帧头同步与加和校验的完整十六进制帧 `raw_hex`（请直接复用 `reference-ts-sdk/protocol/imu.ts` 的 `parseImuFrameHex`）：
   - 帧格式：`55 55 <message_id:1B> <length:1B> <payload:length B> <checksum:1B>`，其中 `length <= 64`，`checksum = sum(前面所有字节) & 0xff`，payload 内整数均为**小端序有符号 `int16`**。
   - `0x01`（`length = 6`）：姿态角 `[rollRaw, pitchRaw, yawRaw]`，换算公式 `raw / 32768 * 180`（单位 `°`）。
   - `0x02`（`length = 8`）：四元数 `[q0Raw, q1Raw, q2Raw, q3Raw]`，换算公式 `raw / 32768`。
   - `0x03`（`length = 12`）：六轴 `[axRaw, ayRaw, azRaw, gxRaw, gyRaw, gzRaw]`：
     - 加速度 `m/s²`：`raw / 32768 * accRangeG * 9.80665`（`accRangeG` 支持 `2 | 4 | 8 | 16` g，默认 `4`）。
     - 角速度 `°/s`：`raw / 32768 * gyroRangeDps`（`gyroRangeDps` 支持 `250 | 500 | 1000 | 2000` deg/s，默认 `2000`）。
   - `0x06`（`length = 8`）：端口状态 `[d0, d1, d2, d3]` 四个 `int16`。
   - 其他未知 `message_id`：保留并展示原始字节，不得丢弃。协议不含风机转速（RPM）字段，真实数据下转速应显示“未提供”。

---

## 3. 路由与地址速查表

| 环 境 | 前端入口 | API 基础前缀 | 视频流按需预览地址 |
| :--- | :--- | :--- | :--- |
| **生产云端** | `https://8.138.129.114/v2-ui/` | `/wind-v2`（同源反代到 `127.0.0.1:8101`） | `/v2-ui/live.mjpeg` |
| **本地开发** | `http://localhost:5173/v2-ui/` | `/wind-v2`（Vite 代理到 `http://127.0.0.1:8101`） | 按需配置 |

| 方法与路径（相对于 API 前缀） | 认证方式 | 核心参数 / 响应结构 |
| :--- | :--- | :--- |
| `GET /health` | `Bearer <token>` | 返回 `{"ok": true}` |
| `GET /openapi.json` | `Bearer <token>` | 返回 OpenAPI 3.1 JSON |
| `GET /api/gateways` | `Bearer <token>` | 返回 `{"gateways": [{"gateway_id", "online", "received_utc_ns", "status": {"channels", "host"}}]}` |
| `GET /api/sessions` | `Bearer <token>` | 可选 `?gateway_id=rpi5`；返回 `{"sessions": [...]}` |
| `GET /api/frames` | `Bearer <token>` | 必填 `gateway_id`、`channel_id`；可选 `session_id`、`since_ns`、`until_ns`、`message_id`、`limit`（1..1000）、`cursor`；返回 `{"frames": [...], "next_cursor": "..."}` |
| `WS /api/live` | 首条消息 `{"token":"..."}` | 每秒推送 `{"type": "status", "gateways": [...]}`（1 Hz 最新预览，非全采样率流） |
| `WS /api/replay` | 首条消息 `{"token":"..."}` | 查询参数同 `/api/frames`（不含 token）；连续推送 `{"type": "frames", "frames": [...], "next_cursor": "..."}`，末页 `next_cursor: null` 后以 `1000` 关闭 |

---

## 4. 本地一键启动后端与前端联调（Agent 自检闭环）

无论你运行在 Windows、macOS 还是 Linux，只要有 Python 3.10+，即可直接启动本包自带的**零依赖契约沙盒后端**：

```bash
# 终端 1：启动零依赖本地后端（监听 127.0.0.1:8101，默认 Read Token 为 wind-dev-token）
python3 local-backend/standalone_mock_backend.py
```

快速验证接口（复制即跑）：

```bash
# 1. 健康检查（带 Bearer Token）
curl -s -H "Authorization: Bearer wind-dev-token" http://127.0.0.1:8101/wind-v2/health

# 2. 网关状态与树莓派 5 本体遥测
curl -s -H "Authorization: Bearer wind-dev-token" http://127.0.0.1:8101/wind-v2/api/gateways

# 3. 历史会话列表
curl -s -H "Authorization: Bearer wind-dev-token" http://127.0.0.1:8101/wind-v2/api/sessions

# 4. 测试空页非 null 游标（usb-if00 前两段仅含 message_id=1，查 message_id=3 时第一页 frames 为 [] 但 next_cursor 非 null！）
curl -s -H "Authorization: Bearer wind-dev-token" "http://127.0.0.1:8101/wind-v2/api/frames?gateway_id=rpi5&channel_id=usb-if00&message_id=3&limit=5"
```

如果要直接运行或改造本包附带的完整参考前端：

```bash
cd reference-web-app
npm ci
npm test        # 运行 46 项协议、纳秒、游标、host 遥测、回放流单测
npm run dev     # 启动前端开发服务器，在界面设置中填入 Read Token: wind-dev-token
```

> **安全提醒**：本地开发统一使用 `wind-dev-token`。生产环境只读 Token 由项目管理员私下提供给组员在浏览器设置弹窗中输入（保存在浏览器 `localStorage`），**严禁把任何生产 Token 硬编码进前端源码或提交到 Git 仓库**。
