export type AccRangeG = 2 | 4 | 8 | 16;
export type GyroRangeDps = 250 | 500 | 1000 | 2000;

export interface SensorRangeConfig {
  accRangeG: AccRangeG;
  gyroRangeDps: GyroRangeDps;
}

export const DEFAULT_RANGE_CONFIG: SensorRangeConfig = {
  accRangeG: 4,
  gyroRangeDps: 2000,
};

export const GRAVITY_STANDARD = 9.80665;
export const MAX_PAYLOAD_BYTES = 64;

export interface AttitudePayload {
  kind: 'attitude';
  messageId: 0x01;
  raw: [number, number, number];
  rollDeg: number;
  pitchDeg: number;
  yawDeg: number;
}

export interface QuaternionPayload {
  kind: 'quaternion';
  messageId: 0x02;
  raw: [number, number, number, number];
  q0: number;
  q1: number;
  q2: number;
  q3: number;
}

export interface SixAxisPayload {
  kind: 'six_axis';
  messageId: 0x03;
  raw: [number, number, number, number, number, number];
  axRaw: number;
  ayRaw: number;
  azRaw: number;
  gxRaw: number;
  gyRaw: number;
  gzRaw: number;
  /** m/s² */
  ax: number;
  /** m/s² */
  ay: number;
  /** m/s² */
  az: number;
  /** °/s */
  gx: number;
  /** °/s */
  gy: number;
  /** °/s */
  gz: number;
  accMagnitude: number;
  gyroMagnitude: number;
}

export interface PortStatusPayload {
  kind: 'port_status';
  messageId: 0x06;
  raw: [number, number, number, number];
  d0: number;
  d1: number;
  d2: number;
  d3: number;
}

export interface RawPayload {
  kind: 'unknown';
  messageId: number;
  payloadBytes: Uint8Array;
}

export type ParsedImuPayload =
  | AttitudePayload
  | QuaternionPayload
  | SixAxisPayload
  | PortStatusPayload
  | RawPayload;

export interface ParsedImuFrame {
  valid: true;
  messageId: number;
  length: number;
  checksum: number;
  rawHex: string;
  payload: ParsedImuPayload;
}

export interface InvalidImuFrame {
  valid: false;
  rawHex: string;
  error: string;
}

export type ImuParseResult = ParsedImuFrame | InvalidImuFrame;

/**
 * Convert hexadecimal string to Uint8Array.
 */
export function hexToBytes(hex: string): Uint8Array | null {
  const clean = hex.trim().toLowerCase();
  if (clean.length === 0 || clean.length % 2 !== 0 || !/^[0-9a-f]+$/.test(clean)) {
    return null;
  }
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < clean.length; i += 2) {
    bytes[i / 2] = parseInt(clean.slice(i, i + 2), 16);
  }
  return bytes;
}

/**
 * Pure parser for ATK-IMU901 hexadecimal frames using standard DataView little-endian int16 reads.
 */
export function parseImuFrameHex(
  rawHex: string,
  range: SensorRangeConfig = DEFAULT_RANGE_CONFIG
): ImuParseResult {
  const bytes = hexToBytes(rawHex);
  if (!bytes) {
    return { valid: false, rawHex, error: '无效的十六进制字符串' };
  }
  if (bytes.length < 5) {
    return { valid: false, rawHex, error: `帧长度不足 5 字节 (${bytes.length})` };
  }
  if (bytes[0] !== 0x55 || bytes[1] !== 0x55) {
    return { valid: false, rawHex, error: '帧头必须为 0x55 0x55' };
  }
  const messageId = bytes[2];
  const length = bytes[3];
  if (length > MAX_PAYLOAD_BYTES) {
    return { valid: false, rawHex, error: `载荷长度超出上限 (${length} > ${MAX_PAYLOAD_BYTES})` };
  }
  if (bytes.length !== length + 5) {
    return {
      valid: false,
      rawHex,
      error: `整帧字节数 (${bytes.length}) 与 length + 5 (${length + 5}) 不匹配`,
    };
  }

  let sum = 0;
  for (let i = 0; i < bytes.length - 1; i++) {
    sum = (sum + bytes[i]) & 0xff;
  }
  const expectedChecksum = bytes[bytes.length - 1];
  if (sum !== expectedChecksum) {
    return {
      valid: false,
      rawHex,
      error: `校验和错误: 计算值 0x${sum.toString(16).padStart(2, '0')} != 帧末值 0x${expectedChecksum
        .toString(16)
        .padStart(2, '0')}`,
    };
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  if (messageId === 0x01 && length === 6) {
    const rollRaw = view.getInt16(4, true);
    const pitchRaw = view.getInt16(6, true);
    const yawRaw = view.getInt16(8, true);
    return {
      valid: true,
      messageId,
      length,
      checksum: expectedChecksum,
      rawHex: rawHex.trim().toLowerCase(),
      payload: {
        kind: 'attitude',
        messageId: 0x01,
        raw: [rollRaw, pitchRaw, yawRaw],
        rollDeg: (rollRaw / 32768) * 180,
        pitchDeg: (pitchRaw / 32768) * 180,
        yawDeg: (yawRaw / 32768) * 180,
      },
    };
  }

  if (messageId === 0x02 && length === 8) {
    const q0Raw = view.getInt16(4, true);
    const q1Raw = view.getInt16(6, true);
    const q2Raw = view.getInt16(8, true);
    const q3Raw = view.getInt16(10, true);
    return {
      valid: true,
      messageId,
      length,
      checksum: expectedChecksum,
      rawHex: rawHex.trim().toLowerCase(),
      payload: {
        kind: 'quaternion',
        messageId: 0x02,
        raw: [q0Raw, q1Raw, q2Raw, q3Raw],
        q0: q0Raw / 32768,
        q1: q1Raw / 32768,
        q2: q2Raw / 32768,
        q3: q3Raw / 32768,
      },
    };
  }

  if (messageId === 0x03 && length === 12) {
    const axRaw = view.getInt16(4, true);
    const ayRaw = view.getInt16(6, true);
    const azRaw = view.getInt16(8, true);
    const gxRaw = view.getInt16(10, true);
    const gyRaw = view.getInt16(12, true);
    const gzRaw = view.getInt16(14, true);

    const accScale = (range.accRangeG * GRAVITY_STANDARD) / 32768;
    const gyroScale = range.gyroRangeDps / 32768;

    const ax = axRaw * accScale;
    const ay = ayRaw * accScale;
    const az = azRaw * accScale;
    const gx = gxRaw * gyroScale;
    const gy = gyRaw * gyroScale;
    const gz = gzRaw * gyroScale;

    return {
      valid: true,
      messageId,
      length,
      checksum: expectedChecksum,
      rawHex: rawHex.trim().toLowerCase(),
      payload: {
        kind: 'six_axis',
        messageId: 0x03,
        raw: [axRaw, ayRaw, azRaw, gxRaw, gyRaw, gzRaw],
        axRaw,
        ayRaw,
        azRaw,
        gxRaw,
        gyRaw,
        gzRaw,
        ax,
        ay,
        az,
        gx,
        gy,
        gz,
        accMagnitude: Math.hypot(ax, ay, az),
        gyroMagnitude: Math.hypot(gx, gy, gz),
      },
    };
  }

  if (messageId === 0x06 && length === 8) {
    const d0 = view.getInt16(4, true);
    const d1 = view.getInt16(6, true);
    const d2 = view.getInt16(8, true);
    const d3 = view.getInt16(10, true);
    return {
      valid: true,
      messageId,
      length,
      checksum: expectedChecksum,
      rawHex: rawHex.trim().toLowerCase(),
      payload: {
        kind: 'port_status',
        messageId: 0x06,
        raw: [d0, d1, d2, d3],
        d0,
        d1,
        d2,
        d3,
      },
    };
  }

  return {
    valid: true,
    messageId,
    length,
    checksum: expectedChecksum,
    rawHex: rawHex.trim().toLowerCase(),
    payload: {
      kind: 'unknown',
      messageId,
      payloadBytes: bytes.slice(4, 4 + length),
    },
  };
}

/**
 * Helper to encode int16 array into a valid ATK-IMU901 raw_hex frame.
 */
export function buildImuFrameHex(messageId: number, values: number[]): string {
  const payloadLength = values.length * 2;
  const bytes = new Uint8Array(payloadLength + 5);
  bytes[0] = 0x55;
  bytes[1] = 0x55;
  bytes[2] = messageId & 0xff;
  bytes[3] = payloadLength & 0xff;
  const view = new DataView(bytes.buffer);
  values.forEach((v, idx) => {
    const clamped = Math.max(-32768, Math.min(32767, Math.round(v)));
    view.setInt16(4 + idx * 2, clamped, true);
  });
  let sum = 0;
  for (let i = 0; i < bytes.length - 1; i++) {
    sum = (sum + bytes[i]) & 0xff;
  }
  bytes[bytes.length - 1] = sum;
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Safely parse a decimal nanosecond string into BigInt.
 */
export function parseNsBigInt(nsStr: string | null | undefined): bigint | null {
  if (!nsStr) return null;
  try {
    return BigInt(nsStr.trim());
  } catch {
    return null;
  }
}

/**
 * Compute relative milliseconds between two nanosecond strings using BigInt.
 */
export function diffNsToMs(targetNs: string, baseNs: string): number {
  const t = parseNsBigInt(targetNs);
  const b = parseNsBigInt(baseNs);
  if (t === null || b === null) return 0;
  const diffNs = t - b;
  const wholeMs = diffNs / 1000000n;
  const remNs = diffNs % 1000000n;
  return Number(wholeMs) + Number(remNs) / 1e6;
}

/**
 * Format a nanosecond decimal string into ISO-like UTC time with millisecond & microsecond precision.
 */
export function formatUtcNs(nsStr: string | null | undefined): string {
  const ns = parseNsBigInt(nsStr);
  if (ns === null || ns <= 0n) return '—';
  const ms = Number(ns / 1000000n);
  const subNs = ns % 1000000000n;
  const date = new Date(ms);
  if (Number.isNaN(date.getTime())) return nsStr ?? '—';
  const hh = String(date.getUTCHours()).padStart(2, '0');
  const mm = String(date.getUTCMinutes()).padStart(2, '0');
  const ss = String(date.getUTCSeconds()).padStart(2, '0');
  const us = String(subNs / 1000n).padStart(6, '0');
  return `${hh}:${mm}:${ss}.${us.slice(0, 3)}`;
}