// ============================================================
// ChannelStatusPanel.tsx — 4 路 IMU 通道状态卡片
// ============================================================
// 展示每路通道的运行状态、帧计数、最新帧解码结果、质量计数。
// 所有字段可空，缺失渲染「未知」；raw_hex 用 ATK-IMU901 纯函数解析。
// ============================================================

import { Activity, Gauge, ShieldAlert, ShieldCheck, ShieldX } from "lucide-react";
import { CHANNELS, CHANNEL_LABEL, type ChannelId, type GatewaySnapshot } from "@/lib/api/types";
import { parseImuFrameHex } from "@/lib/protocol/imu";
import { parseNs } from "@/lib/utils/ns";
import type { ChannelQualityView } from "../context/WindV2Context";

const MESSAGE_LABEL: Record<number, string> = {
  0x01: "姿态角",
  0x02: "四元数",
  0x03: "六轴",
  0x06: "端口状态",
};

function messageLabel(id: number | null | undefined): string {
  if (id == null) return "未知";
  return MESSAGE_LABEL[id] ?? `0x${id.toString(16).padStart(2, "0")}`;
}

function fmtNum(v: number | null | undefined, digits = 2): string {
  return v == null || !Number.isFinite(v) ? "—" : v.toFixed(digits);
}

interface ChannelCardProps {
  channel: ChannelId;
  snapshot: GatewaySnapshot | null;
  quality: ChannelQualityView | null;
  nowNs: bigint;
}

function ChannelCard({ channel, snapshot, quality, nowNs }: ChannelCardProps) {
  const ch = snapshot?.status?.channels?.[channel] ?? null;
  const running = ch?.running ?? null;

  // 解析最新帧
  const rawHex = ch?.latest?.raw_hex ?? null;
  const parsed = rawHex ? parseImuFrameHex(rawHex) : null;
  const six =
    parsed && parsed.valid && parsed.payload.kind === "six_axis" ? parsed.payload : null;

  const updatedNs = parseNs(ch?.updated_utc_ns ?? null);
  const ageSec = updatedNs != null && nowNs > 0n ? Number((nowNs - updatedNs) / 1_000_000_000n) : null;

  const checksumErr = quality?.counters.checksum_errors ?? null;
  const lengthErr = quality?.counters.length_errors ?? null;
  const hasErrors = (checksumErr ?? 0) > 0 || (lengthErr ?? 0) > 0;

  return (
    <div className="rounded-lg border border-[#27684f]/30 bg-[#1a3c31]/50 p-4">
      {/* 标题行 */}
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-[#d6e8d8]">{CHANNEL_LABEL[channel]}</span>
          <span className="text-xs font-mono text-[#6d8f80]">{channel}</span>
        </div>
        {running === true ? (
          <span className="flex items-center gap-1 text-xs text-green-400">
            <ShieldCheck className="h-3.5 w-3.5" /> 运行中
          </span>
        ) : running === false ? (
          <span className="flex items-center gap-1 text-xs text-red-400">
            <ShieldX className="h-3.5 w-3.5" /> 已停止
          </span>
        ) : (
          <span className="text-xs text-[#6d8f80]">未知</span>
        )}
      </div>

      {/* 最新帧解码 */}
      <div className="space-y-1 text-xs">
        <div className="flex justify-between">
          <span className="text-[#81a898]">最新帧类型</span>
          <span className="font-mono text-[#d6e8d8]">{messageLabel(ch?.latest?.message_id)}</span>
        </div>
        {six ? (
          <>
            <div className="flex justify-between">
              <span className="text-[#81a898]">加速度 |a|</span>
              <span className="font-mono text-[#47a87a]">
                {fmtNum(six.accMagnitude, 3)} m/s²
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#81a898]">角速度 |ω|</span>
              <span className="font-mono text-[#47a87a]">
                {fmtNum(six.gyroMagnitude, 2)} °/s
              </span>
            </div>
            <div className="flex gap-2 font-mono text-[10px] text-[#6d8f80]">
              <span>ax {fmtNum(six.ax, 2)}</span>
              <span>ay {fmtNum(six.ay, 2)}</span>
              <span>az {fmtNum(six.az, 2)}</span>
            </div>
            <div className="flex gap-2 font-mono text-[10px] text-[#6d8f80]">
              <span>gx {fmtNum(six.gx, 1)}</span>
              <span>gy {fmtNum(six.gy, 1)}</span>
              <span>gz {fmtNum(six.gz, 1)}</span>
            </div>
          </>
        ) : (
          <div className="text-[#6d8f80]">{rawHex ? "非六轴帧或解析失败" : "无最新帧"}</div>
        )}
        <div className="flex justify-between">
          <span className="text-[#81a898]">帧计数</span>
          <span className="font-mono text-[#d6e8d8]">{ch?.frames ?? "未知"}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-[#81a898]">更新时间</span>
          <span className="font-mono text-[#d6e8d8]">
            {ageSec == null ? "未知" : ageSec < 0 ? "时钟偏移" : `${ageSec.toFixed(0)} s 前`}
          </span>
        </div>
      </div>

      {/* 质量计数 */}
      <div className="mt-2 flex items-center gap-2 border-t border-[#27684f]/20 pt-2 text-xs">
        {hasErrors ? (
          <ShieldAlert className="h-3.5 w-3.5 text-yellow-400" />
        ) : (
          <ShieldCheck className="h-3.5 w-3.5 text-green-400" />
        )}
        <span className="text-[#81a898]">校验错</span>
        <span className={`font-mono ${checksumErr ? "text-yellow-400" : "text-[#d6e8d8]"}`}>
          {checksumErr ?? "未知"}
        </span>
        <span className="text-[#81a898]">长度错</span>
        <span className={`font-mono ${lengthErr ? "text-yellow-400" : "text-[#d6e8d8]"}`}>
          {lengthErr ?? "未知"}
        </span>
      </div>
    </div>
  );
}

export function ChannelStatusPanel({
  snapshot,
  quality,
}: {
  snapshot: GatewaySnapshot | null;
  quality: Record<ChannelId, ChannelQualityView | null>;
}) {
  const nowNs = BigInt(Math.round(Date.now() * 1e6));

  return (
    <div className="rounded-lg border border-[#27684f]/30 bg-[#1a3c31]/50 p-4">
      <div className="mb-3 flex items-center gap-2">
        <Gauge className="h-4 w-4 text-[#47a87a]" />
        <h3 className="text-sm font-semibold text-[#47a87a]">IMU 通道状态</h3>
        <span className="text-xs text-[#6d8f80]">网关 {snapshot?.gateway_id ?? "未选择"}</span>
      </div>
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {CHANNELS.map((c) => (
          <ChannelCard key={c} channel={c} snapshot={snapshot} quality={quality[c] ?? null} nowNs={nowNs} />
        ))}
      </div>
    </div>
  );
}