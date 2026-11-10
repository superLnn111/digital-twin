import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, ApiError, type ApiConfig } from '../api/client';
import { CHANNELS, CHANNEL_LABEL, type ChannelId, type FrameRecord, type FramesQuery, type SessionSummary } from '../api/types';
import { followCursor, type FollowProgress } from '../lib/cursor';
import { compareNs, formatClock, formatDateTime, formatDuration, nsDiffMs, parseTimeInput, toNs, formatTimeInput } from '../lib/ns';
import { parseImuFrameHex, type SensorRangeConfig } from '../protocol/imu';
import type { ReplaySpec } from '../app/hooks';
import { FrameBytes, describePayload } from '../components/FrameBytes';
import { Section, Tag, fmtInt } from '../components/ui';

export interface HistoryWorkspaceProps {
  cfg: ApiConfig;
  range: SensorRangeConfig;
  knownGateways: string[];
  onReplay: (spec: ReplaySpec) => void;
}

interface FormState {
  gateway: string;
  channel: string;
  session: string;
  since: string;
  until: string;
  messageId: string;
  pageLimit: number;
  want: number;
}

interface ResultState {
  query: FramesQuery;
  frames: FrameRecord[];
  nextCursor: string | null;
  done: boolean;
  pages: number;
  emptyPages: number;
}

const MAX_ROWS = 50_000;
const ROW_H = 26;

function buildQuery(f: FormState): { query: FramesQuery | null; error: string | null } {
  if (!f.gateway.trim()) return { query: null, error: '需要网关 ID' };
  if (!f.channel.trim()) return { query: null, error: '需要通道 ID' };
  const since = parseTimeInput(f.since);
  const until = parseTimeInput(f.until);
  if (f.since.trim() && since === null) return { query: null, error: '起始时间无法解析' };
  if (f.until.trim() && until === null) return { query: null, error: '结束时间无法解析' };
  if (since !== null && until !== null && since > until) return { query: null, error: '起始时间晚于结束时间' };
  let messageId: number | undefined;
  if (f.messageId !== 'all') {
    const n = Number(f.messageId);
    if (!Number.isInteger(n) || n < 0 || n > 255) return { query: null, error: '消息 ID 须为 0–255' };
    messageId = n;
  }
  return {
    query: {
      gateway_id: f.gateway.trim(),
      channel_id: f.channel.trim(),
      session_id: f.session.trim() || undefined,
      since_ns: since !== null ? String(since) : undefined,
      until_ns: until !== null ? String(until) : undefined,
      message_id: messageId,
      limit: f.pageLimit,
    },
    error: null,
  };
}

const sameQuery = (a: FramesQuery, b: FramesQuery) => JSON.stringify(a) === JSON.stringify(b);

export default function HistoryWorkspace({ cfg, range, knownGateways, onReplay }: HistoryWorkspaceProps) {
  const [sessions, setSessions] = useState<SessionSummary[] | null>(null);
  const [sessionsError, setSessionsError] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>({
    gateway: knownGateways[0] ?? '',
    channel: 'usb-if00',
    session: '',
    since: '',
    until: '',
    messageId: 'all',
    pageLimit: 1000,
    want: 2000,
  });
  const [result, setResult] = useState<ResultState | null>(null);
  const [loading, setLoading] = useState<FollowProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const loadSessions = useCallback(() => {
    if (!cfg.token.trim()) {
      setSessionsError('未配置读取 token');
      return;
    }
    setSessionsError(null);
    const ctl = new AbortController();
    api
      .sessions(cfg, undefined, ctl.signal)
      .then((s) => {
        setSessions([...s].sort((a, b) => compareNs(b.start_ns, a.start_ns)));
        setForm((f) => (f.gateway ? f : { ...f, gateway: s[0]?.gateway_id ?? '' }));
      })
      .catch((e) => {
        if ((e as Error).name !== 'AbortError') setSessionsError((e as Error).message);
      });
    return () => ctl.abort();
  }, [cfg]);

  useEffect(() => loadSessions(), [loadSessions]);
  useEffect(() => () => abortRef.current?.abort(), []);

  const gateways = useMemo(() => {
    const s = new Set(knownGateways);
    sessions?.forEach((x) => s.add(x.gateway_id));
    return [...s].sort();
  }, [knownGateways, sessions]);

  const built = buildQuery(form);
  const formDirty = result !== null && built.query !== null && !sameQuery(built.query, result.query);

  const run = async (mode: 'new' | 'more') => {
    abortRef.current?.abort();
    const ctl = new AbortController();
    abortRef.current = ctl;
    setError(null);
    let query: FramesQuery;
    let start: { fresh: true } | { fresh: false; cursor: string };
    let base: FrameRecord[];
    if (mode === 'new') {
      if (!built.query) {
        setError(built.error);
        return;
      }
      query = built.query;
      start = { fresh: true };
      base = [];
      setSelected(null);
      setResult(null);
    } else {
      if (!result || result.nextCursor === null) return;
      // a cursor is only valid with the exact filters it was issued for
      query = result.query;
      start = { fresh: false, cursor: result.nextCursor };
      base = result.frames;
    }
    setLoading({ pages: 0, emptyPages: 0, collected: 0 });
    try {
      const r = await followCursor((cursor, signal) => api.framesPage(cfg, query, cursor, signal), start, form.want, {
        signal: ctl.signal,
        onProgress: (p) => setLoading(p),
      });
      const merged = base.concat(r.frames);
      setResult({
        query,
        frames: merged.length > MAX_ROWS ? merged.slice(merged.length - MAX_ROWS) : merged,
        nextCursor: r.nextCursor,
        done: r.done,
        pages: (mode === 'more' && result ? result.pages : 0) + r.pages,
        emptyPages: (mode === 'more' && result ? result.emptyPages : 0) + r.emptyPages,
      });
      if (mode === 'new' && r.frames.length) setSelected(0);
    } catch (e) {
      if ((e as Error).name === 'AbortError') return;
      setError(e instanceof ApiError ? `HTTP ${e.status} · ${e.message}` : (e as Error).message);
    } finally {
      if (abortRef.current === ctl) setLoading(null);
    }
  };

  const replayFromForm = () => {
    if (!built.query) {
      setError(built.error);
      return;
    }
    const sess = sessions?.find((s) => s.session_id === form.session && s.gateway_id === form.gateway);
    const since = toNs(built.query.since_ns) ?? toNs(sess?.start_ns);
    const until = toNs(built.query.until_ns) ?? toNs(sess?.end_ns);
    onReplay({
      gateway_id: built.query.gateway_id,
      session_id: built.query.session_id,
      since_ns: built.query.since_ns,
      until_ns: built.query.until_ns,
      channels: [...CHANNELS],
      extentStartNs: since,
      extentEndNs: until,
      label: built.query.session_id ?? '自定义范围',
    });
  };

  const sel = selected !== null && result ? result.frames[selected] : null;

  return (
    <div className="history">
      <aside className="history-sessions">
        <Section
          index="A"
          title="实验批次"
          aside={
            <button type="button" className="ghost sm" onClick={loadSessions}>
              刷新
            </button>
          }
        >
          {sessionsError && <p className="notice lv-alarm">{sessionsError}</p>}
          {sessions === null && !sessionsError && <p className="empty">加载中…</p>}
          {sessions?.length === 0 && <p className="empty">云端暂无已索引批次</p>}
          <ul className="session-list">
            {sessions?.map((s) => {
              const st = toNs(s.start_ns);
              const en = toNs(s.end_ns);
              const active = form.session === s.session_id && form.gateway === s.gateway_id;
              const q = s.checksum_errors + s.length_errors + s.discarded_bytes + s.incomplete_bytes;
              return (
                <li key={`${s.gateway_id}/${s.session_id}`} className={active ? 'active' : ''}>
                  <button type="button" onClick={() => setForm((f) => ({ ...f, gateway: s.gateway_id, session: s.session_id, since: '', until: '' }))}>
                    <div className="session-top">
                      <b>{s.session_id}</b>
                      <span className="dim">{s.gateway_id}</span>
                    </div>
                    <div className="session-meta mono">
                      <span>{st !== null ? formatDateTime(st) : '无有效帧'}</span>
                      <span>{st !== null && en !== null ? formatDuration(nsDiffMs(en, st)) : '—'}</span>
                    </div>
                    <div className="session-meta mono">
                      <span>{fmtInt(s.frames)} 帧</span>
                      <span>{s.segments} 段</span>
                      {q > 0 ? (
                        <span className="lv-warn" title={`校验错 ${s.checksum_errors} · 长度错 ${s.length_errors} · 丢弃 ${s.discarded_bytes} B · 不完整 ${s.incomplete_bytes} B`}>
                          质量计数 {fmtInt(q)}
                        </span>
                      ) : (
                        <span className="dim">质量计数 0</span>
                      )}
                    </div>
                  </button>
                  {active && (
                    <button
                      type="button"
                      className="replay-btn"
                      onClick={() =>
                        onReplay({
                          gateway_id: s.gateway_id,
                          session_id: s.session_id,
                          channels: [...CHANNELS],
                          extentStartNs: st,
                          extentEndNs: en,
                          label: s.session_id,
                        })
                      }
                    >
                      ▶ 回放整个批次到孪生
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </Section>
      </aside>

      <main className="history-main">
        <form
          className="query"
          onSubmit={(e) => {
            e.preventDefault();
            void run('new');
          }}
        >
          <label className="field">
            <span>网关</span>
            <input list="gw-list" value={form.gateway} onChange={(e) => setForm({ ...form, gateway: e.target.value })} />
            <datalist id="gw-list">
              {gateways.map((g) => (
                <option key={g} value={g} />
              ))}
            </datalist>
          </label>
          <label className="field">
            <span>通道</span>
            <input list="ch-list" value={form.channel} onChange={(e) => setForm({ ...form, channel: e.target.value })} />
            <datalist id="ch-list">
              {CHANNELS.map((c) => (
                <option key={c} value={c}>
                  {CHANNEL_LABEL[c as ChannelId]}
                </option>
              ))}
            </datalist>
          </label>
          <label className="field">
            <span>批次</span>
            <input value={form.session} placeholder="全部" onChange={(e) => setForm({ ...form, session: e.target.value })} />
          </label>
          <label className="field wide">
            <span>起始（本地时间或 ns）</span>
            <input className={form.since && parseTimeInput(form.since) === null ? 'invalid' : ''} value={form.since} placeholder="2026-10-27 22:05:29.000" onChange={(e) => setForm({ ...form, since: e.target.value })} />
          </label>
          <label className="field wide">
            <span>结束（含端点）</span>
            <input className={form.until && parseTimeInput(form.until) === null ? 'invalid' : ''} value={form.until} placeholder="不限" onChange={(e) => setForm({ ...form, until: e.target.value })} />
          </label>
          <label className="field">
            <span>消息 ID</span>
            <select value={form.messageId} onChange={(e) => setForm({ ...form, messageId: e.target.value })}>
              <option value="all">全部</option>
              <option value="1">0x01 倾角</option>
              <option value="2">0x02 四元数</option>
              <option value="3">0x03 六轴</option>
              <option value="6">0x06 端口</option>
            </select>
          </label>
          <label className="field narrow">
            <span>每页</span>
            <select value={form.pageLimit} onChange={(e) => setForm({ ...form, pageLimit: Number(e.target.value) })}>
              {[100, 500, 1000].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <label className="field narrow">
            <span>每次取</span>
            <select value={form.want} onChange={(e) => setForm({ ...form, want: Number(e.target.value) })}>
              {[500, 2000, 10000].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <div className="query-actions">
            <button type="submit" className="primary" disabled={!!loading}>
              检索
            </button>
            <button type="button" onClick={replayFromForm} title="四个通道按当前网关 / 批次 / 时间范围回放">
              回放到孪生
            </button>
          </div>
        </form>

        <div className="query-status">
          {error && <span className="lv-alarm">{error}</span>}
          {!error && built.error && form.gateway && <span className="lv-warn">{built.error}</span>}
          {loading && (
            <span>
              跟随游标中 · 已请求 {loading.pages} 页（空页 {loading.emptyPages}）· {fmtInt(loading.collected)} 帧
              <button type="button" className="ghost sm" onClick={() => abortRef.current?.abort()}>
                停止
              </button>
            </span>
          )}
          {!loading && result && (
            <span>
              {fmtInt(result.frames.length)} 帧 · {result.pages} 页（空页 {result.emptyPages}）·{' '}
              {result.done ? <b>查询结束（next_cursor = null）</b> : <span className="mono dim">游标 {result.nextCursor}</span>}
            </span>
          )}
          {!loading && result && !result.done && (
            <button type="button" className="sm" onClick={() => void run('more')}>
              继续跟随游标
            </button>
          )}
          {formDirty && <Tag level="warn">筛选已修改：继续翻页仍使用原条件，新条件请重新检索</Tag>}
        </div>

        <FrameTable frames={result?.frames ?? []} selected={selected} onSelect={setSelected} range={range} />
      </main>

      <aside className="history-inspector">
        <Section index="B" title="帧解码">
          {sel ? <FrameDetail frame={sel} prev={selected! > 0 ? result!.frames[selected! - 1] : null} range={range} /> : <p className="empty">选择一行查看逐字节解析</p>}
        </Section>
      </aside>
    </div>
  );
}

function FrameTable({ frames, selected, onSelect, range }: { frames: FrameRecord[]; selected: number | null; onSelect: (i: number) => void; range: SensorRangeConfig }) {
  const ref = useRef<HTMLDivElement>(null);
  const [scroll, setScroll] = useState(0);
  const [height, setHeight] = useState(400);
  useEffect(() => {
    const el = ref.current!;
    const ro = new ResizeObserver(() => setHeight(el.clientHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  useEffect(() => {
    if (ref.current && frames.length === 0) ref.current.scrollTop = 0;
  }, [frames.length]);

  const first = Math.max(0, Math.floor(scroll / ROW_H) - 8);
  const last = Math.min(frames.length, Math.ceil((scroll + height) / ROW_H) + 8);
  const rows = [];
  for (let i = first; i < last; i++) {
    const f = frames[i];
    const ns = toNs(f.utc_ns);
    const prevNs = i > 0 ? toNs(frames[i - 1].utc_ns) : null;
    const dt = ns !== null && prevNs !== null ? nsDiffMs(ns, prevNs) : null;
    const parsed = parseImuFrameHex(f.raw_hex, range);
    rows.push(
      <div key={i} className={`frow ${selected === i ? 'sel' : ''} ${parsed.valid ? '' : 'bad'}`} style={{ transform: `translateY(${i * ROW_H}px)` }} onClick={() => onSelect(i)}>
        <span className="num dim">{i + 1}</span>
        <span>{formatClock(ns, 6)}</span>
        <span className={`num ${dt !== null && dt < 0 ? 'lv-warn' : dt === 0 ? 'dim' : ''}`}>{dt === null ? '' : `${dt >= 0 ? '+' : ''}${dt.toFixed(3)}`}</span>
        <span>0x{f.message_id.toString(16).padStart(2, '0')}</span>
        <span className="decoded-cell">{describePayload(parsed, range)}</span>
        <span className="hex dim">{f.raw_hex}</span>
      </div>
    );
  }
  return (
    <div className="ftable">
      <div className="frow head">
        <span>#</span>
        <span>utc（本地）</span>
        <span>Δt ms</span>
        <span>ID</span>
        <span>解码</span>
        <span>raw_hex</span>
      </div>
      <div className="ftable-body mono" ref={ref} onScroll={(e) => setScroll((e.target as HTMLDivElement).scrollTop)}>
        <div style={{ height: frames.length * ROW_H, position: 'relative' }}>{rows}</div>
        {frames.length === 0 && <p className="empty center">无结果。检索会持续跟随非 null 游标，空页不代表结束。</p>}
      </div>
    </div>
  );
}

function FrameDetail({ frame, prev, range }: { frame: FrameRecord; prev: FrameRecord | null; range: SensorRangeConfig }) {
  const parsed = parseImuFrameHex(frame.raw_hex, range);
  const bytes = frame.raw_hex.match(/../g) ?? [];
  const sum = bytes.slice(0, -1).reduce((a, b) => (a + parseInt(b, 16)) & 0xff, 0);
  const ns = toNs(frame.utc_ns);
  const prevNs = prev ? toNs(prev.utc_ns) : null;
  return (
    <div className="frame-detail">
      <FrameBytes hex={frame.raw_hex} />
      <div className="byte-legend">
        <span className="b hdr">帧头</span>
        <span className="b id">ID</span>
        <span className="b len">长度</span>
        <span className="b pl">载荷</span>
        <span className="b sum">校验</span>
      </div>
      <div className={`decoded mono ${parsed.valid ? '' : 'lv-alarm'}`}>{describePayload(parsed, range)}</div>
      {parsed.valid && parsed.payload.kind !== 'unknown' && (
        <table className="raw-table mono">
          <tbody>
            {parsed.payload.raw.map((v, i) => (
              <tr key={i}>
                <td className="dim">int16[{i}]</td>
                <td>{v}</td>
                <td className="dim">
                  {bytes[4 + i * 2]} {bytes[5 + i * 2]}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <dl className="kv-list">
        <dt>校验和</dt>
        <dd className="mono">
          计算 0x{sum.toString(16).padStart(2, '0')} · 帧末 0x{bytes[bytes.length - 1]} {parsed.valid ? '✓' : ''}
        </dd>
        <dt>utc_ns</dt>
        <dd className="mono">{frame.utc_ns}</dd>
        <dt>本地时间</dt>
        <dd className="mono">{formatTimeInput(ns)}</dd>
        <dt>monotonic_ns</dt>
        <dd className="mono">{frame.monotonic_ns}</dd>
        <dt>与上一行</dt>
        <dd className="mono">{ns !== null && prevNs !== null ? `${nsDiffMs(ns, prevNs).toFixed(6)} ms` : '—'}</dd>
        <dt>time_basis</dt>
        <dd className="mono">{frame.time_basis}</dd>
        <dt>session</dt>
        <dd className="mono">{frame.session_id}</dd>
        <dt>segment</dt>
        <dd className="mono small">{frame.segment_id}</dd>
      </dl>
      {frame.time_basis === 'read_return' && <p className="footnote">read_return：时间戳取自串口 read 返回时刻，同一批读取的帧可共享时间戳，不能据相邻差值推算采样率。</p>}
    </div>
  );
}
