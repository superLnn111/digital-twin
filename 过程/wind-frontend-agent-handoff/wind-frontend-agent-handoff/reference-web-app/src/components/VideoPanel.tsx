import { useRef, useState, type PointerEvent } from 'react';

type Kind = 'video' | 'mjpeg' | 'hls-native' | 'unsupported';

function detect(url: string): Kind {
  const u = url.toLowerCase().split('?')[0];
  if (/\.(mjpe?g|cgi)$/.test(u) || u.includes('mjpeg') || u.includes('/stream')) return 'mjpeg';
  if (u.endsWith('.m3u8')) {
    const v = document.createElement('video');
    return v.canPlayType('application/vnd.apple.mpegurl') ? 'hls-native' : 'unsupported';
  }
  return 'video';
}

/** Floating, draggable preview. Mounted only while open, so no request is made otherwise. */
export function VideoPanel({ url, onClose, onConfigure }: { url: string; onClose: () => void; onConfigure: () => void }) {
  const [pos, setPos] = useState({ x: 24, y: 72 });
  const [error, setError] = useState<string | null>(null);
  const drag = useRef<{ dx: number; dy: number } | null>(null);
  const kind = url ? detect(url) : null;

  const onDown = (e: PointerEvent) => {
    drag.current = { dx: e.clientX - pos.x, dy: e.clientY - pos.y };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onMove = (e: PointerEvent) => {
    if (!drag.current) return;
    setPos({ x: Math.max(0, e.clientX - drag.current.dx), y: Math.max(44, e.clientY - drag.current.dy) });
  };

  return (
    <div className="video-panel" style={{ left: pos.x, top: pos.y }}>
      <header onPointerDown={onDown} onPointerMove={onMove} onPointerUp={() => (drag.current = null)}>
        <span>固定机位</span>
        <span className="dim mono small">{kind ?? '未配置'}</span>
        <button type="button" className="ghost sm" onClick={onClose} aria-label="关闭预览">
          ✕
        </button>
      </header>
      <div className="video-body">
        {!url && (
          <div className="video-empty">
            <p>尚未配置视频流地址</p>
            <button type="button" className="sm" onClick={onConfigure}>
              去设置
            </button>
          </div>
        )}
        {kind === 'mjpeg' && <img src={url} alt="固定机位 MJPEG 预览" onError={() => setError('MJPEG 流加载失败')} />}
        {(kind === 'video' || kind === 'hls-native') && <video src={url} autoPlay muted playsInline controls onError={() => setError('视频流加载失败或格式不受浏览器支持')} />}
        {kind === 'unsupported' && <div className="video-empty">此浏览器不原生支持 HLS（.m3u8），本页面不内置 hls.js。</div>}
        {error && <div className="video-error">{error}</div>}
      </div>
    </div>
  );
}
