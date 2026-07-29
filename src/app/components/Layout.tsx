import { Outlet, NavLink } from "react-router";
import { Wind, LineChart, Activity } from "lucide-react";
import { useEffect, useState } from "react";

export function Layout() {
  const navItems = [
    { path: "/", label: "主监测", icon: Wind },
    { path: "/simulation", label: "仿真分析", icon: LineChart },
    { path: "/data", label: "实时数据", icon: Activity },
  ];

  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const fmt = (n: number) => n.toString().padStart(2, "0");
  const timeStr = `${now.getFullYear()}-${fmt(now.getMonth() + 1)}-${fmt(now.getDate())} ${fmt(now.getHours())}:${fmt(now.getMinutes())}:${fmt(now.getSeconds())} (CST)`;
  
  return (
    <div className="min-h-screen bg-[#0a0e27] text-white">
      {/* Header */}
      <header className="border-b border-cyan-500/20 bg-[#0d1229]/80 backdrop-blur-sm">
        <div className="container mx-auto flex items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-cyan-500 to-blue-600">
              <Wind className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-cyan-400">风机数字孪生监测系统</h1>
              <p className="text-xs text-cyan-500/70">Wind Turbine Digital Twin Platform</p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-sm text-cyan-400">
            <div className="h-2 w-2 animate-pulse rounded-full bg-green-500"></div>
            <span>系统运行正常</span>
            <span className="ml-4 text-cyan-500/70">{timeStr}</span>
          </div>
        </div>
      </header>

      {/* Navigation */}
      <nav className="border-b border-cyan-500/10 bg-[#0d1229]/50">
        <div className="container mx-auto flex gap-1 px-6">
          {navItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.path === "/"}
              className={({ isActive }) =>
                `flex items-center gap-2 border-b-2 px-6 py-3 transition-all ${
                  isActive
                    ? "border-cyan-400 bg-cyan-500/10 text-cyan-400"
                    : "border-transparent text-cyan-500/60 hover:border-cyan-500/30 hover:bg-cyan-500/5 hover:text-cyan-400"
                }`
              }
            >
              <item.icon className="h-4 w-4" />
              <span>{item.label}</span>
            </NavLink>
          ))}
        </div>
      </nav>

      {/* Main Content */}
      <main className="container mx-auto p-6">
        <Outlet />
      </main>
    </div>
  );
}
