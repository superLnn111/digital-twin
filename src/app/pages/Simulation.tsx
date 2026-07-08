import { useState, useRef } from "react";
import { Play, Settings, Download } from "lucide-react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, Edges } from "@react-three/drei";
import * as THREE from "three";

function StressBladeModel({ isRunning, loadFactor }: { isRunning: boolean, loadFactor: number }) {
  const rotorRef = useRef<THREE.Group>(null);
  
  // Base rotation speed adjusted by load factor and whether it's running
  useFrame((state, delta) => {
    if (isRunning && rotorRef.current) {
      rotorRef.current.rotation.z -= delta * 2 * loadFactor;
    }
  });

  // Calculate colors based on load factor
  // High load = more red at the root and mid, Low load = mostly blue/cyan
  const getStressColor = (baseStress: number) => {
    const stress = baseStress * loadFactor;
    if (stress > 0.8) return "#ef4444"; // Red (High Stress)
    if (stress > 0.5) return "#f59e0b"; // Yellow/Orange (Medium Stress)
    return "#06b6d4"; // Cyan (Low Stress)
  };

  return (
    <group position={[0, -0.5, 0]} scale={1.5}>
      {/* Nacelle representation */}
      <mesh position={[0, 0, -0.4]}>
        <boxGeometry args={[0.5, 0.6, 1.6]} />
        <meshStandardMaterial color="#0891b2" transparent opacity={0.15} roughness={0.1} metalness={0.9} />
        <Edges scale={1} threshold={15} color="#06b6d4" />
      </mesh>

      {/* Hub & Blades */}
      <group ref={rotorRef} position={[0, 0, 0.5]}>
        {/* Hub */}
        <mesh>
          <sphereGeometry args={[0.25, 16, 16]} />
          <meshStandardMaterial color={getStressColor(0.7)} transparent opacity={0.8} />
          <Edges scale={1} threshold={15} color="#fff" opacity={0.2} />
        </mesh>

        {/* 3 Blades composed of segments to show stress distribution */}
        {[0, (Math.PI * 2) / 3, (Math.PI * 4) / 3].map((angle, i) => (
          <group key={i} rotation={[0, 0, angle]}>
            {/* Blade Root (Highest Stress) */}
            <mesh position={[0, 0.6, 0]}>
              <boxGeometry args={[0.2, 0.8, 0.08]} />
              <meshStandardMaterial color={getStressColor(0.9)} emissive={getStressColor(0.9)} emissiveIntensity={0.5} transparent opacity={0.9} />
              <Edges scale={1} threshold={15} color="#fff" opacity={0.3} />
            </mesh>
            
            {/* Blade Mid (Medium Stress) */}
            <mesh position={[0, 1.6, 0]}>
              <boxGeometry args={[0.15, 1.2, 0.05]} />
              <meshStandardMaterial color={getStressColor(0.6)} emissive={getStressColor(0.6)} emissiveIntensity={0.4} transparent opacity={0.8} />
              <Edges scale={1} threshold={15} color="#fff" opacity={0.3} />
            </mesh>

            {/* Blade Tip (Lowest Stress) */}
            <mesh position={[0, 2.6, 0]}>
              <boxGeometry args={[0.1, 0.8, 0.02]} />
              <meshStandardMaterial color={getStressColor(0.3)} emissive={getStressColor(0.3)} emissiveIntensity={0.2} transparent opacity={0.7} />
              <Edges scale={1} threshold={15} color="#fff" opacity={0.3} />
            </mesh>
          </group>
        ))}
      </group>
    </group>
  );
}

export function Simulation() {
  const [isRunning, setIsRunning] = useState(true);
  const [loadFactor, setLoadFactor] = useState(1.0);

  return (
    <div className="grid grid-cols-12 gap-6">
      {/* Control Panel */}
      <div className="col-span-3 space-y-4">
        <div className="rounded-lg border border-cyan-500/20 bg-[#0d1229]/50 p-4">
          <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold text-cyan-400">
            <Settings className="h-4 w-4" />
            仿真参数配置
          </h2>

          <div className="space-y-4">
            <div>
              <label className="mb-2 block text-xs text-cyan-500/70">仿真类型</label>
              <div className="space-y-2">
                <button className="w-full rounded px-3 py-2 text-left text-xs transition-all border border-cyan-500 bg-cyan-500/20 text-cyan-300">
                  应力分布分析
                </button>
              </div>
            </div>

            <div>
              <label className="mb-2 block text-xs text-cyan-500/70">风速 (m/s)</label>
              <input type="range" min="5" max="25" defaultValue="12" className="w-full accent-cyan-500" />
              <div className="mt-1 flex justify-between text-xs text-cyan-500/50">
                <span>5</span>
                <span>12</span>
                <span>25</span>
              </div>
            </div>

            <div>
              <label className="mb-2 block text-xs text-cyan-500/70">转速 (RPM)</label>
              <input type="range" min="8" max="18" defaultValue="12" className="w-full accent-cyan-500" />
              <div className="mt-1 flex justify-between text-xs text-cyan-500/50">
                <span>8</span>
                <span>12</span>
                <span>18</span>
              </div>
            </div>

            <div>
              <label className="mb-2 block text-xs text-cyan-500/70">动态载荷系数 (实时影响应力)</label>
              <input 
                type="range" 
                min="0.5" 
                max="1.5" 
                step="0.1" 
                value={loadFactor}
                onChange={(e) => setLoadFactor(parseFloat(e.target.value))}
                className="w-full accent-cyan-500" 
              />
              <div className="mt-1 flex justify-between text-xs text-cyan-500/50">
                <span>0.5</span>
                <span>1.0</span>
                <span>1.5</span>
              </div>
            </div>

            <button
              onClick={() => setIsRunning(!isRunning)}
              className={`mt-4 flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm transition-all ${
                isRunning ? "border border-red-500 bg-red-500/20 text-red-400 hover:bg-red-500/30" : "border border-cyan-500 bg-cyan-500/20 text-cyan-400 hover:bg-cyan-500/30"
              }`}
            >
              <Play className="h-4 w-4" />
              {isRunning ? "停止计算" : "开始仿真"}
            </button>
          </div>
        </div>

        <div className="rounded-lg border border-cyan-500/20 bg-[#0d1229]/50 p-4">
          <h3 className="mb-3 text-xs font-semibold text-cyan-400">计算状态</h3>
          <div className="space-y-2 text-xs">
            <div className="flex justify-between">
              <span className="text-cyan-500/70">网格单元</span>
              <span className="text-cyan-300">1,245,678</span>
            </div>
            <div className="flex justify-between">
              <span className="text-cyan-500/70">时间步长</span>
              <span className="text-cyan-300">0.001s</span>
            </div>
            <div className="flex justify-between">
              <span className="text-cyan-500/70">收敛精度</span>
              <span className="text-green-400">1e-6</span>
            </div>
            <div className="flex justify-between">
              <span className="text-cyan-500/70">计算进度</span>
              <span className="text-cyan-300">{isRunning ? "实时计算中" : "已暂停"}</span>
            </div>
            <div className="h-1 rounded bg-cyan-500/10">
              <div className={`h-full w-full rounded transition-all ${isRunning ? 'bg-cyan-500 animate-pulse' : 'bg-cyan-500/50'}`}></div>
            </div>
          </div>
        </div>
      </div>

      {/* Visualization Area */}
      <div className="col-span-9 space-y-4">
        <div className="rounded-lg border border-cyan-500/20 bg-[#0d1229]/50 p-4 h-[700px] flex flex-col">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-cyan-400">
              风机叶片 3D 应力分布分析
            </h2>
            <button className="flex items-center gap-2 rounded bg-cyan-500/10 px-3 py-1 text-xs text-cyan-400 hover:bg-cyan-500/20">
              <Download className="h-3 w-3" />
              导出结果
            </button>
          </div>

          {/* 3D Stress Distribution Render */}
          <div className="flex-1 overflow-hidden rounded-lg border border-cyan-500/10 bg-gradient-to-b from-[#0a0e27] to-[#0d1229] relative">
            <Canvas camera={{ position: [0, 0, 8], fov: 50 }}>
              <ambientLight intensity={0.5} />
              <pointLight position={[10, 10, 10]} intensity={1} />
              <pointLight position={[-10, -10, -10]} intensity={0.5} color="#06b6d4" />
              
              <StressBladeModel isRunning={isRunning} loadFactor={loadFactor} />
              
              <OrbitControls 
                enablePan={false}
                enableZoom={true}
                minDistance={3}
                maxDistance={12}
                autoRotate={!isRunning} // Auto rotate when not actively spinning the blades
                autoRotateSpeed={0.5}
              />
            </Canvas>

            {/* Color Scale Legend Floating Overlay */}
            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-[#0a0e27]/80 backdrop-blur border border-cyan-500/30 px-6 py-3 rounded-full flex flex-col items-center gap-2 text-xs">
              <div className="flex items-center justify-center gap-4">
                <span className="text-cyan-400 font-semibold">低应力 (安全)</span>
                <div className="flex h-3 w-48 overflow-hidden rounded-full border border-white/10">
                  <div className="flex-1 bg-[#06b6d4]"></div>
                  <div className="flex-1 bg-[#f59e0b]"></div>
                  <div className="flex-1 bg-[#ef4444]"></div>
                </div>
                <span className="text-red-400 font-semibold">高应力 (疲劳区)</span>
              </div>
              <div className="text-cyan-500/50">支持鼠标拖动旋转与滚轮缩放，调节左侧“载荷系数”可实时观察应力变化</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
