// ============================================================
// ConnectionSettings.tsx — 连接设置弹窗（token / API 前缀 / 量程）
// ============================================================
// token 只存浏览器本地；本地联调默认开发 token 为 wind-dev-token。
// ============================================================

import { useEffect, useState } from "react";
import { KeyRound, X } from "lucide-react";
import type { Settings } from "@/lib/settings";
import type { AccRangeG, GyroRangeDps } from "@/lib/protocol/imu";

interface Props {
  settings: Settings;
  onSave: (s: Settings) => void;
  onClose: () => void;
}

export function ConnectionSettings({ settings, onSave, onClose }: Props) {
  const [token, setToken] = useState(settings.token);
  const [apiBase, setApiBase] = useState(settings.apiBase);
  const [rememberToken, setRememberToken] = useState(settings.rememberToken);
  const [accRangeG, setAccRangeG] = useState<AccRangeG>(settings.accRangeG);
  const [gyroRangeDps, setGyroRangeDps] = useState<GyroRangeDps>(settings.gyroRangeDps);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const save = () => {
    onSave({ apiBase: apiBase.trim() || "/wind-v2", token: token.trim(), rememberToken, accRangeG, gyroRangeDps });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-xl border border-[#27684f]/40 bg-[#132e25] p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-base font-semibold text-[#47a87a]">
            <KeyRound className="h-5 w-5" /> 连接设置
          </h3>
          <button onClick={onClose} className="text-[#81a898] hover:text-[#d6e8d8]">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-xs text-[#81a898]">读取 token</label>
            <input
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="本地联调默认 wind-dev-token"
              className="w-full rounded-md border border-[#27684f]/40 bg-[#0f251d] px-3 py-2 text-sm text-[#d6e8d8] outline-none focus:border-[#47a87a]"
            />
            <p className="mt-1 text-[11px] text-[#6d8f80]">
              token 仅保存在浏览器本地，绝不写入源码；走 HTTP Bearer 与 WebSocket 首消息认证。
            </p>
          </div>

          <div>
            <label className="mb-1 block text-xs text-[#81a898]">API 前缀</label>
            <input
              type="text"
              value={apiBase}
              onChange={(e) => setApiBase(e.target.value)}
              className="w-full rounded-md border border-[#27684f]/40 bg-[#0f251d] px-3 py-2 text-sm text-[#d6e8d8] outline-none focus:border-[#47a87a]"
            />
          </div>

          <label className="flex items-center gap-2 text-sm text-[#d6e8d8]">
            <input
              type="checkbox"
              checked={rememberToken}
              onChange={(e) => setRememberToken(e.target.checked)}
              className="h-4 w-4 accent-[#47a87a]"
            />
            记住 token（否则仅本次会话有效）
          </label>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs text-[#81a898]">加速度量程</label>
              <select
                value={accRangeG}
                onChange={(e) => setAccRangeG(Number(e.target.value) as AccRangeG)}
                className="w-full rounded-md border border-[#27684f]/40 bg-[#0f251d] px-3 py-2 text-sm text-[#d6e8d8] outline-none focus:border-[#47a87a]"
              >
                {[2, 4, 8, 16].map((g) => (
                  <option key={g} value={g}>{g} g</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs text-[#81a898]">角速度量程</label>
              <select
                value={gyroRangeDps}
                onChange={(e) => setGyroRangeDps(Number(e.target.value) as GyroRangeDps)}
                className="w-full rounded-md border border-[#27684f]/40 bg-[#0f251d] px-3 py-2 text-sm text-[#d6e8d8] outline-none focus:border-[#47a87a]"
              >
                {[250, 500, 1000, 2000].map((d) => (
                  <option key={d} value={d}>{d} °/s</option>
                ))}
              </select>
            </div>
          </div>
          <p className="text-[11px] text-[#6d8f80]">
            量程须与采集时 IMU 配置一致，切换后按原始整数重新换算物理量。
          </p>
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-md border border-[#27684f]/40 px-4 py-2 text-sm text-[#81a898] hover:bg-[#27684f]/20"
          >
            取消
          </button>
          <button
            onClick={save}
            className="rounded-md bg-[#47a87a] px-4 py-2 text-sm font-semibold text-[#0f251d] hover:bg-[#5dba88]"
          >
            保存
          </button>
        </div>
      </div>
    </div>
  );
}