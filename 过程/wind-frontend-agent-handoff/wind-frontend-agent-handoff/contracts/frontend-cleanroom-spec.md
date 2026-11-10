# wind-monitoring Web 前端全面重构：精密仪器风数字孪生工作台（Cleanroom Spec）

- 仓库：`/srv/xsy-agent-share/wind-monitoring`（Git 权威 `origin` = `ssh://forgejo/hopper/wind-monitoring.git`，主分支 `main`）
- 工作目录：`web/`（Vite 6 + React 19 + Three.js 0.174 + Vitest 3，TypeScript 5.7）
- 基线提交：`7dae929 feat(web): add initial Vite + React + Three.js monitoring frontend baseline`
- 执行 worktree：`/srv/xsy-agent-share/wind-monitoring.worktrees/20261104-web-instrument-redesign`，分支 `web/instrument-redesign`

## 0. 执行纪律（必须遵守）

1. **Phase 0（本轮立即执行：只读勘探与 ADR 对齐，汇报后停止）**
   - 不修改任何项目文件，不安装依赖，不提交、不推送，不启动第二个执行器。
   - 完整阅读 `docs/api-contract.md`、`web/src/protocol/imu.ts`、`web/src/protocol/imu.test.ts`、`web/serve_archive.py`，以及 `cloud/src/wind_cloud/` 中 `/api/gateways`、`/api/live`、`/api/replay`、`/api/frames`、`/api/sessions` 的真实实现（以代码为准核对契约细节：字段名、错误码、关闭码、replay 消息形状、status.host 原样透传）。
   - 盘点现有 `web/src` 草稿（App.tsx、components/*、api/client.ts、types.ts、styles.css）中哪些逻辑值得保留（例如认证首消息、游标循环），哪些违反下列底线（例如 Number 转纳秒、null 渲染成 0、token 进 URL）。
   - 核对：worktree 中 `node_modules` 是否需要 `npm ci`、离线可用性；当前 `npm run build` 的 chunk 体积警告来源；`serve_archive.py` 联调所需 Python 依赖（uvicorn、wind_cloud、zstd）是否在本机可用，有无可用 `.wind.zst` 样本。
   - 产出简明报告：发现的坑位与契约差异、拟定的组件树 / 状态管理 / 数据流 / 分包方案、视觉设计方向与色彩/字体 token 草案、3D 风机建模思路、验证计划，以及各项 ADR（主推方案 + Why + 代价）。然后停止，等待用户批准。
2. **Phase 1（用户批准 ADR 后执行）**
   - 仅在上述 worktree 内编码与验证；完成门禁后由编排者核验 Diff，再按交付规则合并回 `main` 并推送 `origin`。
   - 本机为 4 核低压笔记本：所有构建/测试命令加 `nice -n 19 ionice -c3`，不并行跑多个 build，不长时间常驻 dev server（自检结束即停）。

## 1. 工程原则

KISS / YAGNI / Worse is Better / 显式 ADR / 关注点分离。纯函数（协议解析、纳秒运算、游标循环、host 遥测判读、质量计数差分等）与渲染层分离，纯函数配 Vitest 单测。不引入重型 UI 框架或状态库，除非 ADR 能说明收益显著大于体积与复杂度成本。

## 2. 不可破坏的底层契约（红线）

1. **协议解析器**：完全保留并复用 `src/protocol/imu.ts` 的纯函数解析与现有 `imu.test.ts`，0x55 0x55 帧头、小端 int16、校验和、0x01 倾角 / 0x02 四元数 / 0x03 六轴 / 0x06 端口状态、可配置加速度与角速度量程换算必须原样通过。可在其旁新增工具，但不得改变既有导出签名与行为。
2. **认证**：HTTP 用 `Authorization: Bearer <token>`；`/api/live` 与 `/api/replay` 连接建立后 5 秒内发送首条 JSON `{"token":"<读取token>"}`；严禁 token 出现在 URL 查询参数；1008 关闭须在界面表达为认证失败。
3. **纳秒精度**：`utc_ns`、`monotonic_ns`、`boot_utc_ns`、`firmware_sample_utc_ns`、`start_ns`、`end_ns`、`received_utc_ns`、`updated_utc_ns` 一律字符串 / BigInt 处理差值与排序；仅在差值已缩小到安全范围后才转 Number 用于绘图坐标。
4. **游标语义**：`/api/frames` 每页最多扫描两个段；`frames` 为空但 `next_cursor` 非 null 必须继续拉取；仅 `next_cursor === null` 结束。replay 同理以最后一页 null 游标 + 1000 关闭为终态。
5. **状态语义**：网关 `online` 仅代表云端 5 秒内收到上报，不代表采集线程或传感器正常，须同时呈现通道更新时间、最后有效帧时间与质量计数；任何 null 指标表达为“未知 / 未采样 / 设备未暴露”，严禁静默渲染为 0。

## 3. 功能目标

四路固定通道 `usb-if00`、`usb-if02`、`usb-if04`、`usb-if06` 对应四台微型试验风机，树莓派 5 网关经 4G/5G 上报。

1. **四风机三维数字孪生与实时态势**：Three.js 映射叶轮转速、机舱三轴姿态（Roll/Pitch/Yaw 或四元数）与振动烈度；保留外部 glTF/GLB 场景模型加载入口；相机视角带阻尼的顺滑操控；风机模型具备金属/复合材料质感与合理光影层次（PBR、环境光照、软阴影），而非简陋几何体。
2. **四通道高频波形与指标对比**：Canvas 2D 高性能多通道实时/回放波形（环形缓冲、按帧合批、DPR 适配、离屏不绘制）；量程切换 2/4/8/16 g 与 250/500/1000/2000 deg/s；通道聚焦；时域/频域指标（RMS、峰值、峰峰值、主频等，以 ADR 决定范围）；数据完整性（校验错、长度错、丢弃字节、不完整字节）直观呈现并对增量突出提示。
3. **树莓派 5 网关本体遥测（新增，初版漏掉 `status.host`）**：`ext5v_v` 供电电压、`undervoltage_alarm` 近期欠压告警、`throttled_hex` 固件节流标志位解码（须表达 30 秒缓存、失败也缓存、过期失败清值、内核每 2 秒清粘滞位导致高位不代表自启动以来完整历史）、`cpu_temp_mc` 处理器温度、`disk_used_percent` 数据盘占用、`uptime_sec` 运行时长；`firmware_sample_utc_ns` 用于表达固件读数新鲜度；`boot_utc_ns` 微小抖动不得判为重启；未知字段原样容忍；`host` 整体缺失（旧客户端）时如实表达。
4. **历史批次、原始帧检索与流式回放工作台**：`/api/sessions` 批次浏览；`/api/frames` 按网关、Session、通道、时间范围、消息 ID 检索，展示原始 hex 与解码物理量；`/api/replay` 回放流按时间戳由客户端控制节奏，驱动三维场景与波形同步复现（播放/暂停/倍速/进度）。
5. **脱机能力**：保留无后端或脱机演示时的内置仿真信号发生器（明确标识为仿真数据，不得与真实数据混淆）；固定机位监控视频流按需预览窗（默认不加载，按需打开）。

## 4. 设计方向（审美授权）

- 现有 `App.tsx`、`styles.css`、`components/*` 仅作接口联调参考，授权推倒重来：组件树、状态管理、布局、配色、Three.js 表现均可重构。
- 对标航空航天风洞试验台、精密电子测量仪器、Braun、Teenage Engineering、Linear 级现代工程软件：高信噪比、克制冷峻色彩语义（正常态收敛，仅降级/丢帧/告警时高亮）、考究字体排印与全局 `tabular-nums` 等宽数字、细腻物理阻尼动效。
- 明确拒绝：霓虹发光描边、无意义装饰框、赛博蓝毛玻璃堆砌等传统大屏套路。
- 布局形态（全屏驾驶舱 / 多轨时间轴工作台 / 主副分屏检查器）由执行者在 ADR 中自主决定并说明理由。

## 5. 验证与交付门禁

在 `web/` 下（均加 `nice -n 19 ionice -c3`）：

1. `npm test`：`imu.test.ts` 全部通过，新增纯函数工具（纳秒运算、游标循环、throttled 解码、host 判读、统计指标等）有单测。
2. `npm run build`：`tsc -b` 严格类型检查与 Vite 生产打包零警告零错误；通过合理分包（如 three 独立 chunk、视图懒加载）消除超大 chunk 警告，不得仅靠调高 `chunkSizeWarningLimit` 掩盖。
3. 条件允许时用 `python3 web/serve_archive.py --data-dir <临时目录> [--import-dir <样本>]` + `npm run dev` 做真实前后端联调自检（认证首消息、游标跟随、replay 驱动、host 面板 null 表达），结束后停止进程；临时数据目录不进 Git。
4. 交付报告：简短 ADR、变更摘要、门禁输出、联调结论与已知限制。

## 6. 边界

- 不修改 `cloud/`、`gateway/`、`proto/` 后端代码与 `docs/api-contract.md` 契约；若发现契约与实现不一致，记录并报告，不擅自改后端。
- 不提交 `node_modules`、`dist`、临时数据目录、token 或凭据文件。
- 不部署、不触碰真机、不 force push、不 `--no-verify`。
