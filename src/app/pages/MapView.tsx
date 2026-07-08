import { useState } from "react";
import { Wind, Activity, AlertTriangle, Info, Zap, Gauge } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer } from "recharts";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, Html } from "@react-three/drei";
import { TurbineModel } from "../components/WindTurbine3D";

interface Turbine {
  id: string;
  name: string;
  x: number;
  z: number;
  status: "normal" | "warning" | "danger";
  power: number;
  windSpeed: number;
  rpm: number;
}

const turbines: Turbine[] = [
  { id: "WT-01", name: "风机-01", x: -8, z: -8, status: "normal", power: 1450, windSpeed: 12.3, rpm: 14 },
  { id: "WT-02", name: "风机-02", x: -3, z: -10, status: "danger", power: 0, windSpeed: 11.8, rpm: 0 },
  { id: "WT-03", name: "风机-03", x: 4, z: -12, status: "normal", power: 1520, windSpeed: 13.1, rpm: 15 },
  { id: "WT-04", name: "风机-04", x: -10, z: -2, status: "warning", power: 1200, windSpeed: 12.0, rpm: 12 },
  { id: "WT-05", name: "风机-05", x: -2, z: -4, status: "normal", power: 1480, windSpeed: 12.7, rpm: 14.5 },
  { id: "WT-06", name: "风机-06", x: 6, z: -5, status: "normal", power: 1390, windSpeed: 11.9, rpm: 13.8 },
  { id: "WT-07", name: "风机-07", x: -12, z: 4, status: "normal", power: 1510, windSpeed: 13.4, rpm: 15.2 },
  { id: "WT-08", name: "风机-08", x: -4, z: 5, status: "warning", power: 1100, windSpeed: 10.8, rpm: 11.5 },
  { id: "WT-09", name: "风机-09", x: 3, z: 3, status: "normal", power: 1460, windSpeed: 12.5, rpm: 14.2 },
  { id: "WT-10", name: "风机-10", x: 10, z: 6, status: "normal", power: 1530, windSpeed: 13.2, rpm: 15.5 },
];

const powerData = Array.from({ length: 24 }, (_, i) => ({
  time: `${i}:00`,
  power: 10 + Math.random() * 5 + Math.sin(i / 3) * 3,
}));

export function MapView() {
  const [selectedId, setSelectedId] = useState<string>("WT-07");

  const selectedTurbine = turbines.find((t) => t.id === selectedId);

  const getStatusColor = (status: string) => {
    switch (status) {
      case "danger": return "#ef4444";
      case "warning": return "#f59e0b";
      default: return "#06b6d4";
    }
  };

  return (
    <div className="relative h-[800px] w-full rounded-xl overflow-hidden bg-[#030614] border border-cyan-500/20 shadow-[0_0_40px_rgba(6,182,212,0.1)]">
      
      {/* 3D Scene Background */}
      <div className="absolute inset-0">
        <Canvas camera={{ position: [0, 8, 15], fov: 45 }}>
          <ambientLight intensity={0.4} />
          <pointLight position={[10, 10, 10]} intensity={0.8} color="#06b6d4" />
          <pointLight position={[-10, 5, -10]} intensity={0.5} color="#3b82f6" />
          
          {/* Ground Grid */}
          <gridHelper args={[40, 40, "#06b6d4", "#06b6d4"]} position={[0, -2, 0]} material-opacity={0.1} material-transparent />
          
          {/* Wind Turbines */}
          {turbines.map((t) => (
            <group key={t.id} position={[t.x, 0, t.z]}>
              <TurbineModel status={t.status} scale={selectedId === t.id ? 0.35 : 0.25} />
              
              {/* Ground Ping / Selection indicator */}
              <mesh position={[0, -1.9, 0]} rotation={[-Math.PI / 2, 0, 0]}>
                <ringGeometry args={[1, 1.1, 32]} />
                <meshBasicMaterial color={getStatusColor(t.status)} transparent opacity={selectedId === t.id ? 0.8 : 0.3} />
              </mesh>

              {/* HTML Label */}
              <Html position={[0, 1.5, 0]} center zIndexRange={[100, 0]}>
                <div 
                  onClick={() => setSelectedId(t.id)}
                  className={`px-2 py-0.5 rounded cursor-pointer text-[10px] font-mono backdrop-blur-md border transition-all ${
                    selectedId === t.id 
                      ? "bg-[#0a0e27]/90 text-white border-cyan-400 scale-110 shadow-[0_0_10px_rgba(6,182,212,0.5)]" 
                      : "bg-[#0a0e27]/50 text-cyan-400/70 border-cyan-500/30 hover:border-cyan-400/60"
                  }`}
                  style={{ borderColor: selectedId === t.id ? getStatusColor(t.status) : undefined }}
                >
                  {t.id}
                </div>
              </Html>
            </group>
          ))}
          
          <OrbitControls 
            enablePan={true}
            enableZoom={true}
            minDistance={5}
            maxDistance={30}
            maxPolarAngle={Math.PI / 2 - 0.05} // Prevent going below ground
          />
        </Canvas>
      </div>

      {/* Left Panels */}
      <div className="absolute left-4 top-4 bottom-4 w-72 flex flex-col gap-4 pointer-events-none z-10">
        
        {/* Wind Park Performance */}
        <div className="pointer-events-auto rounded-lg border border-cyan-500/30 bg-[#0a0e27]/70 backdrop-blur-md p-4 shadow-lg">
          <h2 className="mb-4 text-sm font-semibold text-cyan-400 flex items-center gap-2">
            <Activity className="h-4 w-4" /> 风电场整体运行效能
          </h2>
          <div className="space-y-4 text-xs">
            <div className="flex justify-between items-center border-b border-cyan-500/10 pb-2">
              <span className="text-cyan-500/70">总发电功率</span>
              <span className="text-lg font-bold text-cyan-300">14.2 MW</span>
            </div>
            <div className="flex justify-between items-center border-b border-cyan-500/10 pb-2">
              <span className="text-cyan-500/70">平均风速</span>
              <span className="text-cyan-300">8.5 m/s</span>
            </div>
            <div className="flex justify-between items-center border-b border-cyan-500/10 pb-2">
              <span className="text-cyan-500/70">在线风机数</span>
              <span className="text-cyan-300">
                <span className="text-green-400 font-bold">8</span> / 10
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-cyan-500/70">综合运行效率</span>
              <span className="text-cyan-300">94.5%</span>
            </div>
          </div>
        </div>

        {/* Alerts & Notifications */}
        <div className="pointer-events-auto rounded-lg border border-cyan-500/30 bg-[#0a0e27]/70 backdrop-blur-md p-4 shadow-lg flex-1">
          <h2 className="mb-4 text-sm font-semibold text-cyan-400 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" /> 预警与通知中心
          </h2>
          <div className="space-y-3 overflow-y-auto max-h-[400px] pr-1">
            <div className="rounded border border-red-500/30 bg-red-500/10 p-3 text-xs">
              <div className="flex items-center gap-2 mb-1 text-red-400 font-semibold">
                <AlertTriangle className="h-3 w-3" /> [故障] WT-02 主轴承温度过高
              </div>
              <div className="text-red-400/70 pl-5">已自动停机，等待人工检修介入。</div>
              <div className="text-red-400/40 pl-5 mt-1 text-[10px]">10分钟前</div>
            </div>

            <div className="rounded border border-yellow-500/30 bg-yellow-500/10 p-3 text-xs">
              <div className="flex items-center gap-2 mb-1 text-yellow-400 font-semibold">
                <Info className="h-3 w-3" /> [预警] WT-04 偏航系统油压偏低
              </div>
              <div className="text-yellow-400/70 pl-5">压力值低于阈值 5%，建议排查泄漏。</div>
              <div className="text-yellow-400/40 pl-5 mt-1 text-[10px]">35分钟前</div>
            </div>
            
            <div className="rounded border border-cyan-500/30 bg-cyan-500/10 p-3 text-xs">
              <div className="flex items-center gap-2 mb-1 text-cyan-400 font-semibold">
                <Activity className="h-3 w-3" /> [系统] 全场自动巡检完成
              </div>
              <div className="text-cyan-400/70 pl-5">未发现其他异常，网络通信延迟正常。</div>
              <div className="text-cyan-400/40 pl-5 mt-1 text-[10px]">2小时前</div>
            </div>
          </div>
        </div>
      </div>

      {/* Right Panels */}
      <div className="absolute right-4 top-4 w-80 flex flex-col gap-4 pointer-events-none z-10">
        
        {/* Turbine Details */}
        {selectedTurbine && (
          <div className="pointer-events-auto rounded-lg border border-cyan-500/30 bg-[#0a0e27]/70 backdrop-blur-md p-4 shadow-lg transition-all">
            <h2 className="mb-4 text-sm font-semibold text-cyan-400 flex items-center gap-2 border-b border-cyan-500/20 pb-2">
              <Wind className="h-4 w-4" /> 单机实时详情
            </h2>
            <div className="space-y-3 text-xs">
              <div className="flex justify-between items-center">
                <span className="text-cyan-500/70">设备编号</span>
                <span className="text-cyan-300 font-mono">{selectedTurbine.id}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-cyan-500/70">运行状态</span>
                <span className="px-2 py-0.5 rounded font-bold" style={{ backgroundColor: `${getStatusColor(selectedTurbine.status)}20`, color: getStatusColor(selectedTurbine.status) }}>
                  {selectedTurbine.status === "normal" ? "ONLINE" : selectedTurbine.status === "warning" ? "WARNING" : "ERROR"}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-cyan-500/70 flex items-center gap-1"><Zap className="h-3 w-3"/> 实时功率</span>
                <span className="text-cyan-300">{selectedTurbine.power} kW</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-cyan-500/70 flex items-center gap-1"><Wind className="h-3 w-3"/> 当前风速</span>
                <span className="text-cyan-300">{selectedTurbine.windSpeed} m/s</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-cyan-500/70 flex items-center gap-1"><Gauge className="h-3 w-3"/> 转子转速</span>
                <span className="text-cyan-300">{selectedTurbine.rpm} RPM</span>
              </div>
            </div>
            
            <button className="mt-4 w-full py-2 bg-cyan-900/40 hover:bg-cyan-800/60 border border-cyan-500/40 rounded text-xs text-cyan-300 transition-colors">
              进入单机透视模式
            </button>
          </div>
        )}

        {/* Power Generation Chart */}
        <div className="pointer-events-auto rounded-lg border border-cyan-500/30 bg-[#0a0e27]/70 backdrop-blur-md p-4 shadow-lg">
          <h3 className="mb-4 text-xs font-semibold text-cyan-400 flex items-center gap-2">
            <Zap className="h-4 w-4" /> 场站发电功率曲线 (近24小时)
          </h3>
          <ResponsiveContainer width="100%" height={160}>
            <LineChart data={powerData} margin={{ left: -20, right: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(6, 182, 212, 0.1)" />
              <XAxis dataKey="time" stroke="#06b6d4" style={{ fontSize: 9 }} tickMargin={5} />
              <YAxis stroke="#06b6d4" style={{ fontSize: 9 }} />
              <RechartsTooltip
                contentStyle={{ backgroundColor: "rgba(10, 14, 39, 0.9)", border: "1px solid rgba(6, 182, 212, 0.4)", borderRadius: 4, backdropFilter: "blur(4px)" }}
                labelStyle={{ color: "#06b6d4" }}
                itemStyle={{ color: "#38bdf8" }}
              />
              <Line type="monotone" dataKey="power" name="功率(MW)" stroke="#0ea5e9" strokeWidth={2} dot={false} activeDot={{ r: 4, fill: '#38bdf8' }} />
            </LineChart>
          </ResponsiveContainer>
        </div>

      </div>
    </div>
  );
}