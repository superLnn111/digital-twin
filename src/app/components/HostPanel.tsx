// ============================================================
// HostPanel.tsx — 树莓派 5 网关本体遥测面板（status.host）
// ============================================================
// 初版遗漏了 status.host，这里补齐：
//   5V 供电（ext5v_v）、CPU 温度、节流标志、磁盘占用、运行时长、开机时刻
// 契约红线：所有字段可空，缺失一律渲染「未知」，绝不猜测
// ============================================================

import { Cpu, HardDrive, PlugZap, Timer, AlertTriangle, Power } from "lucide-react";
import type { HostReading } from "@/lib/utils/host";
import { formatWallClockNs } from "@/lib/utils/ns";

const UNKNOWN = "未知";

function fmt(v: number | null | undefined, digits = 2, unit = ""): string {
  return v == null || !Number.isFinite(v) ? UNKNOWN : `${v.toFixed(digits)}${unit ? ` ${unit}` : ""}`;
}

function fmtUptime(sec: number | null | undefined): string {
  if (sec == null || !Number.isFinite(sec)) return UNKNOWN;
  const s = Math.floor(sec);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d} 天 ${h} 小时`;
  if (h > 0) return `${h} 小时 ${m} 分`;
  if (m > 0) return `${m} 分 ${s % 60} 秒`;
  return `${s} 秒`;
}

interface StatProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone?: "normal" | "warning" | "danger";
  hint?: string;
}

function Stat({ icon, label, value, tone = "normal", hint }: StatProps) {
  const valueColor =
    tone === "danger" ? "text-red-400" : tone === "warning" ? "text-yellow-400" : "text-[#d6e8d8]";
  return (
    <div className="rounded-lg border border-[#27684f]/30 bg-[#0f251d]/40 p-3" title={hint}>
      <div className="mb-1 flex items-center gap-1.5 text-xs text-[#81a898]">
        {icon}
        <span>{label}</span>
      </div>
      <div className={`text-lg font-bold font-mono ${valueColor}`}>{value}</div>
    </div>
  );
}

export function HostPanel({ host, rebootAt }: { host: HostReading | null; rebootAt?: number | null }) {
  if (!host) {
    return (
      <div className="rounded-lg border border-[#27684f]/30 bg-[#1a3c31]/50 p-4">
        <h3 className="mb-3 text-sm font-semibold text-[#47a87a]">树莓派 5 · 网关本体</h3>
        <p className="text-xs text-[#6d8f80]">暂无主机遥测数据（status.host 未上报）。</p>
      </div>
    );
  }

  // 5V 供电是欠压主信号：低于 4.63V 或告警位置位 → 告警
  const underVolt =
    host.undervoltageAlarm === true || (host.ext5vV != null && host.ext5vV < 4.63);
  const voltTone = underVolt ? "danger" : "normal";
  const tempTone =
    host.cpuTempC == null ? "normal" : host.cpuTempC >= 85 ? "danger" : host.cpuTempC >= 70 ? "warning" : "normal";

  const throttled = host.throttled;
  const throttledText =
    throttled === null
      ? UNKNOWN
      : throttled.flags.length === 0
        ? "无"
        : throttled.flags.map((f) => f.label).join("、");

  return (
    <div className="rounded-lg border border-[#27684f]/30 bg-[#1a3c31]/50 p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-[#47a87a]">树莓派 5 · 网关本体</h3>
        {rebootAt != null && (
          <span className="flex items-center gap-1 text-xs text-yellow-400">
            <AlertTriangle className="h-3 w-3" /> 检测到重启
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <Stat
          icon={<PlugZap className="h-3.5 w-3.5" />}
          label="5V 供电电压"
          value={fmt(host.ext5vV, 3, "V")}
          tone={voltTone}
          hint={underVolt ? "低于 4.63 V 或欠压告警" : "4.63 V 以下视为欠压"}
        />
        <Stat
          icon={<Cpu className="h-3.5 w-3.5" />}
          label="CPU 温度"
          value={fmt(host.cpuTempC, 1, "°C")}
          tone={tempTone}
          hint="≥70°C 偏高，≥85°C 危险"
        />
        <Stat
          icon={<Power className="h-3.5 w-3.5" />}
          label="节流标志"
          value={throttledText}
          tone={throttled && throttled.throttled ? "danger" : "normal"}
          hint={throttled?.hex ?? undefined}
        />
        <Stat
          icon={<HardDrive className="h-3.5 w-3.5" />}
          label="磁盘占用"
          value={fmt(host.diskUsedPercent, 1, "%")}
          tone={host.diskUsedPercent != null && host.diskUsedPercent >= 90 ? "warning" : "normal"}
        />
        <Stat icon={<Timer className="h-3.5 w-3.5" />} label="运行时长" value={fmtUptime(host.uptimeSec)} />
        <Stat
          icon={<Timer className="h-3.5 w-3.5" />}
          label="开机时刻 (UTC)"
          value={host.bootUtcNs != null ? formatWallClockNs(host.bootUtcNs) : UNKNOWN}
        />
      </div>

      {host.firmwareSampleUtcNs != null && (
        <div className="mt-2 text-xs text-[#6d8f80]">
          固件采样时间：{formatWallClockNs(host.firmwareSampleUtcNs)} (UTC)
        </div>
      )}
    </div>
  );
}