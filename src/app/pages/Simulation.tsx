// ============================================================
// Simulation.tsx — 风机叶片应力分布仿真分析页面
// ============================================================
// 功能：提供风机叶片 3D 应力分布的可视化仿真，用户可调节参数
//       实时观察叶片不同部位的受力颜色变化
// 核心技术：React Three Fiber（3D渲染）、Three.js（几何体/材质）、
//           useFrame（每帧动画）、useState（状态管理）
// ============================================================

// --- 第1组：React 核心 Hooks ---
import { useState, useRef } from "react";
// useState  = 创建"会触发界面刷新"的变量（如 isRunning、loadFactor）
// useRef    = 创建"不触发刷新"的引用，这里用来拿到 3D 旋转组的指针

// --- 第2组：图标 ---
import { Play, Settings, Download } from "lucide-react";
// lucide-react 是图标库：Play=播放/开始, Settings=设置, Download=下载

// --- 第3组：3D 渲染核心 ---
import { Canvas, useFrame } from "@react-three/fiber";
// Canvas    = Three.js 的 React 包装，在页面上画 3D 场景的画布
// useFrame  = 每帧（60次/秒）自动执行的函数，用于驱动动画

import { OrbitControls, Edges } from "@react-three/drei";
// OrbitControls = 鼠标拖拽旋转/缩放 3D 场景的控制器
// Edges         = 给 3D 物体描边（显示线框边缘）

import * as THREE from "three";
// THREE = 整个 Three.js 库，这里用于定义 3D 物体的"组"（Group）

// ============================================================
// StressBladeModel — 风机叶片 3D 应力可视化模型（子组件）
// ============================================================
// 接收两个参数（props）：
//   isRunning  — 仿真是否在运行中（控制叶片是否旋转）
//   loadFactor — 动态载荷系数（0.5~1.5，影响颜色和转速）
// ============================================================
function StressBladeModel({ isRunning, loadFactor }: { isRunning: boolean, loadFactor: number }) {
  // useRef 创建一个对 Three.js Group 对象的引用
  // 有了这个引用，后面 useFrame 就能每帧修改它的旋转角度
  const rotorRef = useRef<THREE.Group>(null);
  
  // ============================================================
  // useFrame — 每帧自动执行（60fps 即每秒60次）
  // ============================================================
  // (state, delta) 是 useFrame 自动传入的参数：
  //   state — 当前帧的整体状态（相机、时钟等）
  //   delta — 上一帧到现在经过的时间（秒），用来让动画帧率无关
  // ============================================================
  useFrame((state, delta) => {
    // 只有仿真运行时才旋转，转子不转
    if (isRunning && rotorRef.current) {
      // 绕 Z 轴旋转：基础速度 2 * 载荷系数
      // loadFactor 越大 → 转得越快 → 模拟大风时的转速
      rotorRef.current.rotation.z -= delta * 2 * loadFactor;
    }
  });

  // ============================================================
  // getStressColor — 根据应力值计算颜色
  // ============================================================
  // baseStress：基础应力值（0~1），不同部位有不同的基础应力
  // 返回颜色字符串：红=高应力危险，橙=中等，青=低应力安全
  // ============================================================
  const getStressColor = (baseStress: number) => {
    const stress = baseStress * loadFactor;  // 实际应力 = 基础应力 × 载荷系数
    if (stress > 0.8) return "#ef4444";      // 红色 — 高应力危险区
    if (stress > 0.5) return "#f59e0b";      // 橙色 — 中等应力警告区
    return "#06b6d4";                         // 青色 — 低应力安全区
  };

  // ============================================================
  // return — 返回 3D 场景中的 JSX（由 Canvas 渲染成 WebGL 图形）
  // ============================================================
  return (
    // group = Three.js 中的"空组"，像一个文件夹，统一管理位置/缩放/旋转
    // position={[x, y, z]} — 在 3D 空间中的位置
    // scale={1.5}           — 整体放大1.5倍
    <group position={[0, -0.5, 0]} scale={1.5}>
      
      {/* ========== 机舱（Nacelle）— 风机头部那个长方形盒子 ========== */}
      <mesh position={[0, 0, -0.4]}>
        {/* boxGeometry — 长方体几何形状：[宽, 高, 长] */}
        <boxGeometry args={[0.5, 0.6, 1.6]} />
        {/* meshStandardMaterial — 材质：颜色+透明度+粗糙度+金属感 */}
        <meshStandardMaterial color="#0891b2" transparent opacity={0.15} roughness={0.1} metalness={0.9} />
        {/* Edges — 在物体边缘画白线，使其在暗色背景下也能看清轮廓 */}
        <Edges scale={1} threshold={15} color="#06b6d4" />
      </mesh>

      {/* ========== 轮毂（Hub）+ 3片叶片 ========== */}
      {/* ref={rotorRef} — 把这个组的引用存到 rotorRef，后续 useFrame 用它来控制旋转 */}
      <group ref={rotorRef} position={[0, 0, 0.5]}>
        
        {/* 轮毂 — 中心的球体 */}
        <mesh>
          <sphereGeometry args={[0.25, 16, 16]} />
          <meshStandardMaterial color={getStressColor(0.7)} transparent opacity={0.8} />
          <Edges scale={1} threshold={15} color="#fff" opacity={0.2} />
        </mesh>

        {/* 3片叶片 — 用数组 [0, 120°, 240°] 循环生成，每片间隔 120 度 */}
        {[0, (Math.PI * 2) / 3, (Math.PI * 4) / 3].map((angle, i) => (
          // 每片叶片绕 Z 轴旋转不同的角度
          <group key={i} rotation={[0, 0, angle]}>
            
            {/* 叶根（Blade Root）— 最靠近轮毂，应力最大 */}
            <mesh position={[0, 0.6, 0]}>
              <boxGeometry args={[0.2, 0.8, 0.08]} />
              {/* baseStress=0.9 代表基础应力很高 → 通常显示红色 */}
              <meshStandardMaterial 
                color={getStressColor(0.9)} 
                emissive={getStressColor(0.9)}  // emissive = 自发光颜色（黑暗中也会亮）
                emissiveIntensity={0.5}           // 自发光亮度
                transparent opacity={0.9} 
              />
              <Edges scale={1} threshold={15} color="#fff" opacity={0.3} />
            </mesh>
            
            {/* 叶中（Blade Mid）— 中等应力 */}
            <mesh position={[0, 1.6, 0]}>
              <boxGeometry args={[0.15, 1.2, 0.05]} />
              <meshStandardMaterial color={getStressColor(0.6)} emissive={getStressColor(0.6)} emissiveIntensity={0.4} transparent opacity={0.8} />
              <Edges scale={1} threshold={15} color="#fff" opacity={0.3} />
            </mesh>

            {/* 叶尖（Blade Tip）— 离轮毂最远，应力最小 */}
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

// ============================================================
// Simulation — 仿真页面的主组件（export 导出，让路由能引用它）
// ============================================================
export function Simulation() {
  // useState(true) — 创建 isRunning 状态，初始值 true（默认开始仿真）
  // setIsRunning    — 用于修改 isRunning 的函数（调用它界面会自动刷新）
  const [isRunning, setIsRunning] = useState(true);
  
  // loadFactor — 动态载荷系数，初始值 1.0
  // 用户拖动滑块 → onChange → setLoadFactor(新值) → 叶片颜色和转速实时变化
  const [loadFactor, setLoadFactor] = useState(1.0);

  // ============================================================
  // return — 返回页面的 JSX 布局
  // ============================================================
  // 整体是 CSS Grid 12列布局：
  //   左侧 col-span-3（占3/12=25%宽度）= 控制面板
  //   右侧 col-span-9（占9/12=75%宽度）= 3D可视化区域
  // ============================================================
  return (
    <div className="grid grid-cols-12 gap-6">
      
      {/* ==================== 左侧：控制面板 ==================== */}
      <div className="col-span-3 space-y-4">
        
        {/* --- 仿真参数配置卡片 --- */}
        <div className="rounded-lg border border-cyan-500/20 bg-[#0d1229]/50 p-4">
          <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold text-cyan-400">
            <Settings className="h-4 w-4" />
            仿真参数配置
          </h2>

          <div className="space-y-4">
            {/* 仿真类型选择 — 目前固定为"应力分布分析" */}
            <div>
              <label className="mb-2 block text-xs text-cyan-500/70">仿真类型</label>
              <div className="space-y-2">
                <button className="w-full rounded px-3 py-2 text-left text-xs transition-all border border-cyan-500 bg-cyan-500/20 text-cyan-300">
                  应力分布分析
                </button>
              </div>
            </div>

            {/* 风速调节滑块 — 范围 5~25 m/s */}
            {/* 注意：这个滑块目前只做展示，未绑定到实际状态变量（可后续扩展） */}
            <div>
              <label className="mb-2 block text-xs text-cyan-500/70">风速 (m/s)</label>
              <input type="range" min="5" max="25" defaultValue="12" className="w-full accent-cyan-500" />
              <div className="mt-1 flex justify-between text-xs text-cyan-500/50">
                <span>5</span>
                <span>12</span>
                <span>25</span>
              </div>
            </div>

            {/* 转速调节滑块 — 范围 8~18 RPM */}
            {/* 同样暂未绑定状态变量，仅展示 UI */}
            <div>
              <label className="mb-2 block text-xs text-cyan-500/70">转速 (RPM)</label>
              <input type="range" min="8" max="18" defaultValue="12" className="w-full accent-cyan-500" />
              <div className="mt-1 flex justify-between text-xs text-cyan-500/50">
                <span>8</span>
                <span>12</span>
                <span>18</span>
              </div>
            </div>

            {/* ★★★ 动态载荷系数 — 唯一绑定到状态变量的滑块 ★★★ */}
            {/* value={loadFactor} — 当前值来自 state */}
            {/* onChange={...setLoadFactor} — 拖动时立即更新 state → 叶片颜色实时变化 */}
            <div>
              <label className="mb-2 block text-xs text-cyan-500/70">动态载荷系数 (实时影响应力)</label>
              <input 
                type="range" 
                min="0.5" 
                max="1.5" 
                step="0.1"                     // 每次拖动步进0.1
                value={loadFactor}             // 绑定到 state
                onChange={(e) => setLoadFactor(parseFloat(e.target.value))}  // parseFloat 把字符串"1.2"转为数字1.2
                className="w-full accent-cyan-500" 
              />
              <div className="mt-1 flex justify-between text-xs text-cyan-500/50">
                <span>0.5</span>
                <span>1.0</span>
                <span>1.5</span>
              </div>
            </div>

            {/* 开始/停止仿真按钮 */}
            {/* onClick → 取反 isRunning：true变false，false变true */}
            {/* 按钮颜色根据 isRunning 动态变化：运行中=红色停止按钮，暂停中=青色开始按钮 */}
            <button
              onClick={() => setIsRunning(!isRunning)}
              className={`mt-4 flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm transition-all ${
                isRunning 
                  ? "border border-red-500 bg-red-500/20 text-red-400 hover:bg-red-500/30"   // 运行中→红色
                  : "border border-cyan-500 bg-cyan-500/20 text-cyan-400 hover:bg-cyan-500/30" // 暂停中→青色
              }`}
            >
              <Play className="h-4 w-4" />
              {isRunning ? "停止计算" : "开始仿真"}
            </button>
          </div>
        </div>

        {/* --- 计算状态卡片 --- */}
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
              {/* isRunning 为 true 显示"实时计算中"，为 false 显示"已暂停" */}
              <span className="text-cyan-300">{isRunning ? "实时计算中" : "已暂停"}</span>
            </div>
            {/* 进度条 — 运行中整个条亮青色并闪烁，暂停中半透明 */}
            <div className="h-1 rounded bg-cyan-500/10">
              <div className={`h-full w-full rounded transition-all ${isRunning ? 'bg-cyan-500 animate-pulse' : 'bg-cyan-500/50'}`}></div>
            </div>
          </div>
        </div>
      </div>

      {/* ==================== 右侧：3D 可视化区域 ==================== */}
      <div className="col-span-9 space-y-4">
        <div className="rounded-lg border border-cyan-500/20 bg-[#0d1229]/50 p-4 h-[700px] flex flex-col">
          
          {/* 标题栏 + 导出按钮 */}
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-cyan-400">
              风机叶片 3D 应力分布分析
            </h2>
            <button className="flex items-center gap-2 rounded bg-cyan-500/10 px-3 py-1 text-xs text-cyan-400 hover:bg-cyan-500/20">
              <Download className="h-3 w-3" />
              导出结果
            </button>
          </div>

          {/* ========== 3D Canvas — 核心渲染区域 ========== */}
          {/* Canvas 是 @react-three/fiber 提供的 WebGL 画布 */}
          {/* camera={{ position: [0, 0, 8], fov: 50 }} — 相机位置在Z轴8单位处，视场角50度 */}
          {/* relative — 为上面浮动的图例提供定位参考 */}
          <div className="flex-1 overflow-hidden rounded-lg border border-cyan-500/10 bg-gradient-to-b from-[#0a0e27] to-[#0d1229] relative">
            <Canvas camera={{ position: [0, 0, 8], fov: 50 }}>
              {/* 环境光 — 均匀照亮所有物体，intensity=0.5 为亮度 */}
              <ambientLight intensity={0.5} />
              {/* 点光源 — 从右上角打光，模拟光源 */}
              <pointLight position={[10, 10, 10]} intensity={1} />
              {/* 第二个点光源 — 从左下打青色补光，增加立体感 */}
              <pointLight position={[-10, -10, -10]} intensity={0.5} color="#06b6d4" />
              
              {/* ★★★ 叶片应力模型 ★★★ */}
              {/* 传入 isRunning 和 loadFactor，两者变化时模型自动更新 */}
              <StressBladeModel isRunning={isRunning} loadFactor={loadFactor} />
              
              {/* OrbitControls — 鼠标交互控制器 */}
              {/* enablePan={false}      — 禁止平移（只能旋转+缩放） */}
              {/* minDistance / maxDistance — 限制缩放范围 */}
              {/* autoRotate={!isRunning} — 停止时自动旋转展示，运行时由 useFrame 驱动旋转 */}
              <OrbitControls 
                enablePan={false}
                enableZoom={true}
                minDistance={3}
                maxDistance={12}
                autoRotate={!isRunning}
                autoRotateSpeed={0.5}
              />
            </Canvas>

            {/* ========== 应力颜色图例（浮在 Canvas 上方） ========== */}
            {/* absolute — 绝对定位相对于父容器 */}
            {/* -translate-x-1/2 — CSS 水平居中技巧 */}
            {/* backdrop-blur — 毛玻璃模糊效果 */}
            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-[#0a0e27]/80 backdrop-blur border border-cyan-500/30 px-6 py-3 rounded-full flex flex-col items-center gap-2 text-xs">
              <div className="flex items-center justify-center gap-4">
                <span className="text-cyan-400 font-semibold">低应力 (安全)</span>
                {/* 渐变色条：青→橙→红，对应 低→中→高 应力 */}
                <div className="flex h-3 w-48 overflow-hidden rounded-full border border-white/10">
                  <div className="flex-1 bg-[#06b6d4]"></div>   {/* 青色 = 低应力 */}
                  <div className="flex-1 bg-[#f59e0b]"></div>   {/* 橙色 = 中应力 */}
                  <div className="flex-1 bg-[#ef4444]"></div>   {/* 红色 = 高应力 */}
                </div>
                <span className="text-red-400 font-semibold">高应力 (疲劳区)</span>
              </div>
              <div className="text-cyan-500/50">支持鼠标拖动旋转与滚轮缩放，调节左侧"载荷系数"可实时观察应力变化</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}