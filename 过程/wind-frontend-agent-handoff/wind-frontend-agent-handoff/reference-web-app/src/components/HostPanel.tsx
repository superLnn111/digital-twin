import type { GatewaySnapshot } from '../api/types';
import {
  diskLevel,
  firmwareFreshness,
  readHost,
  tempLevel,
  throttledLevel,
  undervoltageLevel,
  voltageLevel,
  worstLevel,
} from '../lib/host';
import { formatAge, formatDateTime, formatDuration, nowNs, toNs } from '../lib/ns';
import { Readout, Section, Tag, fmt } from './ui';

export function HostPanel({ snapshot, rebootAt, simulated }: { snapshot: GatewaySnapshot | null; rebootAt: number | null; simulated: boolean }) {
  if (!snapshot) {
    return (
      <Section index="02" title="网关本体 · Raspberry Pi 5">
        <p className="empty">尚无网关状态</p>
      </Section>
    );
  }
  const host = readHost(snapshot.status?.host);
  if (!host) {
    return (
      <Section index="02" title="网关本体 · Raspberry Pi 5" aside={<Tag>未上报</Tag>}>
        <p className="empty">
          该网关的状态中没有 <code>host</code> 对象（旧版 uploader 只发送 channels）。以下指标全部未知，不代表正常。
        </p>
      </Section>
    );
  }

  const now = nowNs();
  // ages relative to the cloud receive time are immune to browser clock skew
  const reference = toNs(snapshot.received_utc_ns) ?? now;
  const fw = firmwareFreshness(host, reference);
  const levels = {
    volt: voltageLevel(host.ext5vV),
    uv: undervoltageLevel(host.undervoltageAlarm),
    thr: throttledLevel(host.throttled),
    temp: tempLevel(host.cpuTempC),
    disk: diskLevel(host.diskUsedPercent),
  };
  const overall = worstLevel(Object.values(levels));
  const recentReboot = rebootAt !== null && Date.now() - rebootAt < 10 * 60_000;

  return (
    <Section
      index="02"
      title="网关本体 · Raspberry Pi 5"
      aside={
        <>
          {simulated && <Tag level="sim">仿真</Tag>}
          <Tag level={overall === 'ok' ? 'neutral' : overall}>
            {overall === 'ok' ? '指标在常规范围' : overall === 'unknown' ? '指标未知' : overall === 'warn' ? '需关注' : '告警'}
          </Tag>
        </>
      }
    >
      <div className="readout-grid">
        <Readout
          label="EXT5V 供电"
          value={fmt(host.ext5vV, 3)}
          unit="V"
          level={levels.volt}
          unknown={fw.attemptedWithoutReading ? '查询失败' : '未采样'}
          hint="固件 ADC · 缓存 ≤30 s"
        />
        <Readout
          label="近期欠压告警"
          value={host.undervoltageAlarm === null ? null : host.undervoltageAlarm ? '告警' : '无'}
          level={levels.uv}
          unknown="节点缺失"
          hint="hwmon in0_lcrit_alarm"
        />
        <Readout label="CPU 温度" value={fmt(host.cpuTempC, 1)} unit="°C" level={levels.temp} hint="≥80 °C 软限频" />
        <Readout label="数据盘占用" value={fmt(host.diskUsedPercent, 1)} unit="%" level={levels.disk} hint={<Meter value={host.diskUsedPercent} level={levels.disk} />} />
        <Readout
          label="运行时长"
          value={host.uptimeSec === null ? null : formatDuration(host.uptimeSec * 1000)}
          level={recentReboot ? 'warn' : 'ok'}
          hint={recentReboot ? '检测到重启' : host.bootNs !== null ? `启动约 ${formatDateTime(host.bootNs)}` : '启动时间未知'}
        />
        <Readout
          label="固件读数时效"
          value={fw.ageMs === null ? null : formatAge(fw.ageMs)}
          level={fw.stale ? 'warn' : 'ok'}
          unknown="从未查询"
          hint={fw.stale ? '超过 30 s 缓存周期未刷新' : fw.attemptedWithoutReading ? '最近一次查询未取得读数' : 'vcgencmd 查询尝试时间'}
        />
      </div>

      <div className="throttle">
        <div className="throttle-head">
          <span className="readout-label">
            <span className={`dot lv-${levels.thr}`} />
            固件节流标志 <code>get_throttled</code>
          </span>
          <span className="mono dim">{host.throttled ? host.throttled.hex : host.throttledRaw ?? '—'}</span>
        </div>
        {host.throttled ? (
          <table className="throttle-table">
            <thead>
              <tr>
                <th />
                <th>当前</th>
                <th title="内核驱动每 ~2 s 读取并清除粘滞位，只覆盖最近窗口">近期发生</th>
              </tr>
            </thead>
            <tbody>
              {host.throttled.flags.map((f) => (
                <tr key={f.key}>
                  <td>{f.label}</td>
                  <td>
                    <Bit on={f.now} level="alarm" />
                  </td>
                  <td>
                    <Bit on={f.occurred} level="warn" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="empty small">{host.throttledRaw ? `无法解析：${host.throttledRaw}` : fw.attemptedWithoutReading ? '最近一次查询失败（失败结果同样缓存 30 s）' : '未采样'}</p>
        )}
        <p className="footnote">
          读数在 uploader 内缓存 30 s（失败亦缓存，过期失败会清值）。内核 rpi hwmon 每 2 s 清除粘滞位，“近期发生”不代表自启动以来的完整历史；一次正常读数不能排除此前掉压。
          {host.throttled && host.throttled.unknownBits !== 0 && ` 另有未定义位 0x${host.throttled.unknownBits.toString(16)}。`}
        </p>
      </div>

      {host.extra.length > 0 && (
        <details className="extra">
          <summary>其他字段 · {host.extra.length}</summary>
          <dl>
            {host.extra.map(([k, v]) => (
              <div key={k}>
                <dt>{k}</dt>
                <dd className="mono">{JSON.stringify(v)}</dd>
              </div>
            ))}
          </dl>
        </details>
      )}
    </Section>
  );
}

function Bit({ on, level }: { on: boolean; level: 'warn' | 'alarm' }) {
  return <span className={`bit ${on ? `on lv-${level}` : ''}`}>{on ? '1' : '0'}</span>;
}

function Meter({ value, level }: { value: number | null; level: string }) {
  if (value === null) return <span>—</span>;
  return (
    <span className={`meter lv-${level}`}>
      <span style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
    </span>
  );
}
