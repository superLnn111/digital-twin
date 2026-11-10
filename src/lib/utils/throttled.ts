/** Throttled flag decoding for the Raspberry Pi 5 `status.host.throttled_hex` field. */

export const THROTTLE_FLAGS = [
  { mask: 0x1, label: '欠压', hint: '供电电压低于 4.63 V' },
  { mask: 0x2, label: '降频', hint: 'SoC 频率受限' },
  { mask: 0x4, label: '温度', hint: '核心温度过高' },
  { mask: 0x8, label: '软限流', hint: '固件主动限制电流' },
] as const;

export interface ThrottledView {
  hex: string;
  /** 0 means no throttle flags set. */
  raw: number;
  flags: { label: string; hint: string }[];
  hasUndervoltage: boolean;
  /** Whether any bit is set. */
  throttled: boolean;
}

export function readThrottled(hex: string | null | undefined): ThrottledView | null {
  if (!hex) return null;
  const match = /^0x[0-9a-fA-F]+$/.test(hex.trim()) ? hex.trim().replace(/^0x/, '') : null;
  if (match === null) return null;
  const raw = parseInt(match, 16);
  if (Number.isNaN(raw)) return null;
  const flags = THROTTLE_FLAGS.filter((f) => (raw & f.mask) !== 0).map((f) => ({ label: f.label, hint: f.hint }));
  return {
    hex: `0x${raw.toString(16).padStart(8, '0')}`,
    raw,
    flags,
    hasUndervoltage: (raw & 0x1) !== 0,
    throttled: raw !== 0,
  };
}