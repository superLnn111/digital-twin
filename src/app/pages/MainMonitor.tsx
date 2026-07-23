import { DataCard } from "../components/DataCard";
import { WindTurbine3D } from "../components/WindTurbine3D";
import { Activity, Wind, Zap, Thermometer, AlertTriangle, Gauge } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip } from "recharts";
import { useEffect, useState, useRef } from "react";

const WS_URL = "ws://8.138.129.114:3001";

export function MainMonitor() {
  const [data, setData] = useState<{ id: string; time: string; acceleration: number }[]>([]);
  const [currentAccel, setCurrentAccel] = useState(0);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    const connect = () => {
      const ws = new WebSocket(WS_URL);
      wsRef.current = ws;

      ws.onmessage = (event) => {
        try {
          const sensor = JSON.parse(event.data);
          const accel = sensor.total ?? sensor.ax ?? 0;
          const now = new Date();
          const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;

          setCurrentAccel(accel);
          setData((prev) => {
            const newData = [...prev, { id: `id-${Date.now()}`, time: timeStr, acceleration: accel }];
            return newData.slice(-20);
          });
        } catch (e) { /* ignore */ }
      };

      ws.onclose = () => setTimeout(connect, 3000);
    };

    connect();
    return () => wsRef.current?.close();
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
            <Activity className="h-4 w-4" /> 实时参数矩阵
          </h2>
          <div className="space-y-3">
            <DataCard label="风速" value="12.4" unit="m/s" icon={<Wind className="h-5 w-5" />} trend="up" />
            <DataCard label="发电量" value="1458" unit="kW" icon={<Zap className="h-5 w-5" />} trend="up" status="normal" />
            <DataCard label="温度" value="68.4" unit="°C" icon={<Thermometer className="h-5 w-5" />} trend="neutral" />
            <DataCard label="转速" value="12.5" unit="RPM" icon={<Gauge className="h-5 w-5" />} trend="up" />
            <DataCard label="加速度" value={currentAccel.toFixed(2)} unit="m/s²" icon={<Activity className="h-5 w-5" />} trend="down" />
          </div>
        </div>

        {/* Alerts */}
        <div className="pointer-events-auto rounded-lg border border-red-500/30 bg-red-950/40 backdrop-blur-md p-4 shadow-lg">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-red-400">
            <AlertTriangle className="h-4 w-4 animate-pulse" />
            <span>智能诊断预警</span>
          </div>
          <div className="space-y-2">
            <div className="rounded border border-red-500/40 bg-red-500/10 p-2 text-xs relative overflow-hidden">
              <div className="absolute left-0 top-0 bottom-0 w-1 bg-red-500"></div>
              <div className="pl-2 font-mono font-semibold text-red-400">ERR_GEARBOX_TEMP</div>
              <div className="pl-2 text-red-300">齿轮箱温度过高: 92°C</div>
              <div className="pl-2 mt-1 text-red-400/60">建议立即降载检修</div>
            </div>
            <div className="rounded border border-yellow-500/40 bg-yellow-500/10 p-2 text-xs relative overflow-hidden">
              <div className="absolute left-0 top-0 bottom-0 w-1 bg-yellow-500"></div>
              <div className="pl-2 font-mono font-semibold text-yellow-400">WARN_MAIN_SHAFT</div>
              <div className="pl-2 text-yellow-300">主轴承振动值偏高</div>
              <div className="pl-2 mt-1 text-yellow-400/60">系统持续监控中</div>
            </div>
          </div>
        </div>
      </div>

      {/* Right Panel - Charts & Controls */}
      <div className="absolute right-4 top-4 w-80 flex flex-col gap-4 pointer-events-none z-10">
        {/* Accel Chart */}
        <div className="pointer-events-auto rounded-lg border border-cyan-500/30 bg-[#0a0e27]/70 backdrop-blur-md p-4 shadow-lg">
          <h3 className="mb-3 text-xs font-semibold text-cyan-400 flex items-center gap-2">
            <Activity className="h-4 w-4" /> 振动加速度动态分析
          </h3>
          <LineChart width={285} height={140} data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(6, 182, 212, 0.1)" />
            <XAxis dataKey="time" stroke="#06b6d4" style={{ fontSize: 10 }} tick={{ fill: '#06b6d4' }} />
            <YAxis stroke="#06b6d4" style={{ fontSize: 10 }} tick={{ fill: '#06b6d4' }} />
            <Tooltip
              contentStyle={{ backgroundColor: "rgba(10, 14, 39, 0.9)", border: "1px solid rgba(6, 182, 212, 0.4)", borderRadius: 4 }}
              labelStyle={{ color: "#06b6d4" }}
              itemStyle={{ color: "#38bdf8" }}
            />
            <Line type="monotone" dataKey="acceleration" stroke="#0ea5e9" strokeWidth={2} dot={false} isAnimationActive={false} />
          </LineChart>
        </div>
      </div>
    </div>
  );
}