import { Outlet, NavLink } from "react-router";
import { Wind, LineChart, Activity, Brain } from "lucide-react";
import { useEffect, useState } from "react";
import { DiagnosisProvider } from "../context/DiagnosisContext";
import { WindV2Provider } from "../context/WindV2Context";

export function Layout() {
  const navItems = [
    { path: "/", label: "主监测", icon: Wind },
    { path: "/simulation", label: "仿真分析", icon: LineChart },
    { path: "/data", label: "实时数据", icon: Activity },
    { path: "/ai", label: "智能诊断", icon: Brain },
  ];

  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const fmt = (n: number) => n.toString().padStart(2, "0");
  const timeStr = `${now.getFullYear()}-${fmt(now.getMonth() + 1)}-${fmt(now.getDate())} ${fmt(now.getHours())}:${fmt(now.getMinutes())}:${fmt(now.getSeconds())} (CST)`;

  return (
    <div className="min-h-screen bg-[#132e25] text-[#d6e8d8]">
      {/* 顶部标题栏 */}
      <header className="border-b border-[#27684f]/20 bg-[#1a3c31]/80 backdrop-blur-sm">
        <div className="container mx-auto flex items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-[#27684f] to-[#173c35]">
              <Wind className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-[#47a87a]">风机数字孪生监测系统</h1>
              <p className="text-xs text-[#6d8f80]">Wind Turbine Digital Twin Platform</p>
            </div>
          </div>

          <div className="flex items-center gap-2 text-sm text-[#47a87a]">
            <div className="h-2 w-2 animate-pulse rounded-full bg-green-500"></div>
            <span>系统运行正常</span>
            <span className="ml-4 text-[#6d8f80]">{timeStr}</span>
          </div>
        </div>
      </header>

      {/* 导航标签栏 */}
      <nav className="border-b border-[#27684f]/10 bg-[#1a3c31]/50">
        <div className="container mx-auto flex gap-1 px-6">
          {navItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.path === "/"}
              className={({ isActive }) =>
                `flex items-center gap-2 border-b-2 px-6 py-3 transition-all ${
                  isActive
                    ? "border-[#47a87a] bg-[#27684f]/10 text-[#47a87a]"
                    : "border-transparent text-[#6d8f80] hover:border-[#27684f]/30 hover:bg-[#27684f]/5 hover:text-[#47a87a]"
                }`
              }
            >
              <item.icon className="h-4 w-4" />
              <span>{item.label}</span>
            </NavLink>
          ))}
        </div>
      </nav>

      {/* 主内容区 */}
      <main className="container mx-auto p-6">
        <DiagnosisProvider>
          <WindV2Provider>
            <Outlet />
          </WindV2Provider>
        </DiagnosisProvider>
      </main>
    </div>
  );
}