// ============================================================
// RealTimeData.tsx — 传感器实时数据监测页面（纯真实数据版）
// ============================================================
// 展示 7 张实时曲线图：加速度×4 + 温度 + 湿度 + 风速（气象台）
// 数据来源：WebSocket 网关（加速度/温度/湿度）+ Open-Meteo 气象 API（风速）
// 无模拟数据 — 没有真实数据时显示 "--" 或空图表
// 右上角数据源状态指示器：区分网关连接 / 各传感器数据 / 气象API
// ============================================================

import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import {
  AreaChart, Area, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import {
  Activity, Wind, Thermometer, Droplets, Wifi, WifiOff,
  CloudOff, Cloud, RefreshCw,
} from "lucide-react";
import { CameraFeed } from "../components/CameraFeed";

// ========== 常量 ==========

const WS_URL = "ws://8.138.129.114/api/v1/live?gateway_id=gateway-01";
const WEATHER_URL = "https://api.open-meteo.com/v1/forecast?latitude=22.2769&longitude=113.5678&current=wind_speed_10m,temperature_2m,relative_humidity_2m&timezone=Asia/Shanghai";
const CAMERA_STREAM_URL = "http://8.138.129.114:8080/?action=stream";
const MAX_CHART_POINTS = 60;

// ========== 类型 ==========

interface SensorSnapshot {
  time: string;
  accel1: number | null;
  accel2: number | null;
  accel3: number | null;
  accel4: number | null;
  temperature: number | null;
  humidity: number | null;
  windSpeed: number | null;
}

type SourceKey = "gateway" | "acceleration" | "temperature" | "humidity" | "weather";

// ========== 传感器卡片配置 ==========

interface SensorConfig {
  id: string;
  name: string;
  dataKey: keyof SensorSnapshot;
  unit: string;
  icon: typeof Activity;
  color: string;
}

// ========== 主组件 ==========

export function RealTimeData() {
  // ----- 数据源可用状态：区分类型，方便排障 -----
  const [sourceStatus, setSourceStatus] = useState<Record<SourceKey, boolean>>({
    gateway: false,
    acceleration: false,
    temperature: false,
    humidity: false,
    weather: false,
  });

  // ----- 最新传感器数值（卡片显示）-----
  const [sensorData, setSensorData] = useState<SensorSnapshot>({
    time: "",
    accel1: null, accel2: null, accel3: null, accel4: null,
    temperature: null,
    humidity: null,
    windSpeed: null,
  });

  // ----- 历史数据（图表）-----
  const [chartData, setChartData] = useState<SensorSnapshot[]>([]);

  // ----- WebSocket 引用 -----
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<NodeJS.Timeout | null>(null);

  // ----- 气象API定时器 -----
  const weatherTimerRef = useRef<NodeJS.Timeout | null>(null);

  // ----- 格式化时间 -----
  const timeStr = useCallback(() => {
    const n = new Date();
    return `${n.getHours()}:${n.getMinutes().toString().padStart(2, "0")}:${n.getSeconds().toString().padStart(2, "0")}`;
  }, []);

  // ========== WebSocket 连接 ==========
  useEffect(() => {
    const connect = () => {
      const ws = new WebSocket(WS_URL);
      wsRef.current = ws;

      ws.onopen = () => {
        setSourceStatus((prev) => ({ ...prev, gateway: true }));
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type !== "sensor_sample_batch" || !msg.data?.length) return;

          const samples = msg.data;
          const now = timeStr();

          // 提取加速度（最多4个传感器，每个取三轴合成幅值）
          const accelValues: (number | null)[] = [null, null, null, null];
          let hasAccel = false;
          for (let i = 0; i < Math.min(samples.length, 4); i++) {
            const acc = samples[i]?.physical?.acceleration_m_s2;
            if (acc && typeof acc.x === "number") {
              accelValues[i] = Math.sqrt(acc.x ** 2 + acc.y ** 2 + acc.z ** 2);
              hasAccel = true;
            }
          }

          // 提取温度（取第一个样本的温度）
          let temperature: number | null = null;
          let hasTemp = false;
          for (const s of samples) {
            const t = s?.physical?.temperature_c;
            if (typeof t === "number") { temperature = t; hasTemp = true; break; }
          }

          // 提取湿度
          let humidity: number | null = null;
          let hasHumidity = false;
          for (const s of samples) {
            const h = s?.physical?.humidity_pct ?? s?.physical?.humidity;
            if (typeof h === "number") { humidity = h; hasHumidity = true; break; }
          }

          // 更新数据源状态
          setSourceStatus((prev) => ({
            ...prev,
            gateway: true,
            acceleration: hasAccel || prev.acceleration,
            temperature: hasTemp || prev.temperature,
            humidity: hasHumidity || prev.humidity,
          }));

          // 更新最新数值
          const snapshot: SensorSnapshot = {
            time: now,
            accel1: accelValues[0],
            accel2: accelValues[1],
            accel3: accelValues[2],
            accel4: accelValues[3],
            temperature,
            humidity,
            windSpeed: null, // 天气数据另外填充
          };
          setSensorData((prev) => ({ ...prev, ...snapshot }));

          // 追加到图表数据
          setChartData((prev) => {
            const next = [...prev, snapshot];
            return next.length > MAX_CHART_POINTS ? next.slice(-MAX_CHART_POINTS) : next;
          });
        } catch {
          // 解析失败，静默
        }
      };

      ws.onclose = () => {
        setSourceStatus((prev) => ({ ...prev, gateway: false }));
        reconnectTimerRef.current = setTimeout(connect, 3000);
      };

      ws.onerror = () => {
        ws.close();
      };
    };

    connect();
    return () => {
      wsRef.current?.close();
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
    };
  }, [timeStr]);

  // ========== 气象API：风速 ==========
  useEffect(() => {
    const fetchWeather = () => {
      fetch(WEATHER_URL)
        .then((res) => res.json())
        .then((json) => {
          const w = json?.current?.wind_speed_10m;
          if (w != null) {
            const now = timeStr();
            setSensorData((prev) => ({ ...prev, windSpeed: w }));
            setSourceStatus((prev) => ({ ...prev, weather: true }));
            setChartData((prev) => {
              const last = prev[prev.length - 1];
              if (last) {
                const updated = [...prev];
                updated[updated.length - 1] = { ...last, windSpeed: w };
                return updated;
              }
              return [{ time: now, accel1: null, accel2: null, accel3: null, accel4: null, temperature: null, humidity: null, windSpeed: w }];
            });
          }
        })
        .catch(() => {
          setSourceStatus((prev) => ({ ...prev, weather: false }));
        });
    };

    fetchWeather();
    weatherTimerRef.current = setInterval(fetchWeather, 5 * 60 * 1000);
    return () => { if (weatherTimerRef.current) clearInterval(weatherTimerRef.current); };
  }, [timeStr]);

  // ========== 手动重连 ==========
  const handleReconnect = useCallback(() => {
    wsRef.current?.close();
    setSourceStatus({ gateway: false, acceleration: false, temperature: false, humidity: false, weather: sourceStatus.weather });
  }, [sourceStatus.weather]);

  // ========== 传感器卡片配置（7个） ==========
  const sensors: SensorConfig[] = useMemo(() => [
    { id: "ACCEL_01", name: "加速度传感器 1", dataKey: "accel1", unit: "m/s²", icon: Activity, color: "#06b6d4" },
    { id: "ACCEL_02", name: "加速度传感器 2", dataKey: "accel2", unit: "m/s²", icon: Activity, color: "#22d3ee" },
    { id: "ACCEL_03", name: "加速度传感器 3", dataKey: "accel3", unit: "m/s²", icon: Activity, color: "#67e8f9" },
    { id: "ACCEL_04", name: "加速度传感器 4", dataKey: "accel4", unit: "m/s²", icon: Activity, color: "#a5f3fc" },
    { id: "TEMP_01", name: "温度传感器", dataKey: "temperature", unit: "°C", icon: Thermometer, color: "#f97316" },
    { id: "HUM_01", name: "湿度传感器", dataKey: "humidity", unit: "%", icon: Droplets, color: "#3b82f6" },
    { id: "WIND_EXT", name: "风速（气象台）", dataKey: "windSpeed", unit: "m/s", icon: Wind, color: "#10b981" },
  ], []);

  // ========== 格式化数值 ==========
  const fmt = (v: number | null, decimals = 2) =>
    v != null ? v.toFixed(decimals) : "--";

  // ========== 渲染 ==========
  return (
    <div className="space-y-6">
      {/* ========== 监控摄像头 ========== */}
      <CameraFeed streamUrl={CAMERA_STREAM_URL} />

      {/* ========== 顶部 Header：标题 + 数据源状态 ========== */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-cyan-400">传感器实时数据</h2>

        {/* ---- 数据源状态指示器（右上角）---- */}
        <div className="flex items-center gap-4 text-xs">
          {/* 网关连接 */}
          <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded border ${sourceStatus.gateway ? "border-green-500/30 bg-green-500/10" : "border-red-500/30 bg-red-500/10"}`}>
            {sourceStatus.gateway ? <Wifi className="h-3 w-3 text-green-400" /> : <WifiOff className="h-3 w-3 text-red-400" />}
            <span className={sourceStatus.gateway ? "text-green-400" : "text-red-400"}>
              网关{sourceStatus.gateway ? "已连接" : "未连接"}
            </span>
          </div>

          {/* 加速度数据 */}
          <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded border ${sourceStatus.acceleration ? "border-green-500/30 bg-green-500/10" : "border-yellow-500/30 bg-yellow-500/10"}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${sourceStatus.acceleration ? "bg-green-500" : "bg-yellow-500 animate-pulse"}`} />
            <span className={sourceStatus.acceleration ? "text-green-400" : "text-yellow-400"}>
              加速度{sourceStatus.acceleration ? "有数据" : "等待数据"}
            </span>
          </div>

          {/* 温度数据 */}
          <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded border ${sourceStatus.temperature ? "border-green-500/30 bg-green-500/10" : "border-yellow-500/30 bg-yellow-500/10"}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${sourceStatus.temperature ? "bg-green-500" : "bg-yellow-500 animate-pulse"}`} />
            <span className={sourceStatus.temperature ? "text-green-400" : "text-yellow-400"}>
              温度{sourceStatus.temperature ? "有数据" : "等待数据"}
            </span>
          </div>

          {/* 湿度数据 */}
          <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded border ${sourceStatus.humidity ? "border-green-500/30 bg-green-500/10" : "border-yellow-500/30 bg-yellow-500/10"}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${sourceStatus.humidity ? "bg-green-500" : "bg-yellow-500 animate-pulse"}`} />
            <span className={sourceStatus.humidity ? "text-green-400" : "text-yellow-400"}>
              湿度{sourceStatus.humidity ? "有数据" : "等待数据"}
            </span>
          </div>

          {/* 气象API */}
          <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded border ${sourceStatus.weather ? "border-green-500/30 bg-green-500/10" : "border-red-500/30 bg-red-500/10"}`}>
            {sourceStatus.weather ? <Cloud className="h-3 w-3 text-green-400" /> : <CloudOff className="h-3 w-3 text-red-400" />}
            <span className={sourceStatus.weather ? "text-green-400" : "text-red-400"}>
              气象{sourceStatus.weather ? "OK" : "失败"}
            </span>
          </div>

          {/* 重连按钮 */}
          <button
            onClick={handleReconnect}
            className="flex items-center gap-1 px-2 py-1 rounded border border-cyan-500/30 bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 transition-colors"
          >
            <RefreshCw className="h-3 w-3" /> 重连
          </button>
        </div>
      </div>

      {/* ========== 7 个传感器数值卡片 ========== */}
      <div className="grid grid-cols-7 gap-3">
        {sensors.map((s) => (
          <div key={s.id} className="rounded-lg border border-cyan-500/20 bg-[#0d1229]/50 p-3">
            <div className="mb-2 flex items-center justify-between">
              <s.icon className="h-4 w-4" style={{ color: s.color }} />
            </div>
            <div className="mb-1 text-xs text-cyan-500/70 truncate" title={s.name}>{s.name}</div>
            <div className="flex items-baseline gap-1">
              <span className="text-lg font-bold" style={{ color: s.color }}>
                {fmt(sensorData[s.dataKey], s.id.startsWith("HUM") || s.id.startsWith("TEMP") ? 1 : 2)}
              </span>
              <span className="text-xs text-cyan-500/50">{s.unit}</span>
            </div>
            <div className="mt-1 text-xs text-cyan-500/50">{s.id}</div>
          </div>
        ))}
      </div>

      {/* ========== 加速度×4 合并曲线图（全宽） ========== */}
      <div className="rounded-lg border border-cyan-500/20 bg-[#0d1229]/50 p-4">
        <h3 className="mb-3 text-sm font-semibold text-cyan-400">四路加速度传感器 - 实时曲线对比</h3>
        {chartData.length === 0 ? (
          <div className="h-[280px] flex items-center justify-center text-cyan-500/40 text-sm font-mono">
            等待数据...
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={chartData}>
              <defs>
                {["#06b6d4", "#22d3ee", "#67e8f9", "#a5f3fc"].map((c, i) => (
                  <linearGradient key={i} id={`grad-accel-${i}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={c} stopOpacity={0.25} />
                    <stop offset="95%" stopColor={c} stopOpacity={0} />
                  </linearGradient>
                ))}
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(6,182,212,0.1)" />
              <XAxis dataKey="time" stroke="#06b6d4" style={{ fontSize: 9 }} interval="preserveStartEnd" />
              <YAxis stroke="#06b6d4" style={{ fontSize: 9 }} domain={["auto", "auto"]} />
              <Tooltip
                contentStyle={{ backgroundColor: "#0d1229", border: "1px solid rgba(6,182,212,0.3)", borderRadius: 8 }}
                labelStyle={{ color: "#06b6d4" }}
              />
              <Area type="monotone" dataKey="accel1" stroke="#06b6d4" strokeWidth={2} fill="url(#grad-accel-0)" connectNulls={false} name="加速度1" />
              <Area type="monotone" dataKey="accel2" stroke="#22d3ee" strokeWidth={2} fill="url(#grad-accel-1)" connectNulls={false} name="加速度2" />
              <Area type="monotone" dataKey="accel3" stroke="#67e8f9" strokeWidth={2} fill="url(#grad-accel-2)" connectNulls={false} name="加速度3" />
              <Area type="monotone" dataKey="accel4" stroke="#a5f3fc" strokeWidth={2} fill="url(#grad-accel-3)" connectNulls={false} name="加速度4" />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* ========== 温度 / 湿度 / 风速 三列曲线图 ========== */}
      <div className="grid grid-cols-3 gap-6">
        {[
          { id: "TEMP_01", name: "温度传感器", dataKey: "temperature" as const, unit: "°C", color: "#f97316" },
          { id: "HUM_01", name: "湿度传感器", dataKey: "humidity" as const, unit: "%", color: "#3b82f6" },
          { id: "WIND_EXT", name: "风速（气象台）", dataKey: "windSpeed" as const, unit: "m/s", color: "#10b981" },
        ].map((s) => (
          <div key={s.id} className="rounded-lg border border-cyan-500/20 bg-[#0d1229]/50 p-4">
            <h3 className="mb-3 text-sm font-semibold" style={{ color: s.color }}>
              {s.name} - 实时曲线
            </h3>
            {chartData.length === 0 ? (
              <div className="h-[200px] flex items-center justify-center text-cyan-500/40 text-sm font-mono">
                等待数据...
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id={`grad-${s.id}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={s.color} stopOpacity={0.3} />
                      <stop offset="95%" stopColor={s.color} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(6,182,212,0.1)" />
                  <XAxis dataKey="time" stroke="#06b6d4" style={{ fontSize: 9 }} interval="preserveStartEnd" />
                  <YAxis stroke="#06b6d4" style={{ fontSize: 9 }} domain={["auto", "auto"]} />
                  <Tooltip
                    contentStyle={{ backgroundColor: "#0d1229", border: `1px solid ${s.color}40`, borderRadius: 8 }}
                    labelStyle={{ color: s.color }}
                  />
                  <Area
                    type="monotone"
                    dataKey={s.dataKey}
                    stroke={s.color}
                    strokeWidth={2}
                    fill={`url(#grad-${s.id})`}
                    connectNulls={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}