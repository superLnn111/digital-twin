// ========== 1. 导入依赖 ==========

// Outlet：react-router 的"子路由出口"，<Layout>内部哪个位置放子页面，Outlet就写在哪
// NavLink：react-router 的导航链接，自带"当前激活态"高亮功能（比 <a> 标签智能）
import { Outlet, NavLink } from "react-router";

// lucide-react：图标库。Wind=风机图标, LineChart=折线图图标, Activity=心电图图标, Brain=大脑/AI图标
import { Wind, LineChart, Activity, Brain } from "lucide-react";

// useEffect：启动/清理定时器
// useState：存当前时间（每秒更新一次）
import { useEffect, useState } from "react";

// DiagnosisProvider：AI诊断数据的全局提供者，包裹<Outlet />让所有子页面共享WebSocket数据
import { DiagnosisProvider } from "../context/DiagnosisContext";

// ========== 2. Layout 组件（全局布局壳） ==========
export function Layout() {
  // --- 导航栏配置 ---
  // 把4个Tab的路径、标签名、图标集中放在数组里，方便统一渲染和维护
  // 如果要加第5个Tab，只需在这个数组里加一条，不用改下面的JSX
  const navItems = [
    { path: "/", label: "主监测", icon: Wind },        // 首页
    { path: "/simulation", label: "仿真分析", icon: LineChart },  // 仿真页
    { path: "/data", label: "实时数据", icon: Activity },        // 数据页
    { path: "/ai", label: "智能诊断", icon: Brain },            // AI诊断页
  ];

  // --- 实时时钟 ---
  // useState(new Date())：初始化当前时间，React会追踪now的变化
  const [now, setNow] = useState(new Date());

  // 组件挂载后启动一个每秒更新时间的定时器
  useEffect(() => {
    // setInterval：每1000毫秒（1秒）执行一次回调，更新now为新时间
    const timer = setInterval(() => setNow(new Date()), 1000);
    // 清理函数：组件卸载时（离开页面）清除定时器，防止内存泄漏
    return () => clearInterval(timer);
  }, []); // [] 空依赖 = 只在首次渲染后执行一次，之后不会重复创建定时器

  // --- 时间格式化 ---
  // fmt：补零函数，1 → "01"，9 → "09"，保证个位数前面有0
  const fmt = (n: number) => n.toString().padStart(2, "0");
  // 拼出完整的日期时间字符串：2026-09-20 14:30:05 (CST)
  // getMonth() 返回值是 0~11，所以 +1 才是实际月份（1月=0，2月=1...）
  const timeStr = `${now.getFullYear()}-${fmt(now.getMonth() + 1)}-${fmt(now.getDate())} ${fmt(now.getHours())}:${fmt(now.getMinutes())}:${fmt(now.getSeconds())} (CST)`;

  // ========== 3. 渲染 ==========
  // 整体结构：外层大盒子 → Header → Nav → Main
  return (
    // min-h-screen：最小高度=一整屏（100vh），确保页面至少撑满屏幕
    // bg-[#0a0e27]：深海军蓝背景色（方括号是Tailwind的"任意值"语法）
    // text-white：全局默认白色文字
    <div className="min-h-screen bg-[#0a0e27] text-white">
      {/* ===== 顶部标题栏 ===== */}
      {/* border-b：底部边框 */}
      {/* border-cyan-500/20：青色边框，透明度20%（半透明发光效果） */}
      {/* bg-[#0d1229]/80：比背景稍亮的深蓝色，80%不透明度 */}
      {/* backdrop-blur-sm：背景模糊（毛玻璃效果，背后内容若隐若现） */}
      <header className="border-b border-cyan-500/20 bg-[#0d1229]/80 backdrop-blur-sm">
        {/* container：最大宽度容器（大屏居中、小屏撑满） */}
        {/* flex：弹性布局，内部元素横向排列 */}
        {/* justify-between：两端对齐（logo在左，状态和时间在右） */}
        <div className="container mx-auto flex items-center justify-between px-6 py-4">
          {/* ---- 左侧：Logo + 标题 ---- */}
          <div className="flex items-center gap-3">
            {/* 圆角方形图标容器，背景用青铜色渐变（左上青色→右下蓝色） */}
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-cyan-500 to-blue-600">
              <Wind className="h-6 w-6" /> {/* 白色风机图标 */}
            </div>
            <div>
              {/* 主标题：加粗、青蓝色、xl字号 */}
              <h1 className="text-xl font-bold text-cyan-400">风机数字孪生监测系统</h1>
              {/* 副标题：小字、半透明青色 */}
              <p className="text-xs text-cyan-500/70">Wind Turbine Digital Twin Platform</p>
            </div>
          </div>

          {/* ---- 右侧：系统状态 + 实时时钟 ---- */}
          <div className="flex items-center gap-2 text-sm text-cyan-400">
            {/* 绿色小圆点 + animate-pulse：持续闪烁的呼吸灯 → "系统在线"的视觉提示 */}
            <div className="h-2 w-2 animate-pulse rounded-full bg-green-500"></div>
            <span>系统运行正常</span>
            {/* ml-4：左边距4单位，把时间字串跟"运行正常"拉开距离 */}
            <span className="ml-4 text-cyan-500/70">{timeStr}</span>
          </div>
        </div>
      </header>

      {/* ===== 导航标签栏 ===== */}
      {/* 比 header 稍透明，形成两层层次感 */}
      <nav className="border-b border-cyan-500/10 bg-[#0d1229]/50">
        <div className="container mx-auto flex gap-1 px-6">
          {/* .map()：遍历 navItems 数组，为每个Tab生成一个NavLink */}
          {navItems.map((item) => (
            <NavLink
              key={item.path}        // React要求每个列表项有唯一key，用路径即可
              to={item.path}         // 点击跳转的目标路由
              end={item.path === "/"} // end=true：只有完全匹配"/"才算激活，避免"/simulation"也匹配"/"
              // className 可以接收一个函数，参数{ isActive }表示当前是否在该页面
              className={({ isActive }) =>
                `flex items-center gap-2 border-b-2 px-6 py-3 transition-all ${
                  isActive
                    // 激活态：底部青色边框 + 浅青背景 + 亮青文字
                    ? "border-cyan-400 bg-cyan-500/10 text-cyan-400"
                    // 未激活态：透明边框 + 暗青文字，hover时微微点亮
                    : "border-transparent text-cyan-500/60 hover:border-cyan-500/30 hover:bg-cyan-500/5 hover:text-cyan-400"
                }`
              }
            >
              {/* item.icon 是导入的图标组件，直接当JSX标签渲染 */}
              <item.icon className="h-4 w-4" />
              <span>{item.label}</span>
            </NavLink>
          ))}
        </div>
      </nav>

      {/* ===== 主内容区 ===== */}
      {/* container + p-6：左右留边 + 内部留白 */}
      <main className="container mx-auto p-6">
        {/* DiagnosisProvider 包裹 Outlet：
            所有子页面的AI诊断数据共享都是靠这个实现的。
            Layout → DiagnosisProvider → Outlet(子页面)
            子页面（MainMonitor/AIDiagnosis等）通过 useDiagnosis() 拿数据 */}
        <DiagnosisProvider>
          <Outlet />
        </DiagnosisProvider>
      </main>
    </div>
  );
}