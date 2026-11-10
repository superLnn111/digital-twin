import { CHANNELS, CHANNEL_LABEL, type ChannelId, type GatewaySnapshot } from '../api/types';
import { ageMs, formatAge, formatClock, nowNs, toNs } from '../lib/ns';
import { QUALITY_KEYS, QUALITY_LABELS } from '../lib/quality';
import { useTelemetryVersion, type ChannelQualityView, type LiveState } from '../app/hooks';
import { telemetry, channelWindowMetrics, type SourceKind } from '../telemetry/store';
import type { SensorRangeConfig } from '../protocol/imu';
import type { Settings } from '../app/settings';
import { Readout, Section, Tag, fmt, fmtBytes, fmtInt } from './ui';
import { FrameBytes, describePayload } from './FrameBytes';

/* ───────────────────────── 01 gateway link ───────────────────────── */

export function GatewayPanel({
  source,
  live,
  snapshot,
  gateways,
  gatewayId,
  onGateway,
}: {
  source: SourceKind;
  live: LiveState;
  snapshot: GatewaySnapshot | null;
  gateways: string[];
  gatewayId: string | null;
  onGateway: (id: string) => void;
}) {
  const received = snapshot?.received_utc_ns ?? null;
  return (
    <Section
      index="01"
      title="云端链路"
      aside={
        source === 'sim' ? (
          <Tag level="sim">仿真网关</Tag>
        ) : (
          <Tag level={live.link === 'open' ? 'neutral' : live.link === 'auth-failed' ? 'alarm' : 'warn'}>
            {live.link === 'open' ? '/api/live 已连接' : live.link === 'auth-failed' ? '认证失败' : live.link === 'off' ? '未连接' : '连接中'}
          </Tag>
        )
      }
    >
      {live.detail && source === 'live' && <p className={`notice ${live.link === 'auth-failed' ? 'lv-alarm' : 'lv-warn'}`}>{live.detail}</p>}
      <div className="gateway-row">
        <label className="field compact">
          <span>网关</span>
          <select value={gatewayId ?? ''} onChange={(e) => onGateway(e.target.value)} disabled={gateways.length <= 1}>
            {gateways.length === 0 && <option value="">—</option>}
            {gateways.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        </label>
        <div className={`online-pill ${snapshot?.online ? 'on' : 'off'}`}>
          <span className="dot" />
          {snapshot ? (snapshot.online ? '上报中' : '上报中断') : '—'}
        </div>
      </div>
      <div className="kv">
        <span>云端最后接收</span>
        <span className="mono">{received ? `${formatClock(toNs(received), 0)} · ${formatAge(ageMs(received))}` : '自云端启动以来未收到'}</span>
      </div>
      <p className="footnote">“上报中”只表示云端 5 s 内收到 upload 状态，不代表采集线程、传感器或数据质量正常——请看下方各通道。</p>
    </Section>
  );
}

/* ───────────────────────── 03 channels ───────────────────────── */

export function ChannelsPanel({
  snapshot,
  quality,
  focus,
  onFocus,
  staleAfterS,
}: {
  snapshot: GatewaySnapshot | null;
  quality: Record<ChannelId, ChannelQualityView | null>;
  focus: ChannelId;
  onFocus: (c: ChannelId) => void;
  staleAfterS: number;
}) {
  const now = nowNs();
  const refNs = toNs(snapshot?.received_utc_ns) ?? now;
  return (
    <Section index="03" title="采集通道">
      <div className="chan-table" role="table">
        <div className="chan-row head" role="row">
          <span>通道</span>
          <span>采集线程</span>
          <span title="通道状态文件更新时间，相对云端接收时刻">状态更新</span>
          <span title="latest 帧的 utc_ns，相对云端接收时刻">最后帧</span>
          <span>帧数</span>
        </div>
        {CHANNELS.map((c) => {
          const ch = snapshot?.status?.channels?.[c] ?? null;
          const q = quality[c];
          const upd = ch ? ageMs(ch.updated_utc_ns ?? null, refNs) : null;
          const lastFrame = ch?.latest ? ageMs(ch.latest.utc_ns, refNs) : null;
          const stale = lastFrame !== null && lastFrame > staleAfterS * 1000;
          const flash = q?.increasedAt != null && Date.now() - q.increasedAt < 8000;
          return (
            <button
              key={c}
              type="button"
              role="row"
              className={`chan-row ${focus === c ? 'focus' : ''} ${flash ? 'flash' : ''}`}
              onClick={() => onFocus(c)}
            >
              <span className="chan-id">
                <b>{CHANNEL_LABEL[c]}</b>
                <span className="dim">{c}</span>
              </span>
              {ch === null ? (
                <span className="dim span4">状态未上报此通道</span>
              ) : (
                <>
                  <span className={ch.running === true ? '' : ch.running === false ? 'lv-alarm' : 'dim'}>
                    {ch.running === true ? '运行' : ch.running === false ? '停止' : '未知'}
                  </span>
                  <span className="mono">{upd === null ? '未知' : formatAge(upd)}</span>
                  <span className={`mono ${stale ? 'lv-warn' : ''}`}>{ch.latest ? formatAge(lastFrame) : <span className="dim">无</span>}</span>
                  <span className="mono num">{fmtInt(ch.frames ?? null) ?? '—'}</span>
                </>
              )}
              {q && (
                <span className="chan-quality">
                  {QUALITY_KEYS.map((k) => {
                    const v = q.counters[k];
                    const d = q.last?.delta[k] ?? null;
                    return (
                      <span key={k} className={`qc ${v === null ? 'unknown' : v > 0 ? 'nz' : ''} ${d !== null && d > 0 ? 'up' : ''}`} title={QUALITY_LABELS[k]}>
                        <i>{QUALITY_LABELS[k]}</i>
                        <span className="mono">{v === null ? '未知' : fmtInt(v)}</span>
                        {d !== null && d > 0 && <em className="mono">+{fmtInt(d)}</em>}
                      </span>
                    );
                  })}
                  {q.resetAt !== null && Date.now() - q.resetAt < 60_000 && <span className="qc reset">计数归零：采集器重启，已重新建立基线</span>}
                </span>
              )}
            </button>
          );
        })}
      </div>
      <p className="footnote">质量计数为采集进程累计值，统计被拒绝的候选帧与字节，不等于设备丢样数，不据此推算完整率。</p>
    </Section>
  );
}

/* ───────────────────────── 04 focused channel ───────────────────────── */

export function FocusPanel({
  channel,
  source,
  range,
  windowMs,
  settings,
  snapshot,
  index = '04',
}: {
  channel: ChannelId;
  source: SourceKind;
  range: SensorRangeConfig;
  windowMs: number;
  settings: Settings;
  snapshot: GatewaySnapshot | null;
  index?: string;
}) {
  useTelemetryVersion();
  const track = telemetry.tracks[channel];
  const m = channelWindowMetrics(track, range, telemetry.headMs, windowMs);
  const att = track.attitude();
  const parsed = track.lastParsed;
  const vib = m?.vibRms ?? null;
  const vibLevel = vib === null ? 'unknown' : vib >= settings.vibAlarmG ? 'alarm' : vib >= settings.vibWarnG ? 'warn' : 'ok';
  const ch = snapshot?.status?.channels?.[channel];
  const mix = [...track.byMessage.entries()].sort((a, b) => a[0] - b[0]);

  return (
    <Section
      index={index}
      title={`${CHANNEL_LABEL[channel]} · ${channel}`}
      aside={source === 'live' ? <Tag title="后端 /api/live 只推送每秒一次的 latest 预览帧">1 Hz 预览</Tag> : source === 'sim' ? <Tag level="sim">仿真</Tag> : <Tag level="accent">历史回放</Tag>}
    >
      <div className="attitude">
        <AttitudeDial euler={att?.euler ?? null} />
        <div className="readout-grid three">
          <Readout label="Roll" value={fmt(att?.euler?.roll, 2)} unit="°" unknown="无姿态帧" />
          <Readout label="Pitch" value={fmt(att?.euler?.pitch, 2)} unit="°" unknown="无姿态帧" />
          <Readout label="Yaw" value={fmt(att?.euler?.yaw, 2)} unit="°" unknown="无姿态帧" />
        </div>
      </div>
      <div className="kv small">
        <span>姿态来源</span>
        <span>{att ? (att.source === 'quaternion' ? '0x02 四元数' : '0x01 倾角') : '尚无 0x01 / 0x02 帧'}</span>
      </div>

      <div className="subhead">
        时域指标 <span className="dim">· 窗口 {(windowMs / 1000).toFixed(0)} s · {m ? `${m.n} 样本` : '样本不足'}</span>
      </div>
      <div className="readout-grid">
        <Readout label="振动 三轴交流 RMS" value={fmt(vib, 3)} unit="g" level={vibLevel} unknown={source === 'live' ? '预览样本不足' : '无六轴帧'} hint={`阈值 ${settings.vibWarnG} / ${settings.vibAlarmG} g（经验值）`} />
        <Readout label="|a| 峰峰值" value={fmt(m?.accMag.p2p, 3)} unit="g" unknown="—" />
        <Readout
          label="叶轮转速"
          value={source === 'sim' ? fmt(track.rpm, 0) : null}
          unit="rpm"
          unknown="未提供"
          hint={source === 'sim' ? '仿真值' : '协议无转速字段'}
        />
      </div>
      {m && (
        <table className="axis-table mono">
          <thead>
            <tr>
              <th />
              <th>X</th>
              <th>Y</th>
              <th>Z</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>加速度 RMS · g</td>
              {m.acc.map((s, i) => (
                <td key={i}>{s.rms.toFixed(3)}</td>
              ))}
            </tr>
            <tr>
              <td>加速度 峰值 · g</td>
              {m.acc.map((s, i) => (
                <td key={i}>{s.peak.toFixed(3)}</td>
              ))}
            </tr>
            <tr>
              <td>角速度 RMS · °/s</td>
              {m.gyro.map((s, i) => (
                <td key={i}>{s.rms.toFixed(2)}</td>
              ))}
            </tr>
            <tr>
              <td>角速度 峰峰 · °/s</td>
              {m.gyro.map((s, i) => (
                <td key={i}>{s.p2p.toFixed(2)}</td>
              ))}
            </tr>
          </tbody>
        </table>
      )}

      <div className="subhead">
        最近一帧
        <span className="dim">
          {' '}
          · {track.lastNs !== null ? formatClock(track.lastNs, 6) : '—'} · 已解析 {fmtInt(track.total)}
          {track.invalid > 0 && <span className="lv-alarm"> · 无效 {track.invalid}</span>}
          {track.regressions > 0 && <span className="lv-warn"> · 时间回拨 {track.regressions}</span>}
        </span>
      </div>
      {parsed ? (
        <>
          <FrameBytes hex={parsed.rawHex} />
          <div className="decoded mono">{describePayload(parsed, range)}</div>
        </>
      ) : (
        <p className="empty small">尚未收到帧</p>
      )}
      {mix.length > 0 && (
        <div className="mix">
          {mix.map(([id, n]) => (
            <span key={id}>
              0x{id.toString(16).padStart(2, '0')} <b className="mono">{fmtInt(n)}</b>
            </span>
          ))}
        </div>
      )}
      {source !== 'replay' && ch && (
        <div className="kv small">
          <span>读入 / 队列 / 峰值</span>
          <span className="mono">
            {fmtBytes(ch.read_bytes ?? null) ?? '未知'} / {fmtBytes(ch.queue_bytes ?? null) ?? '未知'} / {fmtBytes(ch.queue_peak_bytes ?? null) ?? '未知'}
          </span>
        </div>
      )}
    </Section>
  );
}

/** Artificial-horizon style dial: pitch shifts the horizon, roll rotates it, yaw on the bezel. */
function AttitudeDial({ euler }: { euler: { roll: number; pitch: number; yaw: number } | null }) {
  const r = 34;
  if (!euler) {
    return (
      <svg className="dial" viewBox="-40 -40 80 80" aria-label="姿态未知">
        <circle r={r} className="dial-face unknown" />
        <text y="3" textAnchor="middle" className="dial-q">
          ?
        </text>
      </svg>
    );
  }
  const pitchPx = Math.max(-r, Math.min(r, (euler.pitch / 30) * r));
  return (
    <svg className="dial" viewBox="-40 -40 80 80" aria-label="姿态">
      <defs>
        <clipPath id="dial-clip">
          <circle r={r} />
        </clipPath>
      </defs>
      <g clipPath="url(#dial-clip)">
        <g transform={`rotate(${-euler.roll}) translate(0 ${pitchPx})`}>
          <rect x={-80} y={-80} width={160} height={80} className="dial-sky" />
          <rect x={-80} y={0} width={160} height={80} className="dial-ground" />
          <line x1={-80} x2={80} y1={0} y2={0} className="dial-horizon" />
          {[-20, -10, 10, 20].map((p) => (
            <line key={p} x1={-6} x2={6} y1={(-p / 30) * r} y2={(-p / 30) * r} className="dial-tick" />
          ))}
        </g>
      </g>
      <circle r={r} className="dial-face" />
      <path d="M -14 0 L -5 0 L 0 4 L 5 0 L 14 0" className="dial-ref" />
      <g transform={`rotate(${euler.yaw})`}>
        <path d="M 0 -39 L -2.6 -35 L 2.6 -35 Z" className="dial-yaw" />
      </g>
    </svg>
  );
}
