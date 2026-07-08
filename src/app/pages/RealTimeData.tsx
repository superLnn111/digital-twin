import { useEffect, useState, useRef, useCallback } from "react";
import { LineChart, Line, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { Activity, Wind, Zap, RefreshCw, PowerOff } from "lucide-react";

export function RealTimeData() {
  const [data, setData] = useState<any[]>([]);
  const [wsStatus, setWsStatus] = useState("disconnected");
  const fallbackSimRef = useRef<NodeJS.Timeout | null>(null);
  const [sensorData, setSensorData] = useState({
    acceleration: 1.23,
    power: 1458,
    windSpeed: 12.4,
  });

  const connectWebSocket = useCallback(() => {
    setWsStatus("connected");
    
    if (fallbackSimRef.current) clearInterval(fallbackSimRef.current);
    
    fallbackSimRef.current = setInterval(() => {
      setData((prev) => {
        const now = new Date();
        const timeStr = `${now.getHours()}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;
        const newPoint = {
          time: timeStr,
          acceleration: 0.8 + Math.random() * 1.5,
          power: 1300 + Math.random() * 300,
          windSpeed: 10 + Math.random() * 4,
        };
        setSensorData({
          acceleration: newPoint.acceleration,
          power: newPoint.power,
          windSpeed: newPoint.windSpeed,
        });
        return [...prev, newPoint].slice(-30);
      });
    }, 1000);
  }, []);

  const disconnectWebSocket = useCallback(() => {
    setWsStatus("disconnected");
    if (fallbackSimRef.current) {
      clearInterval(fallbackSimRef.current);
      fallbackSimRef.current = null;
    }
  }, []);

  useEffect(() => {
    connectWebSocket();
    return () => {
      if (fallbackSimRef.current) clearInterval(fallbackSimRef.current);
    };
  }, [connectWebSocket]);

  const sensors = [
    {
      name: "加速度传感器",
      id: "ACCEL_01",
      value: sensorData.acceleration.toFixed(2),
      unit: "m/s²",
      icon: Activity,
      color: "#06b6d4",
      dataKey: "acceleration",
    },
    {
      name: "风速传感器",
      id: "WIND_01",
      value: sensorData.windSpeed.toFixed(1),
      unit: "m/s",
      icon: Wind,
      color: "#3b82f6",
      dataKey: "windSpeed",
    },
    {
      name: "功率传感器",
      id: "POW_01",
      value: sensorData.power.toFixed(0),
      unit: "kW",
      icon: Zap,
      color: "#10b981",
      dataKey: "power",
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-cyan-400">传感器实时数据</h2>
        <div className="flex items-center space-x-4">
          <div className="flex items-center text-sm px-3 py-1.5 bg-[#0d1229]/80 rounded border border-cyan-500/20">
            <span className="mr-2 text-cyan-500/70">状态:</span>
            {wsStatus === "connected" && <span className="text-green-400 flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div> 已连接</span>}
            {wsStatus === "connecting" && <span className="text-yellow-400">连接中...</span>}
            {(wsStatus === "disconnected" || wsStatus === "error") && <span className="text-red-400 flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-red-500"></div> 已断开</span>}
          </div>
          <div className="flex gap-2">
            <button 
              onClick={connectWebSocket}
              disabled={wsStatus === 'connected'}
              className="flex items-center text-sm bg-cyan-500/10 hover:bg-cyan-500/20 disabled:opacity-50 disabled:cursor-not-allowed text-cyan-400 px-4 py-1.5 rounded transition-colors border border-cyan-500/30"
            >
              <RefreshCw className={`h-4 w-4 mr-1 ${wsStatus === 'connecting' ? 'animate-spin' : ''}`} /> 重连
            </button>
            <button 
              onClick={disconnectWebSocket}
              disabled={wsStatus === 'disconnected'}
              className="flex items-center text-sm bg-red-500/10 hover:bg-red-500/20 disabled:opacity-50 disabled:cursor-not-allowed text-red-400 px-4 py-1.5 rounded transition-colors border border-red-500/30"
            >
              <PowerOff className="h-4 w-4 mr-1" /> 断开链接
            </button>
          </div>
        </div>
      </div>

      {/* Sensor Grid */}
      <div className="grid grid-cols-3 gap-4">
        {sensors.map((sensor) => (
          <div key={sensor.id} className="rounded-lg border border-cyan-500/20 bg-[#0d1229]/50 p-4">
            <div className="mb-2 flex items-center justify-between">
              <sensor.icon className="h-5 w-5" style={{ color: sensor.color }} />
              <div className={`h-2 w-2 rounded-full ${wsStatus === 'connected' ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`}></div>
            </div>
            <div className="mb-1 text-xs text-cyan-500/70">{sensor.name}</div>
            <div className="flex items-baseline gap-1">
              <span className="text-2xl font-bold" style={{ color: sensor.color }}>
                {wsStatus === 'connected' ? sensor.value : '--'}
              </span>
              <span className="text-sm text-cyan-500/50">{sensor.unit}</span>
            </div>
            <div className="mt-1 text-xs text-cyan-500/50">{sensor.id}</div>
          </div>
        ))}
      </div>

      {/* Real-time Charts */}
      <div className="grid grid-cols-3 gap-6">
        {sensors.map((sensor) => (
          <div key={sensor.id} className="rounded-lg border border-cyan-500/20 bg-[#0d1229]/50 p-4">
            <h3 className="mb-3 text-sm font-semibold" style={{ color: sensor.color }}>
              {sensor.name} - 实时曲线
            </h3>
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={data}>
                <defs>
                  <linearGradient id={`gradient-${sensor.id}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={sensor.color} stopOpacity={0.3} />
                    <stop offset="95%" stopColor={sensor.color} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(6, 182, 212, 0.1)" />
                <XAxis dataKey="time" stroke="#06b6d4" style={{ fontSize: 9 }} />
                <YAxis stroke="#06b6d4" style={{ fontSize: 9 }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#0d1229",
                    border: `1px solid ${sensor.color}40`,
                    borderRadius: 8,
                  }}
                  labelStyle={{ color: sensor.color }}
                />
                <Area type="monotone" dataKey={sensor.dataKey} stroke={sensor.color} strokeWidth={2} fill={`url(#gradient-${sensor.id})`} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        ))}
      </div>

      {/* Multi-sensor comparison */}
      <div className="rounded-lg border border-cyan-500/20 bg-[#0d1229]/50 p-4">
        <h3 className="mb-4 text-sm font-semibold text-cyan-400">核心参数对比分析</h3>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(6, 182, 212, 0.1)" />
            <XAxis dataKey="time" stroke="#06b6d4" style={{ fontSize: 10 }} />
            <YAxis yAxisId="left" stroke="#06b6d4" style={{ fontSize: 10 }} />
            <YAxis yAxisId="right" orientation="right" stroke="#06b6d4" style={{ fontSize: 10 }} />
            <Tooltip
              contentStyle={{
                backgroundColor: "#0d1229",
                border: "1px solid rgba(6, 182, 212, 0.3)",
                borderRadius: 8,
              }}
              labelStyle={{ color: "#06b6d4" }}
            />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Line yAxisId="left" type="monotone" dataKey="acceleration" stroke="#06b6d4" strokeWidth={2} dot={false} name="加速度 (m/s²)" />
            <Line yAxisId="left" type="monotone" dataKey="windSpeed" stroke="#3b82f6" strokeWidth={2} dot={false} name="风速 (m/s)" />
            <Line yAxisId="right" type="monotone" dataKey="power" stroke="#10b981" strokeWidth={2} dot={false} name="功率 (kW)" />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
