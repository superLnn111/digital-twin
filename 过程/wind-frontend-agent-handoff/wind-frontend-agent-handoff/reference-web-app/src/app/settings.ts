import type { AccRangeG, GyroRangeDps } from '../protocol/imu';

export interface Settings {
  apiBase: string;
  token: string;
  rememberToken: boolean;
  accRangeG: AccRangeG;
  gyroRangeDps: GyroRangeDps;
  /** Vibration thresholds on the tri-axis vector AC RMS (g). Heuristic, user-adjustable. */
  vibWarnG: number;
  vibAlarmG: number;
  /** Seconds without a new valid frame before a live channel counts as stale. */
  staleAfterS: number;
  videoUrl: string;
}

export const DEFAULT_SETTINGS: Settings = {
  apiBase: '/wind-v2',
  token: '',
  rememberToken: false,
  accRangeG: 4,
  gyroRangeDps: 2000,
  vibWarnG: 0.12,
  vibAlarmG: 0.3,
  staleAfterS: 10,
  videoUrl: '',
};

const KEY = 'wind-twin.settings.v2';
const TOKEN_KEY = 'wind-twin.token';

export function loadSettings(): Settings {
  let s: Settings = { ...DEFAULT_SETTINGS };
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) s = { ...s, ...(JSON.parse(raw) as Partial<Settings>) };
    s.token = (s.rememberToken ? localStorage.getItem(TOKEN_KEY) : sessionStorage.getItem(TOKEN_KEY)) ?? '';
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
