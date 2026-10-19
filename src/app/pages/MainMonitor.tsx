// ========== 1. 导入依赖 ==========

// DataCard：可复用的数据卡片组件（显示标签+数值+单位+图标+状态色）
import { DataCard } from "../components/DataCard";

// Suspense：React的"懒加载中间状态"，在组件还没下载完时显示fallback（加载动画）
// lazy：React的"按需加载"，只有用户访问此页面时才下载该组件的JS文件，减小首屏体积
import { Suspense, lazy } from "react";

// 动态导入 WindTurbine3D（3D场景是整个项目最重的组件，打包后约几MB，必须懒加载）
// lazy(() => import(...))：当MainMonitor首次渲染时，React才开始下载WindTurbine3D的JS
// .then(m => ({ default: m.WindTurbine3D }))：因为文件导出的是命名导出（非export default），需要手动映射
const WindTurbine3D = lazy(() => import("../components/WindTurbine3D").then(m => ({ default: m.WindTurbine3D })));

// lucide-react 图标：
// Activity=脉搏/波形, Wind=风机, Thermometer=温度计, Droplets=湿度,
// AlertTriangle=警告三角, Brain=大脑/AI
import { Activity, Wind, Thermometer, Droplets, Brain } from "lucide-react";

// useEffect：页面加载后执行副作用（连接WebSocket、请求API、启动定时器）
// useState：创建响应式状态变量
// useRef：存放不需要触发重渲染的可变值（WebSocket实例、计数器等）
import { useEffect, useState, useRef } from "react";

// ========== 2. 常量配置 ==========

// 传感器网关 WebSocket 地址：从硬件网关（gateway-01）实时获取加速度数据
const WS_URL = "ws://8.138.129.114/api/v1/live?gateway_id=gateway-01";

// AI 诊断 WebSocket 地址：从 Python 后端获取 DANN 模型推理结果
const AI_WS_URL = "ws://8.138.129.114:8000/ws";

// 珠海气象 API（Open-Meteo 免费服务）：
// latitude=22.2769, longitude=113.5678 → 珠海市经纬度
// current=wind_speed_10m → 只需要当前10米高度的风速
// timezone=Asia/Shanghai → 北京时间
const WEATHER_URL = "https://api.open-meteo.com/v1/forecast?latitude=22.2769&longitude=113.5678&current=wind_speed_10m&timezone=Asia/Shanghai";

// ========== 3. 类型定义 ==========

// AIAlert：AI诊断预警的数据结构
interface AIAlert {
  time: string;       // 诊断时间，如 "2026-09-20T14:30:00"
  class: number;      // 故障类别编号：0=叶片裂纹, 1=正常, 2=异物/挂冰, 3=轴承故障
  confidence: number; // 置信度 0~1
  status: string;     // 状态文字："异常" 或 "正常"
  sensor_data: string;// 数据来源文件名
  class_name?: string;// 类别中文名（可选）
}

// CLASS_LABELS：数字类别 → 中文名称的映射表
// Record<number, string> 表示"键是数字，值是字符串"的对象类型
const CLASS_LABELS: Record<number, string> = {
  0: "叶片裂纹",
  1: "正常",
  2: "异物/挂冰",
  3: "轴承故障",
};

// ========== 4. MainMonitor 主页面组件 ==========
export function MainMonitor() {
  // ----- 状态声明 -----

  // accelList：4台风机的实时加速度值（数组下标0=WT-01, 1=WT-02, 2=WT-03, 3=WT-04）
  const [accelList, setAccelList] = useState<number[] | null[]>([null, null, null, null]);

  // windSpeed：珠海当前风速（从气象API获取）
  const [windSpeed, setWindSpeed] = useState<string | null>(null);

  // temperature：温度（从网关WebSocket获取）
  const [temperature, setTemperature] = useState<number | null>(null);

  // humidity：湿度（从网关WebSocket获取）
  const [humidity, setHumidity] = useState<number | null>(null);

  // aiAlerts：AI预警列表（最多保留5条），每条是异常的AIAlert
  const [aiAlerts, setAiAlerts] = useState<AIAlert[]>([]);

  // defectMap：故障标记映射表
  // 键=风机编号, 值={ bladeIndex: 哪片叶子(0/1/2), type: 故障类型中文名 }
  // 传给 WindTurbine3D 组件，让它知道哪台风机哪片叶片要显示红色标记
  const [defectMap, setDefectMap] = useState<Record<number, { bladeIndex: number; type: string }>>({});

  // wsRef：存放传感器 WebSocket 实例（useRef 修改不触发重渲染）
  const wsRef = useRef<WebSocket | null>(null);

  // aiWsRef：存放 AI 诊断 WebSocket 实例
  const aiWsRef = useRef<WebSocket | null>(null);

  // ========== 5. 三个 useEffect ==========

  // ── useEffect #1：连接传感器网关，获取加速度数据 ──
  useEffect(() => {
    // connect 函数：建立 WebSocket 连接
    const connect = () => {
      // 1. 创建 WebSocket 连接
      const ws = new WebSocket(WS_URL);
      wsRef.current = ws; // 存到 Ref，方便卸载时关闭

      // 2. 收到消息时处理
      ws.onmessage = (event) => {
        try {
          // 2a. 解析 JSON
          const msg = JSON.parse(event.data);
          // 2b. 过滤：只处理 sensor_sample_batch 类型的消息，且必须有数据
          if (msg.type !== "sensor_sample_batch" || !msg.data?.length) return;

          const samples = msg.data;
          const newAccelList: (number | null)[] = [null, null, null, null];

          // 2c. 遍历最多4个传感器采样，提取加速度幅值
          for (let i = 0; i < Math.min(samples.length, 4); i++) {
            const acc = samples[i]?.physical?.acceleration_m_s2;
            if (acc && typeof acc.x === "number") {
              newAccelList[i] = Math.sqrt(acc.x ** 2 + acc.y ** 2 + acc.z ** 2);
            }
          }
          setAccelList(newAccelList);

          // 2d. 提取温度（取第一个有温度字段的样本）
          for (const s of samples) {
            const t = s?.physical?.temperature_c;
            if (typeof t === "number") { setTemperature(t); break; }
          }

          // 2e. 提取湿度
          for (const s of samples) {
            const h = s?.physical?.humidity_pct ?? s?.physical?.humidity;
            if (typeof h === "number") { setHumidity(h); break; }
          }
        } catch (e) {
          // JSON 解析失败或数据格式异常，静默忽略
        }
      };

      // 3. 断线自动重连（3秒后重新调用 connect）
      ws.onclose = () => setTimeout(connect, 3000);
    };

    // 启动连接
    connect();

    // 清理函数：组件卸载时关闭 WebSocket
    return () => wsRef.current?.close();
  }, []); // [] = 只在首次挂载时执行一次

  // ── useEffect #2：连接 AI 诊断后端，接收预警 ──
  useEffect(() => {
    const connectAI = () => {
      // 1. 创建 WebSocket 连接到 Python FastAPI 后端
      const ws = new WebSocket(AI_WS_URL);
      aiWsRef.current = ws;

      // 2. 收到 AI 诊断结果
      ws.onmessage = (event) => {
        try {
          const result: AIAlert = JSON.parse(event.data);

          // 2a. 仅处理"异常"结果
          if (result.status === "异常") {
            // 2b. 把新预警插入数组开头（最新的在上面）
            //     [result, ...prev] = 新结果 + 展开旧数组
            //     .slice(0, 5) = 只保留前5条，防止无限增长
            setAiAlerts((prev) => [result, ...prev].slice(0, 5));

            // 2c. 更新故障标记映射，让3D场景中对应风机显示红色故障标记
            //     result.class % 4：用故障类别对4取模，决定标记在哪台风机
            //     result.class % 3：用故障类别对3取模，决定标记哪片叶片
            setDefectMap((prev) => ({
              ...prev, // 保留之前已有的故障标记
              [result.class % 4]: {
                bladeIndex: result.class % 3,
                type: CLASS_LABELS[result.class] || "未知",
              },
            }));
          } else {
            // 2d. 状态是"正常"，清除所有故障标记
            setDefectMap({});
          }
        } catch (e) {
          // 数据解析失败，静默忽略
        }
      };

      // 3. 断线自动重连
      ws.onclose = () => setTimeout(connectAI, 3000);
    };

    connectAI();
    // 清理
    return () => aiWsRef.current?.close();
  }, []); // [] = 只执行一次

  // ── useEffect #3：获取珠海实时风速 ──
  useEffect(() => {
    const fetchWind = () => {
      // fetch()：浏览器原生HTTP请求API（类似axios，但不需要安装）
      fetch(WEATHER_URL)
        .then((res) => res.json())  // 第一步：把响应体解析为JSON对象
        .then((json) => {
          // 第二步：从JSON中提取风速字段
          const speed = json?.current?.wind_speed_10m;
          if (speed != null) setWindSpeed(speed.toFixed(1));
        })
        .catch(() => {}); // 请求失败（断网、API挂了等），静默处理
    };

    // 立即请求一次（页面刚打开就有数据，不用等5分钟）
    fetchWind();

    // 每5分钟（300000毫秒）刷新一次风速
    const interval = setInterval(fetchWind, 5 * 60 * 1000);

    // 清理：组件卸载时清除定时器
    return () => clearInterval(interval);
  }, []); // [] = 只执行一次

  // ========== 6. 渲染 ==========
  // 整体布局：一个相对定位的大容器（relative）→ 3个绝对定位的子层（absolute）
  // 层级：底层=3D场景 → 顶层=标题栏 → 左侧=参数面板 → 右侧=加速度面板
  return (
    // relative：为内部 absolute 子元素提供定位参考（子元素相对于这个div定位）
    // h-[800px]：固定高度800px（3D场景需要明确的高宽才能正确渲染）
    // rounded-xl：大圆角
    // overflow-hidden：超出容器的内容隐藏（防止3D场景溢出到外面）
    // border border-cyan-500/20：青色半透明边框
    // shadow-[...]：自定义发光阴影（Tailwind任意值语法）
    <div className="relative h-[800px] w-full rounded-xl overflow-hidden bg-[#030614] border border-cyan-500/20 shadow-[0_0_40px_rgba(6,182,212,0.1)]">
      {/* ===== 底层：3D 场景全屏铺满 ===== */}
      {/* absolute inset-0：绝对定位，top/right/bottom/left 都是0 → 撑满父容器 */}
      <div className="absolute inset-0">
        {/* Suspense：懒加载的"等待态"包装器 */}
        {/* 当 WindTurbine3D 还在下载中时，显示 fallback 里的加载动画 */}
        <Suspense fallback={
          // 加载中的UI：全屏居中 → 旋转的圆环加载指示器 + "加载3D场景..."文字
          <div className="flex items-center justify-center h-full bg-[#020617]">
            <div className="flex flex-col items-center gap-4">
              {/* animate-spin：持续旋转动画 */}
              {/* border-t-transparent：顶部边框透明，形成缺口旋转圆环 */}
              <div className="h-12 w-12 animate-spin rounded-full border-2 border-cyan-500 border-t-transparent" />
              {/* font-mono：等宽字体（科技感） */}
              <span className="text-cyan-400 text-sm font-mono">加载 3D 场景...</span>
            </div>
          </div>
        }>
          {/* 🔑 核心：传入 defectMap 控制故障标记显示 */}
          <WindTurbine3D defectMap={defectMap} />
        </Suspense>
      </div>

      {/* ===== 顶层：居中标题横幅 ===== */}
      {/* absolute top-4：距顶部16px */}
      {/* left-1/2 -translate-x-1/2：水平居中（先放在50%位置，再向左平移自身宽度一半） */}
      {/* pointer-events-none：鼠标事件穿透 → 不挡住下面3D场景的交互 */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 pointer-events-none">
        {/* 毛玻璃胶囊条：半透明深蓝背景 + 模糊 + 青色发光边框 */}
        {/* tracking-wider：字间距加宽，增加科技感 */}
        <div className="flex items-center gap-3 bg-[#0a0e27]/60 backdrop-blur-md px-6 py-2 rounded-full border border-cyan-500/30 shadow-[0_0_15px_rgba(6,182,212,0.2)]">
          <h2 className="text-sm font-bold text-cyan-400 tracking-wider">3D 数字孪生 - 中大珠海校区区域监测</h2>
          {/* 竖线分隔符（w-px=宽1px, h-4=高16px） */}
          <div className="w-px h-4 bg-cyan-500/30"></div>
          <div className="flex items-center gap-2 text-xs text-cyan-500/80 font-mono">
            <span>WT_440048_041013</span> {/* 风机编号 */}
            {/* 在线状态指示灯：绿色圆点持续闪烁 */}
            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
            <span className="text-green-400">ONLINE</span>
          </div>
        </div>
      </div>

      {/* ===== 左侧面板：参数卡片 + AI预警 ===== */}
      {/* absolute left-4 top-4 bottom-4：距离左/上/下各16px，自动撑满高度 */}
      {/* w-72：宽度288px */}
      {/* flex flex-col gap-4：纵向弹性布局，间距16px */}
      <div className="absolute left-4 top-4 bottom-4 w-72 flex flex-col gap-4 pointer-events-none z-10">
        {/* ---- 参数卡片 ---- */}
        {/* pointer-events-auto：允许鼠标交互（覆盖父级 pointer-events-none） */}
        {/* backdrop-blur-md：背景模糊（毛玻璃） */}
        <div className="pointer-events-auto rounded-lg border border-cyan-500/30 bg-[#0a0e27]/70 backdrop-blur-md p-4 shadow-lg">
          <h2 className="mb-4 text-sm font-semibold text-cyan-400 flex items-center gap-2">
            <Activity className="h-4 w-4" /> 实时参数
          </h2>
          {/* space-y-3：垂直间距12px（给每个子元素底部自动加margin） */}
          <div className="space-y-3">
            <DataCard label="风速（珠海气象台）" value={windSpeed ?? "--"} unit="m/s" icon={<Wind className="h-5 w-5" />} />
            <DataCard label="温度" value={temperature != null ? temperature.toFixed(1) : "--"} unit="°C" icon={<Thermometer className="h-5 w-5" />} />
            <DataCard label="湿度" value={humidity != null ? humidity.toFixed(1) : "--"} unit="%" icon={<Droplets className="h-5 w-5" />} />
          </div>
        </div>

        {/* ---- AI 智能诊断预警 ---- */}
        {/* border-red-500/30：红色边框（危险/警告氛围） */}
        {/* bg-red-950/40：深红半透明背景 */}
        <div className="pointer-events-auto rounded-lg border border-red-500/30 bg-red-950/40 backdrop-blur-md p-4 shadow-lg">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-red-400">
            <Brain className="h-4 w-4 animate-pulse" /> {/* Brain图标持续脉冲 → 表示AI在"思考" */}
            <span>DANN 智能诊断预警</span>
          </div>
          {/* max-h-[200px] overflow-auto：最大高度200px，超出部分可滚动 */}
          <div className="space-y-2 max-h-[200px] overflow-auto">
            {/* 条件渲染：aiAlerts 为空 → 显示"正常"状态 */}
            {aiAlerts.length === 0 ? (
              // 正常状态卡片：绿色边框 + 绿色背景
              <div className="rounded border border-green-500/40 bg-green-500/10 p-2 text-xs relative overflow-hidden">
                {/* 左侧绿色竖条指示器（相对定位，左0，上下0，宽1，绿色） */}
                <div className="absolute left-0 top-0 bottom-0 w-1 bg-green-500"></div>
                <div className="pl-2 font-mono font-semibold text-green-400">STATUS_OK</div>
                <div className="pl-2 text-green-300">AI 模型未检测到异常</div>
                <div className="pl-2 mt-1 text-green-400/60">神经网络持续监控中</div>
              </div>
            ) : (
              // 异常状态：遍历 aiAlerts 数组，每条渲染一张红色警告卡片
              aiAlerts.map((alert, i) => (
                // key={i}：React要求列表渲染的每个子元素有唯一标识
                <div key={i} className="rounded border border-red-500/40 bg-red-500/10 p-2 text-xs relative overflow-hidden">
                  {/* 左侧红色竖条指示器 */}
                  <div className="absolute left-0 top-0 bottom-0 w-1 bg-red-500"></div>
                  {/* 用正则 /[^\u4e00-\u9fa5]/g 去掉中文以外的所有字符 → 生成AI_ALERT_叶片裂纹 这样的标签 */}
                  <div className="pl-2 font-mono font-semibold text-red-400">
                    AI_ALERT_{CLASS_LABELS[alert.class]?.replace(/[^\u4e00-\u9fa5]/g, "") || "UNKNOWN"}
                  </div>
                  {/* 故障类型 + 置信度（百分比，1位小数） */}
                  <div className="pl-2 text-red-300">
                    {CLASS_LABELS[alert.class] || "未知故障"} (置信度: {(alert.confidence * 100).toFixed(1)}%)
                  </div>
                  {/* 诊断时间 */}
                  <div className="pl-2 mt-1 text-red-400/60">{alert.time}</div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* ===== 右侧面板：4台风机加速度数值 ===== */}
      {/* absolute right-4 top-4：距右边16px，距顶部16px */}
      <div className="absolute right-4 top-4 w-72 flex flex-col gap-4 pointer-events-none z-10">
        <div className="pointer-events-auto rounded-lg border border-cyan-500/30 bg-[#0a0e27]/70 backdrop-blur-md p-4 shadow-lg">
          <h3 className="mb-3 text-xs font-semibold text-cyan-400 flex items-center gap-2">
            <Activity className="h-4 w-4" /> 实时加速度 (m/s²)
          </h3>
          <div className="space-y-2">
            {/* 用 .map() 循环生成4台风机的数值行 */}
            {/* ["WT-01", "WT-02", "WT-03", "WT-04"].map((label, i) => ...) */}
            {["WT-01", "WT-02", "WT-03", "WT-04"].map((label, i) => (
              // justify-between：标签在左，数值在右
              <div key={i} className="flex items-center justify-between rounded border border-cyan-500/20 bg-cyan-500/5 px-3 py-2">
                {/* 风机编号标签 */}
                <span className="text-xs text-cyan-400/70 font-mono">{label}</span>
                {/* 实时加速度数值（取2位小数） */}
                {/* text-lg font-bold：大字号加粗，数值视觉突出 */}
                <span className="text-lg font-bold text-cyan-300 font-mono">{accelList[i] != null ? accelList[i]!.toFixed(2) : "--"}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}