// ========== 1. 导入依赖 ==========
import { Suspense, lazy } from "react";
import { useEffect, useState, useRef } from "react";
import { useWindV2 } from "../context/WindV2Context";
import { CHANNELS } from "@/lib/api/types";
import { parseImuFrameHex } from "@/lib/protocol/imu";

const CampusSandboxViewer = lazy(() => import("../components/CampusSandboxViewer").then(m => ({ default: m.CampusSandboxViewer })));

// ========== 2. 常量配置 ==========
const AI_WS_URL = "ws://8.138.129.114:8000/ws";
const WEATHER_URL = "https://api.open-meteo.com/v1/forecast?latitude=22.2769&longitude=113.5678&current=wind_speed_10m&timezone=Asia/Shanghai";

// ========== 3. 类型定义 ==========
interface AIAlert {
  time: string;
  class: number;
  confidence: number;
  status: string;
  sensor_data: string;
  class_name?: string;
}

const CLASS_LABELS: Record<number, string> = {
  0: "叶片裂纹",
  1: "正常",
  2: "异物/挂冰",
  3: "轴承故障",
};

// ========== 4. MainMonitor 主页面组件 ==========
export function MainMonitor() {
  // v2 实时数据：网关快照、连接状态、主机遥测
  const { snapshot, link, host } = useWindV2();

  const [windSpeed, setWindSpeed] = useState<string | null>(null);
  const [aiAlerts, setAiAlerts] = useState<AIAlert[]>([]);
  const [defectMap, setDefectMap] = useState<Record<number, { bladeIndex: number; type: string }>>({});
  const aiWsRef = useRef<WebSocket | null>(null);

  // ── 从 v2 网关快照推导 4 路 IMU 加速度幅值（六轴 raw_hex 解析） ──
  const accelList = CHANNELS.map((c) => {
    const latest = snapshot?.status?.channels?.[c]?.latest;
    if (!latest?.raw_hex) return null;
    const parsed = parseImuFrameHex(latest.raw_hex);
    if (!parsed.valid || parsed.payload.kind !== "six_axis") return null;
    return parsed.payload.accMagnitude;
  });

  // v2 契约不含环境温湿度，主机温度作为温度信号；湿度暂无来源
  const temperature = host?.cpuTempC ?? null;
  const humidity = null;

  // ── useEffect #1：连接 AI 诊断后端，接收预警 ──
  useEffect(() => {
    const connectAI = () => {
      const ws = new WebSocket(AI_WS_URL);
      aiWsRef.current = ws;
      ws.onmessage = (event) => {
        try {
          const result: AIAlert = JSON.parse(event.data);
          if (result.status === "异常") {
            setAiAlerts((prev) => [result, ...prev].slice(0, 5));
            setDefectMap((prev) => ({
              ...prev,
              [result.class % 4]: {
                bladeIndex: result.class % 3,
                type: CLASS_LABELS[result.class] || "未知",
              },
            }));
          } else {
            setDefectMap({});
          }
        } catch (e) { /* 静默忽略 */ }
      };
      ws.onclose = () => setTimeout(connectAI, 3000);
    };
    connectAI();
    return () => aiWsRef.current?.close();
  }, []);

  // ── useEffect #2：获取珠海实时风速 ──
  useEffect(() => {
    const fetchWind = () => {
      fetch(WEATHER_URL)
        .then((res) => res.json())
        .then((json) => {
          const speed = json?.current?.wind_speed_10m;
          if (speed != null) setWindSpeed(speed.toFixed(1));
        })
        .catch(() => {});
    };
    fetchWind();
    const interval = setInterval(fetchWind, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  // 组装传给 CampusSandboxViewer 的监测数据
  const monitoringData = {
    windSpeed,
    temperature,
    humidity,
    accelList,
  };

  // 网关在线状态（v2 语义：online = 5s 内有上报）
  const online = snapshot?.online === true;

  return (
    <div className="relative h-[800px] w-full rounded-xl overflow-hidden bg-[#0f251d] border border-[#27684f]/20 shadow-[0_0_40px_rgba(39,104,79,0.1)]">
      {/* 3D 沙盘场景全屏铺满 */}
      <div className="absolute inset-0">
        <Suspense fallback={
          <div className="flex items-center justify-center h-full bg-[#0f251d]">
            <div className="flex flex-col items-center gap-4">
              <div className="h-12 w-12 animate-spin rounded-full border-2 border-[#27684f] border-t-transparent" />
              <span className="text-[#47a87a] text-sm font-mono">加载 珠海校区 3D 沙盘...</span>
            </div>
          </div>
        }>
          <CampusSandboxViewer
            defectMap={defectMap}
            monitoringData={monitoringData}
            aiAlerts={aiAlerts}
          />
        </Suspense>
      </div>

      {/* 居中标题横幅 */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 pointer-events-none">
        <div className="flex items-center gap-3 bg-[#1a3c31]/60 backdrop-blur-md px-6 py-2 rounded-full border border-[#27684f]/30 shadow-[0_0_15px_rgba(39,104,79,0.2)]">
          <h2 className="text-sm font-bold text-[#47a87a] tracking-wider">3D 数字孪生 - 中山大学珠海校区 · 风场监测</h2>
          <div className="w-px h-4 bg-[#27684f]/30"></div>
          <div className="flex items-center gap-2 text-xs text-[#47a87a]/80 font-mono">
            <span>{snapshot?.gateway_id ?? "未选择网关"}</span>
            <span className={`w-2 h-2 rounded-full ${online ? "bg-green-500 animate-pulse" : "bg-gray-500"}`}></span>
            <span className={online ? "text-green-400" : "text-[#6d8f80]"}>
              {online ? "ONLINE" : link === "auth-failed" ? "认证失败" : "OFFLINE"}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}