/**
 * 前端连接设置（v2 后端契约）。
 *
 * 读取 token 只存在浏览器本地，且绝不硬编码进源码：
 * - 本地联调默认使用后端内置的开发 token `wind-dev-token`
 * - 生产 token 由运维在页面内配置
 */
import type { AccRangeG, GyroRangeDps } from './protocol/imu';

export interface Settings {
  /** API 根路径前缀，开发环境走 Vite 代理用 `/wind-v2` */
  apiBase: string;
  /** 读取 token（HTTP Bearer / WebSocket 首消息） */
  token: string;
  /** 是否把 token 持久化到 localStorage（否则 sessionStorage） */
  rememberToken: boolean;
  /** IMU 六轴量程（解码 raw_hex 时换算物理量） */
  accRangeG: AccRangeG;
  gyroRangeDps: GyroRangeDps;
}

export const DEFAULT_SETTINGS: Settings = {
  apiBase: '/wind-v2',
  token: '',
  rememberToken: false,
  accRangeG: 4,
  gyroRangeDps: 2000,
};

const KEY = 'wind-twin.settings.v2';
const TOKEN_KEY = 'wind-twin.token.v2';

export function loadSettings(): Settings {
  let s: Settings = { ...DEFAULT_SETTINGS };
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) s = { ...s, ...(JSON.parse(raw) as Partial<Settings>) };
    const token = s.rememberToken ? localStorage.getItem(TOKEN_KEY) : sessionStorage.getItem(TOKEN_KEY);
    s.token = token ?? '';
  } catch {
    /* storage unavailable */
  }
  return s;
}

export function saveSettings(s: Settings): void {
  try {
    const { token, ...rest } = s;
    localStorage.setItem(KEY, JSON.stringify(rest));
    if (s.rememberToken) {
      localStorage.setItem(TOKEN_KEY, token);
      sessionStorage.removeItem(TOKEN_KEY);
    } else {
      sessionStorage.setItem(TOKEN_KEY, token);
      localStorage.removeItem(TOKEN_KEY);
    }
  } catch {
    /* storage unavailable */
  }
}