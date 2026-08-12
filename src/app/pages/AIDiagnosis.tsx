import { useEffect, useState, useRef, useCallback } from "react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from "recharts";
import {
  Brain, Activity, AlertTriangle, CheckCircle, Wifi,
  WifiOff, Clock, Zap, BarChart3,
} from "lucide-react";

const WS_URL = "ws://8.138.129.114:8000/ws";    // ····改成服务器ip

interface DiagnosisResult {
  time: string;
  sensor_data: string;
  class: number;
  confidence: number;
  status: string;
  class_name?: string;   // ← 新增
  error?: string;
}

const CLASS_LABELS: Record<number, string> = {
  0: "叶片裂纹",
  1: "正常",
  2: "异物/挂冰",
  3: "轴承故障",
};

export function AIDiagnosis() {
  const [results, setResults] = useState<DiagnosisResult[]>([]);
  const [chartData, setChartData] = useState<{ time: string; confidence: number; class: number }[]>([]);
  const [connected, setConnected] = useState(false);
  const [latestResult, setLatestResult] = useState<DiagnosisResult | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  const connect = useCallback(() => {
    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => setConnected(true);

    ws.onmessage = (event) => {
      try {
        const data: DiagnosisResult = JSON.parse(event.data);
        setLatestResult(data);
        setResults((prev) => [...prev.slice(-50), data]);
        setChartData((prev) => {
          const point = {
            time: data.time?.slice(11, 19) || "",
            confidence: data.confidence || 0,
            class: data.class ?? -1,
          };
          return [...prev.slice(-60), point];
        });
      } catch (e) {
        /* ignore parse errors */
      }
    };

    ws.onclose = () => {
      setConnected(false);
      setTimeout(connect, 3000);
    };

    ws.onerror = () => ws.close();
  }, []);

  useEffect(() => {
    connect();
    return () => wsRef.current?.close();
  }, [connect]);

  const anomalyCount = results.filter((r) => r.status === "异常").length;
  const normalCount = results.filter((r) => r.status === "正常").length;
  const avgConfidence =
    results.length > 0
      ? (results.reduce((sum, r) => sum + r.confidence, 0) / results.length * 100).toFixed(1)
      : "0";

  const getStatusColor = (status: string) =>
    status === "异常" ? "text-red-400" : "text-green-400";

  const getStatusBg = (status: string) =>
    status === "异常"
      ? "bg-red-500/10 border-red-500/30"
      : "bg-green-500/10 border-green-500/30";

  return (
    <div className="space-y-6">
      {/* 标题栏 */}
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-cyan-400">
          <Brain className="h-5 w-5" /> DANN 领域自适应智能诊断
        </h2>
        <div
          className={`flex items-center gap-2 rounded-full px-4 py-1.5 text-sm border ${
            connected
              ? "border-green-500/30 bg-green-500/10 text-green-400"
              : "border-red-500/30 bg-red-500/10 text-red-400"
          }`}
        >
          {connected ? <Wifi className="h-4 w-4" /> : <WifiOff className="h-4 w-4" />}
          {connected ? "已连接后端" : "连接断开 - 自动重连中"}
        </div>
      </div>

      {/* 统计卡片 */}
      <div className="grid grid-cols-4 gap-4">
        <div className="rounded-lg border border-cyan-500/20 bg-[#0d1229]/50 p-4">
          <div className="mb-2 flex items-center gap-2">
            <Activity className="h-4 w-4 text-cyan-400" />
            <span className="text-xs text-cyan-500/70">总诊断次数</span>
          </div>
          <div className="text-2xl font-bold text-cyan-300">{results.length}</div>
        </div>
        <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-4">
          <div className="mb-2 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-red-400" />
            <span className="text-xs text-red-400/70">异常诊断</span>
          </div>
          <div className="text-2xl font-bold text-red-400">{anomalyCount}</div>
        </div>
        <div className="rounded-lg border border-green-500/20 bg-green-500/5 p-4">
          <div className="mb-2 flex items-center gap-2">
            <CheckCircle className="h-4 w-4 text-green-400" />
            <span className="text-xs text-green-400/70">正常诊断</span>
          </div>
          <div className="text-2xl font-bold text-green-400">{normalCount}</div>
        </div>
        <div className="rounded-lg border border-cyan-500/20 bg-[#0d1229]/50 p-4">
          <div className="mb-2 flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-cyan-400" />
            <span className="text-xs text-cyan-500/70">平均置信度</span>
          </div>
          <div className="text-2xl font-bold text-cyan-300">{avgConfidence}%</div>
        </div>
      </div>

      {/* 最新诊断结果 + 置信度趋势图 */}
      <div className="grid grid-cols-2 gap-6">
        {/* 最新诊断结果 */}
        <div
          className={`rounded-lg border p-6 ${
            latestResult
              ? getStatusBg(latestResult.status)
              : "border-cyan-500/20 bg-[#0d1229]/50"
          }`}
        >
          <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold text-cyan-400">
            <Zap className="h-4 w-4" /> 最新诊断结果
          </h3>
          {latestResult ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-cyan-500/70">诊断时间</span>
                <span className="flex items-center gap-1 text-sm text-cyan-300">
                  <Clock className="h-3 w-3" /> {latestResult.time}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-cyan-500/70">诊断状态</span>
                <span className={`text-lg font-bold ${getStatusColor(latestResult.status)}`}>
                  {latestResult.status}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-cyan-500/70">故障类别</span>
                <span className="text-sm text-cyan-300">
                  {latestResult.class_name ?? CLASS_LABELS[latestResult.class] ?? `未知类别(${latestResult.class})`}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-cyan-500/70">置信度</span>
                <span className="text-sm text-cyan-300">
                  {(latestResult.confidence * 100).toFixed(1)}%
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-cyan-500/70">原始传感器数据</span>
                <span className="text-xs text-cyan-500/50 max-w-[200px] truncate">
                  {latestResult.sensor_data}
                </span>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-8 text-cyan-500/50">
              <Brain className="h-12 w-12 mb-2 animate-pulse" />
              <span className="text-sm">等待诊断数据...</span>
            </div>
          )}
        </div>

        {/* 置信度趋势图 */}
        <div className="rounded-lg border border-cyan-500/20 bg-[#0d1229]/50 p-4">
          <h3 className="mb-3 text-sm font-semibold text-cyan-400">置信度趋势</h3>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={chartData}>
              <defs>
                <linearGradient id="confidenceGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#06b6d4" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(6,182,212,0.1)" />
              <XAxis dataKey="time" stroke="#06b6d4" style={{ fontSize: 9 }} />
              <YAxis domain={[0, 1]} stroke="#06b6d4" style={{ fontSize: 9 }} />
              <Tooltip
                contentStyle={{
                  backgroundColor: "#0d1229",
                  border: "1px solid rgba(6,182,212,0.3)",
                  borderRadius: 8,
                }}
                labelStyle={{ color: "#06b6d4" }}
              />
              <Area
                type="monotone"
                dataKey="confidence"
                stroke="#06b6d4"
                strokeWidth={2}
                fill="url(#confidenceGrad)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* 诊断历史记录表格 */}
      <div className="rounded-lg border border-cyan-500/20 bg-[#0d1229]/50 p-4">
        <h3 className="mb-4 text-sm font-semibold text-cyan-400">诊断历史记录</h3>
        <div className="max-h-[400px] overflow-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-cyan-500/20 text-cyan-500/70">
                <th className="py-2 text-left">时间</th>
                <th className="py-2 text-left">状态</th>
                <th className="py-2 text-left">故障类别</th>
                <th className="py-2 text-left">置信度</th>
                <th className="py-2 text-left">传感器数据</th>
              </tr>
            </thead>
            <tbody>
              {[...results].reverse().slice(0, 30).map((r, i) => (
                <tr key={i} className="border-b border-cyan-500/10 hover:bg-cyan-500/5">
                  <td className="py-2 text-cyan-300">{r.time}</td>
                  <td className={`py-2 font-semibold ${getStatusColor(r.status)}`}>
                    {r.status}
                  </td>
                  <td className="py-2 text-cyan-300">
                    {r.class_name ?? CLASS_LABELS[r.class] ?? `未知类别(${r.class})`}
                  </td>
                  <td className="py-2 text-cyan-300">
                    {(r.confidence * 100).toFixed(1)}%
                  </td>
                  <td className="py-2 text-cyan-500/50 max-w-[150px] truncate">
                    {r.sensor_data}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}