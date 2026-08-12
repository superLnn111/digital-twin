import { DataCard } from "../components/DataCard";
import { WindTurbine3D } from "../components/WindTurbine3D";
import { Activity, Wind, Zap, Thermometer, AlertTriangle, Gauge, Brain } from "lucide-react";
import { useEffect, useState, useRef } from "react";

const WS_URL = "ws://8.138.129.114:3001";

const AI_WS_URL = "ws://8.138.129.114:8000/ws";       // ← 新增：AI 诊断 WebSocket 地址·····改成服务器ip

// 珠海气象API — 免费无需密钥
const WEATHER_URL = "https://api.open-meteo.com/v1/forecast?latitude=22.2769&longitude=113.5678&current=wind_speed_10m&timezone=Asia/Shanghai";

// ← 新增：AI 预警数据的 TypeScript 类型定义
interface AIAlert {
  time: string;
  class: number;
  confidence: number;
  status: string;
  sensor_data: string;
  class_name?: string;   // ← 新增
}

const CLASS_LABELS: Record<number, string> = {
  0: "叶片裂纹",
  1: "正常",
  2: "异物/挂冰",
  3: "轴承故障",
};

export function MainMonitor() {
  const [accelList, setAccelList] = useState<number[]>([0, 0, 0, 0]);
  const [windSpeed, setWindSpeed] = useState("12.4");
  const [aiAlerts, setAiAlerts] = useState<AIAlert[]>([]);   // ← 新增：AI 预警列表
  const wsRef = useRef<WebSocket | null>(null);
  const aiWsRef = useRef<WebSocket | null>(null);             // ← 新增：AI WebSocket 引用
  const accelIndex = useRef(0);

  // WebSocket 加速度数据 — 轮流分给4台风机
  useEffect(() => {
    const connect = () => {
      const ws = new WebSocket(WS_URL);
      wsRef.current = ws;

      ws.onmessage = (event) => {
        try {
          const sensor = JSON.parse(event.data);
          const accel = sensor.total ?? sensor.ax ?? 0;
          setAccelList((prev) => {
            const next = [...prev];
            next[accelIndex.current] = accel;
            accelIndex.current = (accelIndex.current + 1) % 4;
            return next;
          });
        } catch (e) { /* ignore */ }
      };

      ws.onclose = () => setTimeout(connect, 3000);
    };

    connect();
    return () => wsRef.current?.close();
  }, []);

  // AI 诊断 WebSocket — 接收实时诊断预警
  useEffect(() => {
    const connectAI = () => {
      const ws = new WebSocket(AI_WS_URL);
      aiWsRef.current = ws;

      ws.onmessage = (event) => {
        try {
          const result: AIAlert = JSON.parse(event.data);
          if (result.status === "异常") {
            setAiAlerts((prev) => [result, ...prev].slice(0, 5));
          }
        } catch (e) { /* ignore */ }
      };

      ws.onclose = () => setTimeout(connectAI, 3000);
    };

    connectAI();
    return () => aiWsRef.current?.close();
  }, []);

  // 珠海气象风速 — 每5分钟刷新
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

 

  return (
    <div className="relative h-[800px] w-full rounded-xl overflow-hidden bg-[#030614] border border-cyan-500/20 shadow-[0_0_40px_rgba(6,182,212,0.1)]">
      {/* Center 3D Model (Full Background) */}
      <div className="absolute inset-0">
        <WindTurbine3D />
      </div>

      {/* Top Header Overlay */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 pointer-events-none">
        <div className="flex items-center gap-3 bg-[#0a0e27]/60 backdrop-blur-md px-6 py-2 rounded-full border border-cyan-500/30 shadow-[0_0_15px_rgba(6,182,212,0.2)]">
          <h2 className="text-sm font-bold text-cyan-400 tracking-wider">3D 数字孪生 - 中大珠海校区区域监测</h2>
          <div className="w-px h-4 bg-cyan-500/30"></div>
          <div className="flex items-center gap-2 text-xs text-cyan-500/80 font-mono">
            <span>WT_440048_041013</span>
            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
            <span className="text-green-400">ONLINE</span>
          </div>
        </div>
      </div>

      {/* Left Panel - Stats & Alerts */}
      <div className="absolute left-4 top-4 bottom-4 w-72 flex flex-col gap-4 pointer-events-none z-10">
        {/* Parameters */}
        <div className="pointer-events-auto rounded-lg border border-cyan-500/30 bg-[#0a0e27]/70 backdrop-blur-md p-4 shadow-lg">
          <h2 className="mb-4 text-sm font-semibold text-cyan-400 flex items-center gap-2">
            <Activity className="h-4 w-4" /> 实时参数
          </h2>
          <div className="space-y-3">
            <DataCard label="风速（珠海气象台）" value= {windSpeed} unit="m/s" icon={<Wind className="h-5 w-5" />} trend="up" />
            <DataCard label="发电量" value="1458" unit="kW" icon={<Zap className="h-5 w-5" />} trend="up" status="normal" />
            <DataCard label="温度" value="68.4" unit="°C" icon={<Thermometer className="h-5 w-5" />} trend="neutral" />
            <DataCard label="转速" value="12.5" unit="RPM" icon={<Gauge className="h-5 w-5" />} trend="up" />
          </div>
        </div>

        {/* AI 智能诊断预警 */}
        <div className="pointer-events-auto rounded-lg border border-red-500/30 bg-red-950/40 backdrop-blur-md p-4 shadow-lg">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-red-400">
            <Brain className="h-4 w-4 animate-pulse" />
            <span>DANN 智能诊断预警</span>
          </div>
          <div className="space-y-2 max-h-[200px] overflow-auto">
            {aiAlerts.length === 0 ? (
              <div className="rounded border border-green-500/40 bg-green-500/10 p-2 text-xs relative overflow-hidden">
                <div className="absolute left-0 top-0 bottom-0 w-1 bg-green-500"></div>
                <div className="pl-2 font-mono font-semibold text-green-400">STATUS_OK</div>
                <div className="pl-2 text-green-300">AI 模型未检测到异常</div>
                <div className="pl-2 mt-1 text-green-400/60">神经网络持续监控中</div>
              </div>
            ) : (
              aiAlerts.map((alert, i) => (
                <div key={i} className="rounded border border-red-500/40 bg-red-500/10 p-2 text-xs relative overflow-hidden">
                  <div className="absolute left-0 top-0 bottom-0 w-1 bg-red-500"></div>
                  <div className="pl-2 font-mono font-semibold text-red-400">
                    AI_ALERT_{CLASS_LABELS[alert.class]?.replace(/[^\u4e00-\u9fa5]/g, "") || "UNKNOWN"}
                  </div>
                  <div className="pl-2 text-red-300">
                    {CLASS_LABELS[alert.class] || "未知故障"} (置信度: {(alert.confidence * 100).toFixed(1)}%)
                  </div>
                  <div className="pl-2 mt-1 text-red-400/60">{alert.time}</div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Right Panel - 4台风机加速度 */}
      <div className="absolute right-4 top-4 w-72 flex flex-col gap-4 pointer-events-none z-10">
        <div className="pointer-events-auto rounded-lg border border-cyan-500/30 bg-[#0a0e27]/70 backdrop-blur-md p-4 shadow-lg">
          <h3 className="mb-3 text-xs font-semibold text-cyan-400 flex items-center gap-2">
            <Activity className="h-4 w-4" /> 实时加速度 (m/s²)
          </h3>
          <div className="space-y-2">
            {["WT-01", "WT-02", "WT-03", "WT-04"].map((label, i) => (
              <div key={i} className="flex items-center justify-between rounded border border-cyan-500/20 bg-cyan-500/5 px-3 py-2">
                <span className="text-xs text-cyan-400/70 font-mono">{label}</span>
                <span className="text-lg font-bold text-cyan-300 font-mono">{accelList[i].toFixed(2)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}