# WIND · TWIN 前端（`web/`）

微型风力机多模态状态监测与数字孪生平台前端。Vite + React 19 + TypeScript（strict）+ Three.js + Canvas 2D，无 UI 框架与状态库。对接 `docs/api-contract.md` 描述的 HTTP / WebSocket 接口。

## 视图与数据源

- **监测**：四风机三维孪生（程序化 PBR 风机、机舱姿态、偏航刻度、振动状态环，可载入外部 glTF/GLB 场景）+ 四轨共享时间轴波形 + 右侧检查器（云端链路、Raspberry Pi 5 网关本体遥测、采集通道与质量计数、聚焦通道指标与逐字节帧解码）。
- **数据**：实验批次（`/api/sessions`）、原始帧检索（`/api/frames`，严格跟随游标）、逐字节解码，一键「回放到孪生」。
- **数据源**：
  - `实时`：`/api/live` 每秒一次状态快照；波形仅为 latest 预览帧（1 Hz），不是全采样率。
  - `回放`：`/api/replay` 读取持久段完整有效帧，前端按 `utc_ns` 控制节奏，驱动三维与波形。
  - `仿真`：内置信号发生器，生成真实协议帧走同一解析链路，界面全程标注「仿真」。

## 契约要点（实现位置）

| 约束 | 实现 |
| --- | --- |
| HTTP Bearer；WS 首条消息 `{"token":…}`，token 不进 URL | `src/api/client.ts`、`src/api/ws.ts` |
| 1008 区分认证失败与回放查询错误（服务端先发 `{"type":"error"}`） | `classifyClose` |
| 纳秒时间戳一律字符串 / BigInt，仅差值转 Number | `src/lib/ns.ts` |
| `/api/frames` 空页但游标非 null 必须继续，仅 null 结束；翻页沿用原筛选 | `src/lib/cursor.ts`、`src/history/HistoryWorkspace.tsx` |
| 回放仅在收到 null 游标后判定完成；1000 关闭但无 null 游标视为截断 | `src/replay/stream.ts` |
| 回放有界缓存：队列 ≥2000 帧主动断开并记住游标，≤1000 帧时续接 | `src/replay/stream.ts` |
| 时间回拨暂停并标注，不重排；播放头不越过未完结流已收到的最后一帧 | `src/replay/player.ts` |
| `online` 只表示云端 5 s 内收到上报；null 显示为未知 / 未采样，不当 0 | `src/lib/host.ts`、`src/lib/quality.ts`、`components/*` |
| `status.host`：throttled 位解码、30 s 固件缓存与内核 2 s 清粘滞位语义、重启判定容忍 boot 抖动 | `src/lib/throttled.ts`、`src/lib/host.ts` |
| 协议解析器保持原样 | `src/protocol/imu.ts` |

振动指标为三轴去直流向量 RMS `√(σx²+σy²+σz²)`（g），阈值为经验值，可在「设置」调整。协议没有转速字段，真实数据的转速显示「未提供」，叶轮不转。read_return 时间戳成批共享，波形可切换「序号」横轴查看。

## 开发

```bash
cd web
npm ci

# 本地真实后端（需项目 Python 环境；data-dir 请用新的临时目录）
python3 serve_archive.py --data-dir /tmp/wind-cloud-dev --import-dir <含 .wind.zst 的目录>

# 前端开发服务器，/wind-v2 代理到 127.0.0.1:8101（可用 VITE_API_TARGET 覆盖）
npm run dev

npm test        # 协议解析、纳秒、游标、host 判读、回放流与播放器、仿真器单测
npm run build   # tsc -b + vite build；three 按 core / renderer 分包，三维与数据工作台懒加载
```
