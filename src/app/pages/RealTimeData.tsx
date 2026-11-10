// ============================================================
// RealTimeData.tsx — 传感器实时数据监测页面（wind-monitoring v2）
// ============================================================
// 数据来源：
//   - wind-monitoring v2 后端：HTTP Bearer 网关列表 + WS /api/live 首消息认证
//   - 网关 status.host：树莓派 5 本体遥测（5V/CPU/节流/磁盘/时长）
//   - 网关 status.channels：4 路 IMU 通道（六轴 raw_hex 解析 + 质量计数）
//   - Open-Meteo 气象 API：风速（独立外部源）
// 无模拟数据 — 没有真实数据时显示「未知」或空图表
// ============================================================

import { useCallback, useEffect, useMemo, useState } from "react";
import { Cloud, CloudOff, KeyRound, RefreshCw, Wifi, WifiOff, Wind } from "lucide-react";
import { CameraFeed } from "../components/CameraFeed";
import { HostPanel } from "../components/HostPanel";
import { ChannelStatusPanel } from "../components/ChannelStatusPanel";
import { ImuLivePanel } from "../components/ImuLivePanel";
import { ConnectionSettings } from "../components/ConnectionSettings";
import { useWindV2, type LinkState } from "../context/WindV2Context";

const WEATHER_URL = "https://api.open-meteo.com/v1/forecast?latitude=22.2769&longitude=113.5678&current=wind_speed_10m&timezone=Asia/Shanghai";
const CAMERA_STREAM_URL = "http://8.138.129.114:8080/?action=stream";

const LINK_META: Record<LinkState, { label: string; tone: "ok" | "warn" | "err" | "muted" }> = {
  open: { label: "已连接", tone: "ok" },
  connecting: { label: "连接中…", tone: "warn" },
  retrying: { label: "重连中…", tone: "warn" },
  "auth-failed": { label: "认证失败", tone: "err" },
  off: { label: "未配置", tone: "muted" },
};

export function RealTimeData() {
  const {
    settings,
    updateSettings,
    hasToken,
    link,
    detail,
    gateways,
    selectedGatewayId,
    setSelectedGatewayId,
    snapshot,
    quality,
    host,
    rebootAt,
  } = useWindV2();

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [windSpeed, setWindSpeed] = useState<number | null>(null);
  const [weatherOk, setWeatherOk] = useState<boolean | null>(null);

  const range = useMemo(
    () => ({ accRangeG: settings.accRangeG, gyroRangeDps: settings.gyroRangeDps }),
    [settings.accRangeG, settings.gyroRangeDps]
  );

  // ========== 气象 API：风速 ==========
  useEffect(() => {
    const fetchWeather = () => {
      fetch(WEATHER_URL)
        .then((res) => res.json())
        .then((json) => {
          const w = json?.current?.wind_speed_10m;
          if (typeof w === "number") {
            setWindSpeed(w);
            setWeatherOk(true);
          } else {
            setWeatherOk(false);
          }
        })
        .catch(() => setWeatherOk(false));
    };
    fetchWeather();
    const t = setInterval(fetchWeather, 5 * 60 * 1000);
    return () => clearInterval(t);
  }, []);

  // ========== 手动重连 ==========
  const handleReconnect = useCallback(() => {
    // 触发 Provider 重建连接：轻量做法是切换 token 引用；这里通过保存设置重新触发 effect
    updateSettings({ ...settings });
  }, [settings, updateSettings]);

  const linkMeta = LINK_META[link];
  const online = snapshot?.online === true;
  const gatewayCount = gateways.length;

  return (
    <div className="space-y-6">
      {/* ========== 监控摄像头 ========== */}
      <CameraFeed streamUrl={CAMERA_STREAM_URL} />

      {/* ========== 顶部 Header：标题 + 连接状态 ========== */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 className="text-lg font-semibold text-[#47a87a]">传感器实时数据</h2>

        <div className="flex flex-wrap items-center gap-3 text-xs">
          {/* v2 后端连接状态 */}
          <div
            className={`flex items-center gap-1.5 rounded border px-2.5 py-1 ${
              linkMeta.tone === "ok"
                ? "border-green-500/30 bg-green-500/10"
                : linkMeta.tone === "err"
                  ? "border-red-500/30 bg-red-500/10"
                  : linkMeta.tone === "warn"
                    ? "border-yellow-500/30 bg-yellow-500/10"
                    : "border-[#27684f]/30 bg-[#27684f]/10"
            }`}
            title={detail ?? undefined}
          >
            {linkMeta.tone === "ok" ? (
              <Wifi className="h-3 w-3 text-green-400" />
            ) : linkMeta.tone === "err" ? (
              <WifiOff className="h-3 w-3 text-red-400" />
            ) : (
              <WifiOff className="h-3 w-3 text-yellow-400 animate-pulse" />
            )}
            <span
              className={
                linkMeta.tone === "ok"
                  ? "text-green-400"
                  : linkMeta.tone === "err"
                    ? "text-red-400"
                    : linkMeta.tone === "warn"
                      ? "text-yellow-400"
                      : "text-[#6d8f80]"
              }
            >
              网关 {linkMeta.label}
            </span>
          </div>

          {/* 网关在线 / 通道数 */}
          <div className="flex items-center gap-1.5 rounded border border-[#27684f]/30 bg-[#27684f]/10 px-2.5 py-1">
            <span className={`h-1.5 w-1.5 rounded-full ${online ? "bg-green-500" : "bg-gray-500"}`} />
            <span className={online ? "text-green-400" : "text-[#6d8f80]"}>
              网关 {gatewayCount > 0 ? (online ? "在线" : "离线") : "未知"}
            </span>
          </div>

          {/* 气象 API */}
          <div
            className={`flex items-center gap-1.5 rounded border px-2.5 py-1 ${
              weatherOk === true
                ? "border-green-500/30 bg-green-500/10"
                : weatherOk === false
                  ? "border-red-500/30 bg-red-500/10"
                  : "border-[#27684f]/30 bg-[#27684f]/10"
            }`}
          >
            {weatherOk === false ? (
              <CloudOff className="h-3 w-3 text-red-400" />
            ) : (
              <Cloud className="h-3 w-3 text-green-400" />
            )}
            <span
              className={
                weatherOk === true ? "text-green-400" : weatherOk === false ? "text-red-400" : "text-[#6d8f80]"
              }
            >
              气象 {weatherOk === true ? "OK" : weatherOk === false ? "失败" : "…"}
            </span>
          </div>

          {/* 网关选择 */}
          {gatewayCount > 1 && (
            <select
              value={selectedGatewayId ?? ""}
              onChange={(e) => setSelectedGatewayId(e.target.value || null)}
              className="rounded border border-[#27684f]/40 bg-[#0f251d] px-2 py-1 text-xs text-[#d6e8d8] outline-none"
            >
              {gateways.map((g) => (
                <option key={g.gateway_id} value={g.gateway_id}>
                  {g.gateway_id}
                </option>
              ))}
            </select>
          )}

          {/* 设置 / 重连 */}
          <button
            onClick={() => setSettingsOpen(true)}
            className="flex items-center gap-1 rounded border border-[#27684f]/30 bg-[#27684f]/10 px-2 py-1 text-[#47a87a] transition-colors hover:bg-[#27684f]/20"
          >
            <KeyRound className="h-3 w-3" /> 连接设置
          </button>
          <button
            onClick={handleReconnect}
            className="flex items-center gap-1 rounded border border-[#27684f]/30 bg-[#27684f]/10 px-2 py-1 text-[#47a87a] transition-colors hover:bg-[#27684f]/20"
          >
            <RefreshCw className="h-3 w-3" /> 重连
          </button>
        </div>
      </div>

      {/* 未配置 token 提示 */}
      {!hasToken && (
        <div className="flex items-center gap-2 rounded-lg border border-yellow-500/30 bg-yellow-500/10 px-4 py-3 text-sm text-yellow-400">
          <WifiOff className="h-4 w-4" />
          尚未配置读取 token，实时数据不可用。本地联调默认 token 为{" "}
          <code className="rounded bg-[#0f251d] px-1.5 py-0.5 font-mono">wind-dev-token</code>
          <button onClick={() => setSettingsOpen(true)} className="ml-2 underline hover:text-yellow-300">
            去配置
          </button>
        </div>
      )}

      {/* ========== 树莓派 5 网关本体遥测 ========== */}
      <HostPanel host={host} rebootAt={rebootAt} />

      {/* ========== 4 路 IMU 通道状态 ========== */}
      <ChannelStatusPanel snapshot={snapshot} quality={quality} />

      {/* ========== IMU 六轴实时波形 ========== */}
      <ImuLivePanel snapshot={snapshot} range={range} />

      {/* ========== 风速（气象台） ========== */}
      <div className="rounded-lg border border-[#27684f]/30 bg-[#1a3c31]/50 p-4">
        <div className="mb-2 flex items-center gap-2">
          <Wind className="h-4 w-4 text-[#10b981]" />
          <h3 className="text-sm font-semibold text-[#47a87a]">实时风速（气象台 · Open-Meteo）</h3>
        </div>
        <div className="flex items-baseline gap-2">
          <span className="text-3xl font-bold text-[#10b981]">
            {windSpeed != null ? windSpeed.toFixed(1) : "--"}
          </span>
          <span className="text-sm text-[#6d8f80]">m/s</span>
          <span className="ml-4 text-xs text-[#6d8f80]">
            珠海校区附近（22.28°N, 113.57°E）
          </span>
        </div>
      </div>

      {/* ========== 连接设置弹窗 ========== */}
      {settingsOpen && (
        <ConnectionSettings settings={settings} onSave={updateSettings} onClose={() => setSettingsOpen(false)} />
      )}
    </div>
  );
}