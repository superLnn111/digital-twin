import { useState } from 'react';
import type { Settings } from '../app/settings';
import { api } from '../api/client';

export function SettingsSheet({ settings, onSave, onClose }: { settings: Settings; onSave: (s: Settings) => void; onClose: () => void }) {
  const [draft, setDraft] = useState(settings);
  const [probe, setProbe] = useState<string | null>(null);
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => setDraft((d) => ({ ...d, [k]: v }));

  const test = async () => {
    setProbe('检测中…');
    try {
      const r = await api.health({ base: draft.apiBase, token: draft.token });
      setProbe(r.ok ? '✓ /health 返回 ok（仅代表 API 进程可响应）' : '响应异常');
    } catch (e) {
      setProbe(`✗ ${(e as Error).message}`);
    }
  };

  return (
    <div className="sheet-backdrop" onMouseDown={onClose}>
      <div className="sheet" role="dialog" aria-label="连接与设置" onMouseDown={(e) => e.stopPropagation()}>
        <header>
          <h2>连接与设置</h2>
          <button type="button" className="ghost" onClick={onClose} aria-label="关闭">
            ✕
          </button>
        </header>
        <div className="sheet-body">
          <fieldset>
            <legend>云端 API</legend>
            <label className="field">
              <span>API 根路径</span>
              <input value={draft.apiBase} onChange={(e) => set('apiBase', e.target.value.replace(/\/$/, ''))} placeholder="/wind-v2" />
            </label>
            <label className="field">
              <span>读取 token</span>
              <input type="password" autoComplete="off" value={draft.token} onChange={(e) => set('token', e.target.value)} />
            </label>
            <label className="check">
              <input type="checkbox" checked={draft.rememberToken} onChange={(e) => set('rememberToken', e.target.checked)} />
              在本机浏览器中记住 token（否则仅保留到关闭标签页）
            </label>
            <p className="footnote">HTTP 使用 Authorization: Bearer；WebSocket 连接后以首条消息发送 token，不写入 URL。</p>
            <div className="row">
              <button type="button" onClick={test}>
                检测连接
              </button>
              {probe && <span className="mono small">{probe}</span>}
            </div>
          </fieldset>
          <fieldset>
            <legend>告警阈值（经验值，可按风机标定调整）</legend>
            <div className="row">
              <label className="field">
                <span>振动关注 g</span>
                <input type="number" step="0.01" min="0" value={draft.vibWarnG} onChange={(e) => set('vibWarnG', Number(e.target.value))} />
              </label>
              <label className="field">
                <span>振动超限 g</span>
                <input type="number" step="0.01" min="0" value={draft.vibAlarmG} onChange={(e) => set('vibAlarmG', Number(e.target.value))} />
              </label>
              <label className="field">
                <span>数据陈旧 s</span>
                <input type="number" step="1" min="2" value={draft.staleAfterS} onChange={(e) => set('staleAfterS', Number(e.target.value))} />
              </label>
            </div>
          </fieldset>
          <fieldset>
            <legend>固定机位视频</legend>
            <label className="field">
              <span>流地址（MP4 / WebM / MJPEG / 浏览器原生支持的 HLS）</span>
              <input value={draft.videoUrl} onChange={(e) => set('videoUrl', e.target.value)} placeholder="https://…/camera.mjpg" />
            </label>
            <p className="footnote">仅在打开预览窗时才发起请求。</p>
          </fieldset>
        </div>
        <footer>
          <button type="button" className="ghost" onClick={onClose}>
            取消
          </button>
          <button
            type="button"
            className="primary"
            onClick={() => {
              onSave(draft);
              onClose();
            }}
          >
            保存
          </button>
        </footer>
      </div>
    </div>
  );
}
