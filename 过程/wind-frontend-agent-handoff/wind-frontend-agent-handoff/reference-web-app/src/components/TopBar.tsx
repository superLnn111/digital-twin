import type { SourceKind } from '../telemetry/store';
import type { LiveState } from '../app/hooks';
import { Segmented } from './ui';

export type ViewKind = 'monitor' | 'data';

export function TopBar({
  view,
  onView,
  source,
  onSource,
  live,
  replayLabel,
  hasToken,
  videoOpen,
  onVideo,
  onSettings,
}: {
  view: ViewKind;
  onView: (v: ViewKind) => void;
  source: SourceKind;
  onSource: (s: SourceKind) => void;
  live: LiveState;
  replayLabel: string | null;
  hasToken: boolean;
  videoOpen: boolean;
  onVideo: () => void;
  onSettings: () => void;
}) {
  const link =
    source === 'sim'
      ? { cls: 'sim', text: '仿真信号 · 非实测数据' }
      : source === 'replay'
        ? { cls: 'replay', text: replayLabel ? `回放 · ${replayLabel}` : '回放 · 未加载' }
        : !hasToken
          ? { cls: 'warn', text: '未配置 token' }
          : live.link === 'open'
            ? { cls: 'ok', text: '实时 · 1 Hz 状态预览' }
            : live.link === 'auth-failed'
              ? { cls: 'alarm', text: '认证失败' }
              : { cls: 'warn', text: live.link === 'retrying' ? '重连中' : '连接中' };
  return (
    <header className="topbar">
      <div className="brand">
        <svg viewBox="0 0 24 24" aria-hidden className="brand-mark">
          <circle cx="12" cy="12" r="1.6" />
          <path d="M12 10.4 L13.1 2.6 Q12 2 10.9 2.6 Z" />
          <path d="M13.4 12.8 L20.7 15.8 Q20.6 17 19.6 17.6 Z" />
          <path d="M10.6 12.8 L4.4 17.6 Q3.4 17 3.3 15.8 Z" />
        </svg>
        <div>
          <b>WIND · TWIN</b>
          <span>微型风力机多模态状态监测</span>
        </div>
      </div>
      <nav className="views">
        <Segmented
          title="视图"
          options={[
            { value: 'monitor', label: '监测' },
            { value: 'data', label: '数据' },
          ]}
          value={view}
          onChange={onView}
        />
      </nav>
      <div className="source">
        <span className="source-label">数据源</span>
        <Segmented
          title="数据源"
          options={[
            { value: 'live', label: '实时', title: '/api/live 每秒一次状态与 latest 预览帧' },
            { value: 'replay', label: '回放', title: '/api/replay 持久段完整有效帧' },
            { value: 'sim', label: '仿真', title: '内置信号发生器，脱机演示' },
          ]}
          value={source}
          onChange={onSource}
        />
      </div>
      <div className={`link link-${link.cls}`}>
        <span className="dot" />
        {link.text}
      </div>
      <div className="topbar-actions">
        <button type="button" className={`ghost ${videoOpen ? 'on' : ''}`} onClick={onVideo} title="固定机位视频预览（按需加载）">
          视频
        </button>
        <button type="button" className="ghost" onClick={onSettings}>
          设置
        </button>
      </div>
    </header>
  );
}
