// ============================================================
// WindV2Context.tsx — wind-monitoring v2 实时数据全局状态
// ============================================================
// 职责：
//   1. 加载/保存前端连接设置（读取 token、API 前缀、量程）
//   2. HTTP 拉取网关列表（Bearer 认证）+ WebSocket 订阅 /api/live（首消息认证）
//   3. 维护选中网关的 status 快照、通道质量计数、树莓派 host 遥测
//
// 遵循契约红线：
//   - token 只放 Authorization 头 / WS 首消息，绝不进 URL
//   - 所有 *_ns 均为十进制字符串，用 BigInt 解析，不经过 Number 精度丢失
//   - status.host / channels 等字段全部可空，缺失一律渲染「未知」
// ============================================================

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import { api, wsUrl } from "@/lib/api/client";
import { openAuthedSocket, type CloseInfo } from "@/lib/api/ws";
import { CHANNELS, type ChannelId, type GatewaySnapshot } from "@/lib/api/types";
import { readHost, detectReboot, type HostReading } from "@/lib/utils/host";
import { readQuality, diffQuality, type QualityCounters } from "@/lib/utils/quality";
import { loadSettings, saveSettings, type Settings } from "@/lib/settings";

// ========== 类型 ==========

export type LinkState = "off" | "connecting" | "open" | "retrying" | "auth-failed";

export interface ChannelQualityView {
  counters: QualityCounters;
  /** 计数器上涨时刻（用于高亮） */
  increasedAt: number | null;
  /** 计数器回退时刻（说明网关重启） */
  resetAt: number | null;
}

interface WindV2ContextValue {
  settings: Settings;
  updateSettings: (s: Settings) => void;
  hasToken: boolean;
  link: LinkState;
  detail: string | null;
  gateways: GatewaySnapshot[];
  selectedGatewayId: string | null;
  setSelectedGatewayId: (id: string | null) => void;
  snapshot: GatewaySnapshot | null;
  quality: Record<ChannelId, ChannelQualityView | null>;
  host: HostReading | null;
  rebootAt: number | null;
  lastMessageAt: number | null;
}

// ========== 默认值 ==========

const WindV2Context = createContext<WindV2ContextValue>({
  settings: loadSettings(),
  updateSettings: () => {},
  hasToken: false,
  link: "off",
  detail: null,
  gateways: [],
  selectedGatewayId: null,
  setSelectedGatewayId: () => {},
  snapshot: null,
  quality: { "usb-if00": null, "usb-if02": null, "usb-if04": null, "usb-if06": null },
  host: null,
  rebootAt: null,
  lastMessageAt: null,
});

// ========== Provider ==========

export function WindV2Provider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const updateSettings = useCallback((s: Settings) => {
    setSettings(s);
    saveSettings(s);
  }, []);
  const hasToken = settings.token.trim().length > 0;

  // ---- 实时连接状态 ----
  const [link, setLink] = useState<LinkState>("off");
  const [detail, setDetail] = useState<string | null>(null);
  const [gateways, setGateways] = useState<GatewaySnapshot[]>([]);
  const [lastMessageAt, setLastMessageAt] = useState<number | null>(null);

  // ---- 选中网关 ----
  const [selectedGatewayId, setSelectedGatewayId] = useState<string | null>(null);

  // ---- 连接 / 重连 ----
  useEffect(() => {
    if (!hasToken) {
      setLink("off");
      setDetail("未配置读取 token");
      setGateways([]);
      return;
    }
    let disposed = false;
    let retry: ReturnType<typeof setTimeout> | null = null;
    let attempt = 0;
    let sock: { close(): void } | null = null;

    // 首秒先用 HTTP 拉一次，避免面板空白
    api
      .gateways({ base: settings.apiBase, token: settings.token })
      .then((gws) => {
        if (disposed) return;
        setGateways((prev) => (prev.length ? prev : gws));
      })
      .catch(() => {});

    const connect = () => {
      setLink((s) => (attempt ? "retrying" : "connecting"));
      sock = openAuthedSocket(wsUrl(settings.apiBase, "/api/live"), settings.token, {
        onOpen: () => {
          if (!disposed) setLink("open");
        },
        onMessage: (m) => {
          if (disposed || m.type !== "status" || !Array.isArray(m.gateways)) return;
          attempt = 0;
          setLink("open");
          setDetail(null);
          setGateways(m.gateways as GatewaySnapshot[]);
          setLastMessageAt(Date.now());
        },
        onClose: (info: CloseInfo) => {
          if (disposed) return;
          sock = null;
          if (info.kind === "auth") {
            setLink("auth-failed");
            setDetail(info.detail);
            return;
          }
          attempt++;
          const delay = Math.min(15000, 1000 * 2 ** Math.min(attempt, 4));
          setLink("retrying");
          setDetail(`${info.detail}，${Math.round(delay / 1000)} s 后重连`);
          retry = setTimeout(connect, delay);
        },
      });
    };
    connect();

    return () => {
      disposed = true;
      if (retry) clearTimeout(retry);
      sock?.close();
    };
  }, [settings.apiBase, settings.token, hasToken]);

  // ---- 选中网关自动落到「在线且有 status」的网关上 ----
  useEffect(() => {
    if (!gateways.length) return;
    if (selectedGatewayId && gateways.some((g) => g.gateway_id === selectedGatewayId)) return;
    const pick = gateways.find((g) => g.online && g.status) ?? gateways.find((g) => g.status) ?? gateways[0];
    setSelectedGatewayId(pick.gateway_id);
  }, [gateways, selectedGatewayId]);

  const snapshot = useMemo(
    () => gateways.find((g) => g.gateway_id === selectedGatewayId) ?? null,
    [gateways, selectedGatewayId]
  );

  // ---- 通道质量计数（跨快照差分） ----
  const qualityPrev = useRef<{ gw: string | null; map: Partial<Record<ChannelId, ChannelQualityView>> }>({
    gw: null,
    map: {},
  });
  const quality = useMemo<Record<ChannelId, ChannelQualityView | null>>(() => {
    const gw = snapshot?.gateway_id ?? null;
    if (qualityPrev.current.gw !== gw) {
      qualityPrev.current = { gw, map: {} };
    }
    const out = {} as Record<ChannelId, ChannelQualityView | null>;
    for (const c of CHANNELS) {
      const ch = snapshot?.status?.channels?.[c];
      if (!ch) {
        out[c] = null;
        continue;
      }
      const counters = readQuality(ch.quality as Record<string, unknown> | null);
      const prev = qualityPrev.current.map[c];
      const d = diffQuality(prev?.counters ?? null, counters);
      const now = Date.now();
      const view: ChannelQualityView = {
        counters,
        increasedAt: prev && d.increased ? now : (prev?.increasedAt ?? null),
        resetAt: prev && d.reset ? now : (prev?.resetAt ?? null),
      };
      qualityPrev.current.map[c] = view;
      out[c] = view;
    }
    return out;
  }, [snapshot]);

  // ---- host 遥测 + 重启检测 ----
  const host = useMemo<HostReading | null>(
    () => (snapshot ? readHost(snapshot.status?.host as Record<string, unknown> | null) : null),
    [snapshot]
  );
  const hostPrev = useRef<{ gw: string | null; host: HostReading | null }>({ gw: null, host: null });
  const [rebootAt, setRebootAt] = useState<number | null>(null);
  useEffect(() => {
    if (!snapshot || !host) return;
    const p = hostPrev.current;
    if (p.host && p.gw === snapshot.gateway_id && detectReboot(p.host, host)) setRebootAt(Date.now());
    if (p.gw !== snapshot.gateway_id) setRebootAt(null);
    hostPrev.current = { gw: snapshot.gateway_id, host };
  }, [snapshot, host]);

  const value: WindV2ContextValue = {
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
    lastMessageAt,
  };

  return <WindV2Context.Provider value={value}>{children}</WindV2Context.Provider>;
}

// ========== 消费 Hook ==========

export function useWindV2() {
  return useContext(WindV2Context);
}