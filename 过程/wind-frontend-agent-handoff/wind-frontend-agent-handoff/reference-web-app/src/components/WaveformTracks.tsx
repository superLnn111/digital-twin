import { useEffect, useRef } from 'react';
import { CHANNELS, CHANNEL_LABEL, type ChannelId } from '../api/types';
import { telemetry, accScaleG, gyroScaleDps, type SourceKind } from '../telemetry/store';
import type { SensorRangeConfig } from '../protocol/imu';
import { niceCeil } from '../lib/stats';
import { formatClock } from '../lib/ns';
import { QUALITY_KEYS, QUALITY_LABELS } from '../lib/quality';
import { useTelemetryVersion, type ChannelQualityView } from '../app/hooks';

export type SignalKind = 'acc' | 'gyro' | 'mag';
export type ScaleMode = 'auto' | 'ac' | 'full';
/** 'index' spaces samples evenly — read_return timestamps arrive in batches. */
export type XMode = 'time' | 'index';

interface Props {
  focus: ChannelId;
  onFocus: (c: ChannelId) => void;
  signal: SignalKind;
  windowMs: number;
  scale: ScaleMode;
  xMode: XMode;
  range: SensorRangeConfig;
  source: SourceKind;
  quality: Record<ChannelId, ChannelQualityView | null> | null;
}

const AXIS_COLORS = ['#dfe4e8', '#7fa9c8', '#a9bb8e'];
const MAG_COLOR = '#c9d3da';
const RIGHT_GUTTER = 52;
const BOTTOM_AXIS = 22;
const FOCUS_WEIGHT = 2.6;

function niceStep(spanMs: number, targetTicks: number): number {
  const raw = spanMs / targetTicks;
  const steps = [50, 100, 200, 250, 500, 1000, 2000, 5000, 10000, 15000, 30000, 60000];
  return steps.find((s) => s >= raw) ?? 60000;
}

export function WaveformTracks(props: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const labelRefs = useRef<(HTMLDivElement | null)[]>([]);
  const propsRef = useRef(props);
  propsRef.current = props;
  const dirtyRef = useRef(true);

  useEffect(() => {
    dirtyRef.current = true;
  }, [props.focus, props.signal, props.windowMs, props.scale, props.xMode, props.range, props.source]);

  useEffect(() => {
    const wrap = wrapRef.current!;
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext('2d')!;
    let w = 0;
    let h = 0;
    let dpr = 1;
    const ro = new ResizeObserver(() => {
      const r = wrap.getBoundingClientRect();
      dpr = Math.min(2, window.devicePixelRatio || 1);
      w = Math.max(1, Math.floor(r.width));
      h = Math.max(1, Math.floor(r.height));
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      dirtyRef.current = true;
    });
    ro.observe(wrap);

    // animated state
    const weights = CHANNELS.map((c) => (c === propsRef.current.focus ? FOCUS_WEIGHT : 1));
    const yMax = CHANNELS.map(() => 1);
    const yMin = CHANNELS.map(() => -1);
    let lastVersion = -1;
    let lastT = performance.now();
    let raf = 0;

    const frame = (t: number) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(64, t - lastT);
      lastT = t;
      if (document.hidden || w < 2) return;
      const p = propsRef.current;
      let animating = false;
      // critically-damped-ish approach for layout weights
      const k = 1 - Math.exp(-dt / 90);
      CHANNELS.forEach((c, i) => {
        const target = c === p.focus ? FOCUS_WEIGHT : 1;
        const d = target - weights[i];
        if (Math.abs(d) > 0.002) {
          weights[i] += d * k;
          animating = true;
        } else weights[i] = target;
      });

      const version = telemetry.version;
      if (!animating && !dirtyRef.current && version === lastVersion) return;
      lastVersion = version;
      dirtyRef.current = false;

      const totalW = weights.reduce((a, b) => a + b, 0);
      const plotH = h - BOTTOM_AXIS;
      const plotW = w - RIGHT_GUTTER;
      const head = telemetry.headMs;
      const t0 = head - p.windowMs;
      const xOf = (tm: number) => ((tm - t0) / p.windowMs) * plotW;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      // vertical time grid (shared)
      const byIndex = p.xMode === 'index';
      const step = niceStep(p.windowMs, Math.max(3, Math.floor(plotW / 110)));
      const firstTick = byIndex ? Infinity : Math.ceil(t0 / step) * step;
      ctx.lineWidth = 1;
      ctx.strokeStyle = 'rgba(255,255,255,0.045)';
      ctx.beginPath();
      for (let tm = firstTick; tm <= head; tm += step) {
        const x = Math.round(xOf(tm)) + 0.5;
        ctx.moveTo(x, 0);
        ctx.lineTo(x, plotH);
      }
      ctx.stroke();

      // time axis labels: relative to the head, plus absolute head clock
      ctx.font = '10px "JetBrains Mono", "IBM Plex Mono", "SF Mono", ui-monospace, monospace';
      ctx.fillStyle = '#6b757d';
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'center';
      for (let tm = firstTick; tm <= head; tm += step) {
        const rel = (tm - head) / 1000;
        const x = xOf(tm);
        if (x < 24 || x > plotW - 64) continue;
        ctx.fillText(`${rel.toFixed(step < 1000 ? 1 : 0)} s`, x, plotH + BOTTOM_AXIS / 2);
      }
      if (byIndex) {
        ctx.textAlign = 'left';
        ctx.fillText(`横轴：样本序号（窗口 ${(p.windowMs / 1000).toFixed(0)} s 内样本等距排列，非等时间间隔）`, 8, plotH + BOTTOM_AXIS / 2);
      }
      const headNs = telemetry.epochPlusMs(head);
      ctx.textAlign = 'right';
      ctx.fillStyle = '#a3adb5';
      ctx.fillText(headNs !== null && telemetry.epochNs !== null ? formatClock(headNs, 3) : '—', w - 6, plotH + BOTTOM_AXIS / 2);

      let y = 0;
      const ka = accScaleG(p.range);
      const kg = gyroScaleDps(p.range);
      const gapMs = p.source === 'live' ? 3000 : 250;

      CHANNELS.forEach((c, ci) => {
        const th = (weights[ci] / totalW) * plotH;
        const top = y;
        y += th;
        const label = labelRefs.current[ci];
        if (label) {
          label.style.transform = `translate3d(0, ${top}px, 0)`;
          label.style.height = `${th}px`;
        }
        // separator
        ctx.strokeStyle = 'rgba(255,255,255,0.07)';
        ctx.beginPath();
        ctx.moveTo(0, Math.round(top + th) - 0.5);
        ctx.lineTo(w, Math.round(top + th) - 0.5);
        ctx.stroke();
        if (c === p.focus) {
          ctx.fillStyle = 'rgba(157,184,204,0.035)';
          ctx.fillRect(0, top, plotW, th);
        }

        const ring = telemetry.tracks[c].ring;
        const from = Math.max(0, ring.lowerBound(t0) - 1);
        const to = ring.lowerBound(head + 1e-6);
        const n = to - from;

        // value extraction
        const axes = p.signal === 'mag' ? 1 : 3;
        const rawVal = (i: number, a: number): number => {
          if (p.signal === 'acc') return ring.rawAt(i, a) * ka;
          if (p.signal === 'gyro') return ring.rawAt(i, 3 + a) * kg;
          return Math.hypot(ring.rawAt(i, 0), ring.rawAt(i, 1), ring.rawAt(i, 2)) * ka;
        };
        // 'ac' mode: subtract the per-axis mean of the visible window (DC / gravity)
        const mean = [0, 0, 0];
        if (p.scale === 'ac' && n > 0) {
          for (let i = from; i < to; i++) for (let a = 0; a < axes; a++) mean[a] += rawVal(i, a);
          for (let a = 0; a < axes; a++) mean[a] /= n;
        }
        const val = (i: number, a: number): number => rawVal(i, a) - mean[a];

        // target y-range
        let tMax: number;
        let tMin: number;
        if (p.scale === 'full') {
          const full = p.signal === 'gyro' ? p.range.gyroRangeDps : p.range.accRangeG;
          tMax = full;
          tMin = p.signal === 'mag' ? 0 : -full;
        } else if (n > 0) {
          let lo = Infinity;
          let hi = -Infinity;
          for (let i = from; i < to; i++)
            for (let a = 0; a < axes; a++) {
              const v = val(i, a);
              if (v < lo) lo = v;
              if (v > hi) hi = v;
            }
          if (p.signal === 'mag' && p.scale !== 'ac') {
            const pad = Math.max(0.02, (hi - lo) * 0.15);
            tMin = lo - pad;
            tMax = hi + pad;
          } else {
            const m = niceCeil(Math.max(Math.abs(lo), Math.abs(hi)) * 1.1 || 0.01);
            tMax = m;
            tMin = -m;
          }
        } else {
          tMax = yMax[ci];
          tMin = yMin[ci];
        }
        const ky = 1 - Math.exp(-dt / 140);
        if (Math.abs(tMax - yMax[ci]) > Math.abs(tMax) * 0.002 || Math.abs(tMin - yMin[ci]) > Math.abs(tMax) * 0.002) {
          yMax[ci] += (tMax - yMax[ci]) * ky;
          yMin[ci] += (tMin - yMin[ci]) * ky;
          animating = true;
        } else {
          yMax[ci] = tMax;
          yMin[ci] = tMin;
        }
        const padTop = 18;
        const padBot = 6;
        const ih = Math.max(4, th - padTop - padBot);
        const yOf = (v: number) => top + padTop + (1 - (v - yMin[ci]) / (yMax[ci] - yMin[ci] || 1)) * ih;

        if (th > 30) {
          // horizontal reference lines + y labels
          ctx.strokeStyle = 'rgba(255,255,255,0.05)';
          ctx.setLineDash([2, 3]);
          ctx.beginPath();
          const refs = p.signal === 'mag' && p.scale !== 'ac' ? [yMax[ci], (yMin[ci] + yMax[ci]) / 2, yMin[ci]] : [yMax[ci], 0, yMin[ci]];
          for (const v of refs) {
            const yy = Math.round(yOf(v)) + 0.5;
            ctx.moveTo(0, yy);
            ctx.lineTo(plotW, yy);
          }
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.fillStyle = '#6b757d';
          ctx.textAlign = 'left';
          const unit = p.signal === 'gyro' ? '°/s' : 'g';
          for (const v of refs) {
            const digits = Math.abs(yMax[ci]) < 0.1 ? 3 : Math.abs(yMax[ci]) < 10 ? 2 : 0;
            ctx.fillText(`${v >= 0 ? ' ' : ''}${v.toFixed(digits)}${v === refs[0] ? ` ${unit}` : ''}`, plotW + 6, Math.min(top + th - 6, Math.max(top + 8, yOf(v))));
          }
        }

        if (n <= 0) {
          ctx.fillStyle = '#4f585f';
          ctx.textAlign = 'center';
          ctx.fillText(ring.size === 0 ? '无六轴样本' : '窗口内无样本', plotW / 2, top + th / 2 + 4);
          return;
        }

        // draw: min/max decimation per pixel column, gaps break the line
        const density = n / plotW;
        const xAt = byIndex ? (i: number) => ((i - from) / Math.max(1, n - 1)) * plotW : (i: number) => xOf(ring.timeAt(i));
        const gap = byIndex ? Infinity : gapMs;
        ctx.lineWidth = c === p.focus ? 1.35 : 1.1;
        ctx.lineJoin = 'round';
        for (let a = 0; a < axes; a++) {
          ctx.strokeStyle = p.signal === 'mag' ? MAG_COLOR : AXIS_COLORS[a];
          ctx.globalAlpha = c === p.focus ? 0.95 : 0.78;
          ctx.beginPath();
          let prevT = -Infinity;
          if (density > 2) {
            let col = -1;
            let cmin = 0;
            let cmax = 0;
            let started = false;
            const flush = () => {
              if (col < 0) return;
              const x = col + 0.5;
              if (!started) {
                ctx.moveTo(x, yOf(cmax));
                started = true;
              } else ctx.lineTo(x, yOf(cmax));
              ctx.lineTo(x, yOf(cmin));
            };
            for (let i = from; i < to; i++) {
              const tm = ring.timeAt(i);
              const v = val(i, a);
              const cx = Math.floor(xAt(i));
              if (tm - prevT > gap) {
                flush();
                col = -1;
                started = false;
              }
              prevT = tm;
              if (cx !== col) {
                flush();
                col = cx;
                cmin = cmax = v;
              } else {
                if (v < cmin) cmin = v;
                if (v > cmax) cmax = v;
              }
            }
            flush();
          } else {
            for (let i = from; i < to; i++) {
              const tm = ring.timeAt(i);
              const x = xAt(i);
              const yy = yOf(val(i, a));
              if (tm - prevT > gap) ctx.moveTo(x, yy);
              else ctx.lineTo(x, yy);
              prevT = tm;
            }
          }
          ctx.stroke();
          if (density < 1 / 6) {
            ctx.fillStyle = ctx.strokeStyle;
            for (let i = from; i < to; i++) {
              ctx.beginPath();
              ctx.arc(xAt(i), yOf(val(i, a)), 1.8, 0, Math.PI * 2);
              ctx.fill();
            }
          }
          ctx.globalAlpha = 1;
        }
      });

      // play-head edge
      ctx.strokeStyle = 'rgba(255,255,255,0.18)';
      ctx.beginPath();
      ctx.moveTo(plotW + 0.5, 0);
      ctx.lineTo(plotW + 0.5, plotH);
      ctx.stroke();

      if (animating) dirtyRef.current = true;
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);

  useTelemetryVersion();
  const { quality, focus, onFocus, signal, range } = props;
  return (
    <div className="tracks" ref={wrapRef}>
      <canvas ref={canvasRef} />
      {CHANNELS.map((c, i) => {
        const q = quality?.[c] ?? null;
        const flash = q?.increasedAt != null && Date.now() - q.increasedAt < 8000;
        const tr = telemetry.tracks[c];
        return (
          <div
            key={c}
            ref={(el) => {
              labelRefs.current[i] = el;
            }}
            className={`track-label ${focus === c ? 'focus' : ''}`}
            onClick={() => onFocus(c)}
          >
            <div className="track-title">
              <b>{CHANNEL_LABEL[c]}</b>
              <span>{c}</span>
              {focus === c && (
                <span className="track-axes">
                  {signal === 'mag' ? (
                    <i style={{ color: MAG_COLOR }}>|a|</i>
                  ) : (
                    ['X', 'Y', 'Z'].map((a, k) => (
                      <i key={a} style={{ color: AXIS_COLORS[k] }}>
                        {signal === 'acc' ? 'a' : 'ω'}
                        {a.toLowerCase()}
                      </i>
                    ))
                  )}
                  <em>
                    ±{signal === 'gyro' ? `${range.gyroRangeDps} °/s` : `${range.accRangeG} g`}
                  </em>
                </span>
              )}
              {tr.regressions > 0 && <span className="chip warn">时间回拨 ×{tr.regressions}</span>}
              {tr.invalid > 0 && <span className="chip alarm">无效帧 {tr.invalid}</span>}
              {q &&
                QUALITY_KEYS.filter((k) => (q.counters[k] ?? 0) > 0).map((k) => (
                  <span key={k} className={`chip ${flash && (q.last?.delta[k] ?? 0) > 0 ? 'alarm' : 'warn'}`}>
                    {QUALITY_LABELS[k]} {q.counters[k]}
                  </span>
                ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
