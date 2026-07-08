import { ReactNode } from "react";

interface DataCardProps {
  label: string;
  value: string | number;
  unit?: string;
  icon?: ReactNode;
  trend?: "up" | "down" | "neutral";
  status?: "normal" | "warning" | "danger";
}

export function DataCard({ label, value, unit, icon, trend, status = "normal" }: DataCardProps) {
  const statusColors = {
    normal: "border-cyan-500/30 bg-cyan-500/5",
    warning: "border-yellow-500/50 bg-yellow-500/10",
    danger: "border-red-500/50 bg-red-500/10",
  };

  const valueColors = {
    normal: "text-cyan-300",
    warning: "text-yellow-400",
    danger: "text-red-400",
  };

  return (
    <div className={`rounded-lg border ${statusColors[status]} p-4 backdrop-blur-sm`}>
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="mb-1 text-xs text-cyan-500/70">{label}</div>
          <div className={`flex items-baseline gap-1 text-2xl font-bold ${valueColors[status]}`}>
            <span>{value}</span>
            {unit && <span className="text-sm font-normal opacity-70">{unit}</span>}
          </div>
        </div>
        {icon && <div className="text-cyan-400/50">{icon}</div>}
      </div>
      {trend && (
        <div className="mt-2 flex items-center gap-1 text-xs">
          <span className={trend === "up" ? "text-green-400" : trend === "down" ? "text-red-400" : "text-gray-400"}>
            {trend === "up" ? "↑" : trend === "down" ? "↓" : "→"} {trend === "up" ? "+5%" : trend === "down" ? "-3%" : "0%"}
          </span>
          <span className="text-cyan-500/50">vs 上一小时</span>
        </div>
      )}
    </div>
  );
}
