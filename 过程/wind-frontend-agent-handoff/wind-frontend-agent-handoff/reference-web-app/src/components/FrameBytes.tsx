import type { ImuParseResult, SensorRangeConfig } from '../protocol/imu';
import { parseImuFrameHex } from '../protocol/imu';

/** Byte-grouped hex with header / id / length / payload / checksum roles. */
export function FrameBytes({ hex }: { hex: string }) {
  const clean = hex.trim().toLowerCase();
  const bytes = clean.match(/../g) ?? [];
  const len = bytes.length;
  return (
    <div className="frame-bytes mono" title={clean}>
      {bytes.map((b, i) => {
        const role = i < 2 ? 'hdr' : i === 2 ? 'id' : i === 3 ? 'len' : i === len - 1 ? 'sum' : 'pl';
        return (
          <span key={i} className={`b ${role}`}>
            {b}
          </span>
        );
      })}
    </div>
  );
}

const f = (v: number, d = 3) => (v >= 0 ? ' ' : '') + v.toFixed(d);

/** One-line physical decoding using the configured ranges. */
export function describePayload(parsed: ImuParseResult, range: SensorRangeConfig): string {
  if (!parsed.valid) return `无效帧：${parsed.error}`;
  // re-parse with the current range so physical values follow range changes
  const p = parseImuFrameHex(parsed.rawHex, range);
  if (!p.valid) return `无效帧：${p.error}`;
  const pl = p.payload;
  switch (pl.kind) {
    case 'attitude':
      return `0x01 倾角  roll ${f(pl.rollDeg, 2)}°  pitch ${f(pl.pitchDeg, 2)}°  yaw ${f(pl.yawDeg, 2)}°`;
    case 'quaternion':
      return `0x02 四元数  q0 ${f(pl.q0, 4)}  q1 ${f(pl.q1, 4)}  q2 ${f(pl.q2, 4)}  q3 ${f(pl.q3, 4)}`;
    case 'six_axis':
      return `0x03 六轴  a ${f(pl.ax, 3)} ${f(pl.ay, 3)} ${f(pl.az, 3)} m/s²  ω ${f(pl.gx, 2)} ${f(pl.gy, 2)} ${f(pl.gz, 2)} °/s  (±${range.accRangeG} g / ±${range.gyroRangeDps} °/s)`;
    case 'port_status':
      return `0x06 端口  d0 ${pl.d0}  d1 ${pl.d1}  d2 ${pl.d2}  d3 ${pl.d3}`;
    default:
      return `0x${pl.messageId.toString(16).padStart(2, '0')} 未知消息  ${pl.payloadBytes.length} 字节载荷（不做物理换算）`;
  }
}
