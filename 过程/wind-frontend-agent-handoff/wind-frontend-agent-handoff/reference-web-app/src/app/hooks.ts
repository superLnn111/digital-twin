import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { api, wsUrl, framesSearchParams, type ApiConfig } from '../api/client';
import { openAuthedSocket, type CloseInfo } from '../api/ws';
import { CHANNELS, type ChannelId, type GatewaySnapshot } from '../api/types';
import { telemetry, type SourceKind } from '../telemetry/store';
import { Simulator } from '../sim/simulator';
import { ReplayChannelStream } from '../replay/stream';
import { ReplayPlayer } from '../replay/player';
import { diffQuality, readQuality, type QualityCounters, type QualityDelta } from '../lib/quality';
import { detectReboot, readHost } from '../lib/host';
import type { SensorRangeConfig } from '../protocol/imu';

/* ───────────── telemetry subscription (throttled to ~7 Hz) ───────────── */

export function useTelemetryVersion(): number {
  return useSyncExternalStore(
    (cb) => telemetry.subscribe(cb),
    () => telemetry.version
  );
}

/** Re-render once per second for relative ages. */
export function useSecondTick(): number {
  const [t, setT] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setT(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  return t;
}

/* ───────────────────────── live status (/api/live) ───────────────────────── */

export type LinkState = 'off' | 'connecting' | 'open' | 'retrying' | 'auth-failed';

export interface LiveState {
  link: LinkState;
  detail: string | null;
  gateways: GatewaySnapshot[];
  /** Browser time of the last status message. */
  lastMessageAt: number | null;
}

export function useLiveStatus(cfg: ApiConfig, enabled: boolean): LiveState {
  const [state, setState] = useState<LiveState>({ link: 'off', detail: null, gateways: [], lastMessageAt: null });

  useEffect(() => {
    if (!enabled || !cfg.token.trim()) {
      setState((s) => ({ ...s, link: 'off', detail: enabled ? '未配置读取 token' : null }));
      return;
    }
    let disposed = false;
    let retry: ReturnType<typeof setTimeout> | null = null;
    let attempt = 0;
    let sock: { close(): void } | null = null;

    // initial snapshot via HTTP so the panel is not empty for the first second
    api
      .gateways(cfg)
      .then((gws) => !disposed && setState((s) => (s.gateways.length ? s : { ...s, gateways: gws })))
      .catch(() => {});

    const connect = () => {
      setState((s) => ({ ...s, link: attempt ? 'retrying' : 'connecting' }));
      sock = openAuthedSocket(wsUrl(cfg.base, '/api/live'), cfg.token, {
        onOpen: () => {
          if (!disposed) setState((s) => ({ ...s, link: 'open', detail: null }));
        },
        onMessage: (m) => {
          if (disposed || m.type !== 'status' || !Array.isArray(m.gateways)) return;
          attempt = 0;
          setState({ link: 'open', detail: null, gateways: m.gateways as GatewaySnapshot[], lastMessageAt: Date.now() });
        },
        onClose: (info: CloseInfo) => {
          if (disposed) return;
          sock = null;
          if (info.kind === 'auth') {
            setState((s) => ({ ...s, link: 'auth-failed', detail: info.detail }));
            return;
          }
          attempt++;
          const delay = Math.min(15000, 1000 * 2 ** Math.min(attempt, 4));
          setState((s) => ({ ...s, link: 'retrying', detail: `${info.detail}，${Math.round(delay / 1000)} s 后重连` }));
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
  }, [cfg, enabled]);

  return state;
}

/** Feed the `latest` preview frame of each channel into the telemetry store (deduplicated). */
export function useLiveIngest(snapshot: GatewaySnapshot | null, active: boolean): void {
  const seen = useRef(new Map<string, string>());
  useEffect(() => {
    if (!active) seen.current.clear();
  }, [active]);
  useEffect(() => {
    if (!active || !snapshot?.status?.channels) return;
    for (const c of CHANNELS) {
      const latest = snapshot.status.channels[c]?.latest;
      if (!latest || typeof latest.raw_hex !== 'string' || typeof latest.utc_ns !== 'string') continue;
      const key = `${latest.utc_ns}|${latest.raw_hex}`;
      if (seen.current.get(c) === key) continue;
      seen.current.set(c, key);
      telemetry.ingest(c, latest);
    }
  }, [snapshot, active]);
}

/* ───────────────────────── quality deltas ───────────────────────── */

export interface ChannelQualityView {
  counters: QualityCounters;
  last: QualityDelta | null;
  /** Browser time of the last increase, for highlighting. */
  increasedAt: number | null;
  resetAt: number | null;
}

export function useQualityTracker(snapshot: GatewaySnapshot | null): Record<ChannelId, ChannelQualityView | null> {
  const prev = useRef<Partial<Record<ChannelId, ChannelQualityView>>>({});
  const gw = useRef<string | null>(null);
  return useMemo(() => {
    if (snapshot?.gateway_id !== gw.current) {
      prev.current = {};
      gw.current = snapshot?.gateway_id ?? null;
    }
    const out = {} as Record<ChannelId, ChannelQualityView | null>;
    for (const c of CHANNELS) {
      const ch = snapshot?.status?.channels?.[c];
      if (!ch) {
        out[c] = null;
        continue;
      }
      const counters = readQuality(ch.quality);
      const p = prev.current[c];
      const d = diffQuality(p?.counters ?? null, counters);
      const now = Date.now();
      const view: ChannelQualityView = {
        counters,
        last: p ? d : null,
        increasedAt: p && d.increased ? now : p?.increasedAt ?? null,
        resetAt: p && d.reset ? now : p?.resetAt ?? null,
      };
      prev.current[c] = view;
      out[c] = view;
    }
    return out;
  }, [snapshot]);
}

/** Track reboots of the selected gateway (large boot shift or uptime going backwards). */
export function useRebootDetector(snapshot: GatewaySnapshot | null): number | null {
  const prev = useRef<{ id: string; host: ReturnType<typeof readHost> } | null>(null);
  const [rebootAt, setRebootAt] = useState<number | null>(null);
  useEffect(() => {
    if (!snapshot) return;
    const host = readHost(snapshot.status?.host);
    const p = prev.current;
    if (p && p.id === snapshot.gateway_id && detectReboot(p.host, host)) setRebootAt(Date.now());
    if (p && p.id !== snapshot.gateway_id) setRebootAt(null);
    prev.current = { id: snapshot.gateway_id, host };
  }, [snapshot]);
  return rebootAt;
}

/* ───────────────────────── simulator ───────────────────────── */

export function useSimulator(active: boolean, range: SensorRangeConfig): GatewaySnapshot | null {
  const rangeRef = useRef(range);
  rangeRef.current = range;
  const [snap, setSnap] = useState<GatewaySnapshot | null>(null);
  useEffect(() => {
    if (!active) {
      setSnap(null);
      return;
    }
    const sim = new Simulator(telemetry, () => rangeRef.current);
    sim.start();
    sim.tick();
    setSnap(sim.snapshot());
    const fast = setInterval(() => sim.tick(), 40);
    const slow = setInterval(() => setSnap(sim.snapshot()), 1000);
    return () => {
      clearInterval(fast);
      clearInterval(slow);
    };
  }, [active]);
  return snap;
}

/* ───────────────────────── replay ───────────────────────── */

export interface ReplaySpec {
  gateway_id: string;
  session_id?: string;
  since_ns?: string;
  until_ns?: string;
  channels: ChannelId[];
  /** Overall extent for the progress bar (session start/end or query range). */
  extentStartNs: bigint | null;
  extentEndNs: bigint | null;
  label: string;
}

export interface ReplayHandle {
  spec: ReplaySpec | null;
  player: ReplayPlayer | null;
  version: number;
  start: (spec: ReplaySpec) => void;
  seek: (ns: bigint) => void;
  stop: () => void;
  bump: () => void;
}

export const REPLAY_PAGE_LIMIT = 500;

export function useReplay(cfg: ApiConfig, active: boolean): ReplayHandle {
  const [spec, setSpec] = useState<ReplaySpec | null>(null);
  const [player, setPlayer] = useState<ReplayPlayer | null>(null);
  const [version, setVersion] = useState(0);
  const playerRef = useRef<ReplayPlayer | null>(null);
  const pending = useRef(false);
  const bump = useCallback(() => {
    if (pending.current) return;
    pending.current = true;
    setTimeout(() => {
      pending.current = false;
      setVersion((v) => v + 1);
    }, 120);
  }, []);

  const launch = useCallback(
    (s: ReplaySpec, sinceOverride?: bigint) => {
      const streams: Partial<Record<ChannelId, ReplayChannelStream>> = {};
      for (const c of s.channels) {
        streams[c] = new ReplayChannelStream({
          token: cfg.token,
          onChange: bump,
          url: (cursor) =>
            wsUrl(
              cfg.base,
              '/api/replay',
              framesSearchParams(
                {
                  gateway_id: s.gateway_id,
                  channel_id: c,
                  session_id: s.session_id,
                  since_ns: sinceOverride !== undefined ? String(sinceOverride) : s.since_ns,
                  until_ns: s.until_ns,
                  limit: REPLAY_PAGE_LIMIT,
                },
                cursor
              )
            ),
        });
      }
      telemetry.reset('replay');
      const p = new ReplayPlayer(streams, telemetry);
      if (playerRef.current) {
        p.speed = playerRef.current.speed;
        playerRef.current.stop();
      }
      playerRef.current = p;
      p.start();
      setPlayer(p);
      setSpec(s);
    },
    [cfg, bump]
  );

  const stop = useCallback(() => {
    playerRef.current?.stop();
    playerRef.current = null;
    setPlayer(null);
    setSpec(null);
  }, []);

  const seek = useCallback(
    (ns: bigint) => {
      if (spec) launch(spec, ns);
    },
    [spec, launch]
  );

  // drive the clock with rAF while replay is the active source
  useEffect(() => {
    if (!active || !player) return;
    let raf = 0;
    let last = performance.now();
    const loop = (t: number) => {
      const dt = t - last;
      last = t;
      if (player.tick(dt)) bump();
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [active, player, bump]);

  useEffect(() => {
    if (!active) stop();
  }, [active, stop]);

  return { spec, player, version, start: launch, seek, stop, bump };
}

/** Reset the store when switching sources so live, replay and sim data never mix. */
export function useSourceReset(source: SourceKind): void {
  useEffect(() => {
    telemetry.reset(source);
  }, [source]);
}
