// ============================================================
// ImuLivePanel.tsx — IMU 六轴实时波形（live 模式 1 Hz latest 预览）
// ============================================================
// 对每个通道的 latest.raw_hex 做 ATK-IMU901 解析，按 utc_ns 去重后累积成
// 波形。横轴为相对秒（BigInt 纳秒差，无损换算）。
// ============================================================

import { useEffect, useMemo, useRef, useState } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import { Activity } from "lucide-react";
import { CHANNELS, CHANNEL_LABEL, type ChannelId, type GatewaySnapshot } from "@/lib/api/types";
import { parseImuFrameHex, parseNsBigInt } from "@/lib/protocol/imu";
import type { SensorRangeConfig } from "@/lib/protocol/imu";

const MAX_POINTS = 120;

interface Point {
  relSec: number;
  ax: number;
  ay: number;
  az: number;
  accMag: number;
  gx: number;
  gy: number;
  gz: number;
  gyroMag: number;
}

type Series = Record<ChannelId, Point[]>;

const EMPTY: Series = { "usb-if00": [], "usb-if02": [], "usb-if04": [], "usb-if06": [] };

export function ImuLivePanel({
  snapshot,
  range,
}: {
  snapshot: GatewaySnapshot | null;
  range: SensorRangeConfig;
}) {
  const [series, setSeries] = useState<Series>(EMPTY);
  const [selected, setSelected] = useState<ChannelId>("usb-if00");
  const seen = useRef<Partial<Record<ChannelId, string>>>({});
  const firstNs = useRef<bigint | null>(null);

  // 网关切换时清空累积
  const gw = snapshot?.gateway_id ?? null;
  const gwRef = useRef<string | null>(null);
  useEffect(() => {
    if (gwRef.current !== gw) {
      gwRef.current = gw;
      seen.current = {};
      firstNs.current = null;
      setSeries(EMPTY);
    }
  }, [gw]);

  useEffect(() => {
    if (!snapshot?.status?.channels) return;
    setSeries((prev) => {
      const next: Series = { ...prev };
      let changed = false;
      for (const c of CHANNELS) {
        const latest = snapshot.status?.channels?.[c]?.latest;
        if (!latest || typeof latest.raw_hex !== "string" || typeof latest.utc_ns !== "string") continue;
        const key = `${latest.utc_ns}|${latest.raw_hex}`;
        if (seen.current[c] === key) continue;
        seen.current[c] = key;

        const parsed = parseImuFrameHex(latest.raw_hex, range);
        if (!parsed.valid || parsed.payload.kind !== "six_axis") continue;
        const six = parsed.payload;
        const utcNs = parseNsBigInt(latest.utc_ns);
        if (utcNs == null) continue;
        if (firstNs.current == null) firstNs.current = utcNs;
        const relSec = Number(utcNs - firstNs.current) / 1e9;

        const point: Point = {
          relSec,
          ax: six.ax,
          ay: six.ay,
          az: six.az,
          accMag: six.accMagnitude,
          gx: six.gx,
          gy: six.gy,
          gz: six.gz,
          gyroMag: six.gyroMagnitude,
        };
        const arr = [...(prev[c] ?? []), point];
        next[c] = arr.length > MAX_POINTS ? arr.slice(-MAX_POINTS) : arr;
        changed = true;
      }
      return changed ? next : prev;
    });
  }, [snapshot, range]);

  const data = useMemo(() => series[selected], [series, selected]);
  const hasData = data.length > 1;

  return (
    <div className="rounded-lg border border-[#27684f]/30 bg-[#1a3c31]/50 p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-[#47a87a]" />
          <h3 className="text-sm font-semibold text-[#47a87a]">IMU 六轴实时波形</h3>
        </div>
        <div className="flex gap-1">
          {CHANNELS.map((c) => (
            <button
              key={c}
              onClick={() => setSelected(c)}
              className={`rounded px-2 py-1 text-xs transition-colors ${
                selected === c
                  ? "bg-[#47a87a] text-[#0f251d]"
                  : "bg-[#27684f]/20 text-[#81a898] hover:bg-[#27684f]/40"
              }`}
            >
              {CHANNEL_LABEL[c]}
            </button>
          ))}
        </div>
      </div>

      {!hasData ? (
        <div className="h-[220px] flex items-center justify-center text-[#6d8f80] text-sm font-mono">
          等待六轴帧数据…（live 模式 1 Hz latest 预览，完整波形需回放）
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(39,104,79,0.15)" />
            <XAxis
              dataKey="relSec"
              stroke="#47a87a"
              style={{ fontSize: 9 }}
              tickFormatter={(v: number) => `${v.toFixed(0)}s`}
            />
            <YAxis stroke="#47a87a" style={{ fontSize: 9 }} domain={["auto", "auto"]} />
            <Tooltip
              contentStyle={{ backgroundColor: "#1a3c31", border: "1px solid rgba(39,104,79,0.3)", borderRadius: 8 }}
              labelStyle={{ color: "#47a87a" }}
              labelFormatter={(v) => `相对 ${Number(v).toFixed(1)} s`}
            />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Line type="monotone" dataKey="ax" stroke="#06b6d4" strokeWidth={1.5} dot={false} name="ax (m/s²)" />
            <Line type="monotone" dataKey="ay" stroke="#22d3ee" strokeWidth={1.5} dot={false} name="ay (m/s²)" />
            <Line type="monotone" dataKey="az" stroke="#67e8f9" strokeWidth={1.5} dot={false} name="az (m/s²)" />
          </LineChart>
        </ResponsiveContainer>
      )}

      {hasData && (
        <div className="mt-2 grid grid-cols-3 gap-2 text-xs font-mono text-[#81a898]">
          <div>
            |a| <span className="text-[#47a87a]">{data[data.length - 1].accMag.toFixed(3)} m/s²</span>
          </div>
          <div>
            |ω| <span className="text-[#47a87a]">{data[data.length - 1].gyroMag.toFixed(2)} °/s</span>
          </div>
          <div>
            样本 <span className="text-[#47a87a]">{data.length}</span>
          </div>
        </div>
      )}
    </div>
  );
}