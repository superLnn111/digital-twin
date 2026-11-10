import { useRef, type MouseEvent } from 'react';
import { CHANNELS, CHANNEL_LABEL } from '../api/types';
import type { ReplayHandle } from '../app/hooks';
import { formatClock, formatDateTime, formatDuration, nsDiffMs } from '../lib/ns';
import type { StreamState } from '../replay/stream';
import { Section, Segmented, Tag, fmtInt } from './ui';

const SPEEDS = [0.25, 0.5, 1, 2, 4, 8, 16];

const PHASE_LABEL: Record<string, string> = {
  priming: '建立连接',
  playing: '播放',
  paused: '暂停',
  buffering: '缓冲中',
  break: '时间回拨',
  finished: '已完成',
};

export function Transport({ replay }: { replay: ReplayHandle }) {
  const barRef = useRef<HTMLDivElement>(null);
  const { player, spec } = replay;
  if (!player || !spec) {
    return (
      <div className="transport empty-transport">
        <span className="dim">未加载回放 · 在「数据」工作台选择批次或检索条件后点击「回放到孪生」</span>
      </div>
    );
  }
  const start = spec.extentStartNs ?? player.startNs;
  const end = spec.extentEndNs;
  const head = player.playheadNs;
  const total = start !== null && end !== null ? nsDiffMs(end, start) : null;
  const elapsed = start !== null && head !== null ? nsDiffMs(head, start) : null;
  const frac = total && elapsed !== null ? Math.min(1, Math.max(0, elapsed / total)) : 0;
  const playing = player.phase === 'playing' || player.phase === 'buffering';

  const onSeek = (e: MouseEvent) => {
    if (start === null || end === null || !barRef.current) return;
    const r = barRef.current.getBoundingClientRect();
    const f = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    const span = end - start;
    replay.seek(start + (span * BigInt(Math.round(f * 1e6))) / 1_000_000n);
  };

  return (
    <div className="transport">
      <button
        type="button"
        className="play"
        onClick={() => {
          if (playing) player.pause();
          else player.play();
          replay.bump();
        }}
        disabled={player.phase === 'finished' || player.phase === 'break' || player.phase === 'priming'}
        aria-label={playing ? '暂停' : '播放'}
      >
        {playing ? (
          <svg viewBox="0 0 12 12">
            <rect x="2.5" y="2" width="2.4" height="8" />
            <rect x="7.1" y="2" width="2.4" height="8" />
          </svg>
        ) : (
          <svg viewBox="0 0 12 12">
            <path d="M3 2 L10 6 L3 10 Z" />
          </svg>
        )}
      </button>
      <div className="transport-time mono">
        <b>{head !== null ? formatClock(head, 3) : '—'}</b>
        <span>
          {formatDuration(elapsed)} / {total !== null ? formatDuration(total) : '范围未知'}
        </span>
      </div>
      <div className="scrub" ref={barRef} onClick={onSeek} title={total !== null ? '点击定位（从该时刻重新发起回放查询）' : '无范围信息，无法定位'}>
        <div className="scrub-track" />
        <div className="scrub-fill" style={{ transform: `scaleX(${frac})` }} />
        <div className="scrub-head" style={{ left: `${frac * 100}%` }} />
      </div>
      <Segmented
        size="sm"
        title="倍速"
        options={SPEEDS.map((s) => ({ value: s, label: `${s}×` }))}
        value={player.speed}
        onChange={(v) => {
          player.speed = v;
          replay.bump();
        }}
      />
      <span className={`phase phase-${player.phase}`}>{PHASE_LABEL[player.phase]}</span>
      <button type="button" className="ghost" onClick={replay.stop}>
        结束
      </button>
      {player.phase === 'break' && player.brk && (
        <div className="break-banner">
          <span>
            {CHANNEL_LABEL[player.brk.channel]} 时间回拨 {formatDuration(nsDiffMs(player.brk.fromNs, player.brk.toNs))}（{formatClock(player.brk.fromNs, 3)} → {formatClock(player.brk.toNs, 3)}）。
            保留原记录顺序，未重排。
          </span>
          <button
            type="button"
            onClick={() => {
              player.continueAfterBreak();
              replay.bump();
            }}
          >
            继续（该通道从新时间段起绘）
          </button>
        </div>
      )}
    </div>
  );
}

const STREAM_LABEL: Record<StreamState, string> = {
  idle: '待启动',
  connecting: '连接中',
  streaming: '接收中',
  parked: '队列满·暂停',
  ended: '已完成',
  error: '失败',
  stopped: '已停止',
};

export function ReplayPanel({ replay }: { replay: ReplayHandle }) {
  const { player, spec } = replay;
  if (!player || !spec) {
    return (
      <Section index="01" title="历史回放">
        <p className="empty">尚未加载回放。回放使用 /api/replay 读取持久段中的完整有效帧，由前端按 utc_ns 控制节奏。</p>
      </Section>
    );
  }
  return (
    <Section index="01" title="历史回放" aside={<Tag level="accent">{PHASE_LABEL[player.phase]}</Tag>}>
      <div className="kv">
        <span>网关 / 批次</span>
        <span className="mono">
          {spec.gateway_id} / {spec.session_id ?? '全部'}
        </span>
      </div>
      <div className="kv">
        <span>范围</span>
        <span className="mono small">
          {spec.extentStartNs !== null ? formatDateTime(spec.extentStartNs) : '—'} → {spec.extentEndNs !== null ? formatClock(spec.extentEndNs, 0) : '—'}
        </span>
      </div>
      <div className="stream-table">
        <div className="stream-row head">
          <span>通道</span>
          <span>状态</span>
          <span>已收帧</span>
          <span title="其中空页：段扫描未命中，但游标非 null，必须继续">页 / 空页</span>
          <span>本地队列</span>
        </div>
        {CHANNELS.map((c) => {
          const s = player.streams[c];
          if (!s) return null;
          return (
            <div key={c} className={`stream-row st-${s.state}`}>
              <span>
                <b>{CHANNEL_LABEL[c]}</b>
              </span>
              <span>{STREAM_LABEL[s.state]}</span>
              <span className="mono num">{fmtInt(s.received)}</span>
              <span className="mono num">
                {s.pages} / {s.emptyPages}
              </span>
              <span className="mono num">{fmtInt(s.pending())}</span>
              {s.state === 'error' && (
                <span className="stream-error">
                  {s.error}
                  <button
                    type="button"
                    onClick={() => {
                      s.retry();
                      replay.bump();
                    }}
                  >
                    从游标重试
                  </button>
                </span>
              )}
            </div>
          );
        })}
      </div>
      <p className="footnote">
        每通道一条 WebSocket，每页 ≤500 帧；本地队列达 2000 帧时主动断开并记住最后一页的游标，消费到 1000 帧以下后从该游标续接。只有收到 null 游标才判定传输完成。
        {player.badTime > 0 && ` 已跳过 ${player.badTime} 条 utc_ns 非法的记录。`}
      </p>
    </Section>
  );
}
