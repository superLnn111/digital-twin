import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState, type PointerEvent } from 'react';
import type { ChannelId } from './api/types';
import type { AccRangeG, GyroRangeDps, SensorRangeConfig } from './protocol/imu';
import { loadSettings, saveSettings, type Settings } from './app/settings';
import {
  useLiveIngest,
  useLiveStatus,
  useQualityTracker,
  useRebootDetector,
  useReplay,
  useSecondTick,
  useSimulator,
  useSourceReset,
  type ReplaySpec,
} from './app/hooks';
import type { SourceKind } from './telemetry/store';
import { TopBar, type ViewKind } from './components/TopBar';
import { GatewayPanel, ChannelsPanel, FocusPanel } from './components/Inspector';
import { HostPanel } from './components/HostPanel';
import { WaveformTracks, type ScaleMode, type SignalKind, type XMode } from './components/WaveformTracks';
import { Transport, ReplayPanel } from './components/Transport';
import { SettingsSheet } from './components/SettingsSheet';
import { VideoPanel } from './components/VideoPanel';
import { Segmented, Section } from './components/ui';

const TwinViewport = lazy(() => import('./twin/TwinViewport'));
const HistoryWorkspace = lazy(() => import('./history/HistoryWorkspace'));

const WINDOWS = [2000, 5000, 10000, 30000, 60000];

export default function App() {
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const updateSettings = useCallback((s: Settings) => {
    setSettings(s);
    saveSettings(s);
  }, []);
  const cfg = useMemo(() => ({ base: settings.apiBase, token: settings.token }), [settings.apiBase, settings.token]);
  const range = useMemo<SensorRangeConfig>(() => ({ accRangeG: settings.accRangeG, gyroRangeDps: settings.gyroRangeDps }), [settings.accRangeG, settings.gyroRangeDps]);
  const hasToken = settings.token.trim().length > 0;

  const [view, setView] = useState<ViewKind>('monitor');
  const [source, setSource] = useState<SourceKind>(() => (hasToken ? 'live' : 'sim'));
  const [focus, setFocus] = useState<ChannelId>('usb-if00');
  const [signal, setSignal] = useState<SignalKind>('acc');
  const [windowMs, setWindowMs] = useState(5000);
  const [scale, setScale] = useState<ScaleMode>('auto');
  const [xMode, setXMode] = useState<XMode>('time');
  const [gatewayId, setGatewayId] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [videoOpen, setVideoOpen] = useState(false);
  const [tracksH, setTracksH] = useState(() => Math.round(Math.min(380, Math.max(220, window.innerHeight * 0.36))));

  useSourceReset(source);
  useSecondTick();
  const live = useLiveStatus(cfg, source === 'live');
  const sim = useSimulator(source === 'sim', range);
  const replay = useReplay(cfg, source === 'replay');

  const gatewayIds = source === 'sim' ? (sim ? [sim.gateway_id] : []) : live.gateways.map((g) => g.gateway_id);
  useEffect(() => {
    if (source !== 'live' || !live.gateways.length || live.gateways.some((g) => g.gateway_id === gatewayId)) return;
    // default to a gateway that is actually reporting, then one with any status
    const pick = live.gateways.find((g) => g.online) ?? live.gateways.find((g) => g.status) ?? live.gateways[0];
    setGatewayId(pick.gateway_id);
  }, [source, live.gateways, gatewayId]);
  const snapshot = source === 'sim' ? sim : source === 'live' ? live.gateways.find((g) => g.gateway_id === gatewayId) ?? null : null;
  useLiveIngest(source === 'live' ? snapshot : null, source === 'live');
  const quality = useQualityTracker(snapshot);
  const rebootAt = useRebootDetector(snapshot);

  const startReplay = useCallback(
    (spec: ReplaySpec) => {
      setSource('replay');
      setView('monitor');
      replay.start(spec);
    },
    [replay]
  );

  // splitter between the 3D stage and the waveform tracks
  const drag = useRef<{ y: number; h: number } | null>(null);
  const onSplitDown = (e: PointerEvent) => {
    drag.current = { y: e.clientY, h: tracksH };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onSplitMove = (e: PointerEvent) => {
    if (!drag.current) return;
    setTracksH(Math.round(Math.min(window.innerHeight - 220, Math.max(150, drag.current.h - (e.clientY - drag.current.y)))));
  };

  return (
    <div className="app">
      <TopBar
        view={view}
        onView={setView}
        source={source}
        onSource={setSource}
        live={live}
        replayLabel={replay.spec?.label ?? null}
        hasToken={hasToken}
        videoOpen={videoOpen}
        onVideo={() => setVideoOpen((v) => !v)}
        onSettings={() => setSettingsOpen(true)}
      />

      {view === 'monitor' ? (
        <div className="monitor">
          <div className="stage" style={{ ['--tracks-h' as string]: `${tracksH}px` }}>
            <Suspense fallback={<div className="viewport loading">载入三维场景…</div>}>
              <TwinViewport focus={focus} onFocus={setFocus} source={source} range={range} settings={settings} />
            </Suspense>
            <div className="splitter" onPointerDown={onSplitDown} onPointerMove={onSplitMove} onPointerUp={() => (drag.current = null)} role="separator" aria-orientation="horizontal" />
            <div className="tracks-panel">
              <div className="tracks-toolbar">
                <Segmented
                  size="sm"
                  title="信号"
                  options={[
                    { value: 'acc', label: '加速度' },
                    { value: 'gyro', label: '角速度' },
                    { value: 'mag', label: '|a|' },
                  ]}
                  value={signal}
                  onChange={setSignal}
                />
                <Segmented size="sm" title="时间窗" options={WINDOWS.map((w) => ({ value: w, label: `${w / 1000} s` }))} value={windowMs} onChange={setWindowMs} />
                <Segmented
                  size="sm"
                  title="纵轴"
                  options={[
                    { value: 'auto', label: '自适应' },
                    { value: 'ac', label: '去直流', title: '减去窗口内各轴均值（重力 / 安装倾角），突出振动分量' },
                    { value: 'full', label: '满量程' },
                  ]}
                  value={scale}
                  onChange={setScale}
                />
                <Segmented
                  size="sm"
                  title="横轴"
                  options={[
                    { value: 'time', label: '时间', title: '按 utc_ns 绘制；read_return 批次会呈竖条' },
                    { value: 'index', label: '序号', title: '窗口内样本等距排列，便于观察 read_return 批量时间戳的数据' },
                  ]}
                  value={xMode}
                  onChange={setXMode}
                />
                <span className="toolbar-sep" />
                <span className="toolbar-label">量程</span>
                <Segmented
                  size="sm"
                  title="加速度量程"
                  options={([2, 4, 8, 16] as AccRangeG[]).map((g) => ({ value: g, label: `${g} g` }))}
                  value={settings.accRangeG}
                  onChange={(g) => updateSettings({ ...settings, accRangeG: g })}
                />
                <Segmented
                  size="sm"
                  title="角速度量程"
                  options={([250, 500, 1000, 2000] as GyroRangeDps[]).map((d) => ({ value: d, label: `${d}` }))}
                  value={settings.gyroRangeDps}
                  onChange={(d) => updateSettings({ ...settings, gyroRangeDps: d })}
                />
                <span className="toolbar-label">°/s</span>
                <span className="toolbar-note">
                  {source === 'live'
                    ? '实时模式仅为 1 Hz latest 预览，非全采样率；完整波形请用回放'
                    : source === 'sim'
                      ? '仿真信号，经同一协议解析链路'
                      : '量程须与采集时 IMU 配置一致，切换即按原始整数重新换算'}
                </span>
              </div>
              <WaveformTracks focus={focus} onFocus={setFocus} signal={signal} windowMs={windowMs} scale={scale} xMode={xMode} range={range} source={source} quality={source === 'replay' ? null : quality} />
            </div>
            {source === 'replay' && <Transport replay={replay} />}
          </div>

          <aside className="inspector">
            {source === 'replay' ? (
              <ReplayPanel replay={replay} />
            ) : (
              <>
                {source === 'live' && !hasToken && (
                  <Section index="00" title="尚未连接">
                    <p className="empty">实时模式需要读取 token。没有后端时可切换到「仿真」。</p>
                    <div className="row">
                      <button type="button" className="primary" onClick={() => setSettingsOpen(true)}>
                        配置连接
                      </button>
                      <button type="button" onClick={() => setSource('sim')}>
                        使用仿真
                      </button>
                    </div>
                  </Section>
                )}
                <GatewayPanel source={source} live={live} snapshot={snapshot} gateways={gatewayIds} gatewayId={source === 'sim' ? sim?.gateway_id ?? null : gatewayId} onGateway={setGatewayId} />
                <HostPanel snapshot={snapshot} rebootAt={rebootAt} simulated={source === 'sim'} />
                <ChannelsPanel snapshot={snapshot} quality={quality} focus={focus} onFocus={setFocus} staleAfterS={settings.staleAfterS} />
              </>
            )}
            <FocusPanel channel={focus} source={source} range={range} windowMs={windowMs} settings={settings} snapshot={snapshot} index={source === 'replay' ? '02' : '04'} />
          </aside>
        </div>
      ) : (
        <Suspense fallback={<div className="loading-full">载入数据工作台…</div>}>
          <HistoryWorkspace cfg={cfg} range={range} knownGateways={live.gateways.map((g) => g.gateway_id)} onReplay={startReplay} />
        </Suspense>
      )}

      {videoOpen && (
        <VideoPanel
          url={settings.videoUrl}
          onClose={() => setVideoOpen(false)}
          onConfigure={() => {
            setSettingsOpen(true);
          }}
        />
      )}
      {settingsOpen && <SettingsSheet settings={settings} onSave={updateSettings} onClose={() => setSettingsOpen(false)} />}
    </div>
  );
}
