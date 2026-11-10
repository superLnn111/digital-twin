/**
 * Offline signal generator. Produces genuine ATK-IMU901 frames (via the
 * protocol encoder) and status snapshots shaped like the real API, so the whole
 * pipeline — parser, buffers, panels — is exercised. Everything it produces is
 * labelled as simulated in the UI; RPM exists only here.
 */
import { buildImuFrameHex, type SensorRangeConfig } from '../protocol/imu';
import { CHANNELS, type ChannelId, type GatewaySnapshot } from '../api/types';
import { nowNs } from '../lib/ns';
import type { TelemetryStore } from '../telemetry/store';

export const SIM_GATEWAY_ID = 'sim-rpi5';

const SIX_AXIS_HZ = 100;
const ATTITUDE_EVERY = 5; // → 20 Hz attitude

interface TurbineModel {
  baseRpm: number;
  imbalanceG: number;
  phase: number;
  yawBias: number;
}

const MODELS: Record<ChannelId, TurbineModel> = {
  'usb-if00': { baseRpm: 420, imbalanceG: 0.05, phase: 0.0, yawBias: 12 },
  'usb-if02': { baseRpm: 465, imbalanceG: 0.07, phase: 1.3, yawBias: 9 },
  'usb-if04': { baseRpm: 390, imbalanceG: 0.42, phase: 2.1, yawBias: 15 },
  'usb-if06': { baseRpm: 440, imbalanceG: 0.06, phase: 3.7, yawBias: 11 },
};

// deterministic pseudo-noise (xorshift) so the demo looks the same every run
function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) / 4294967296) * 2 - 1;
  };
}

function eulerToQuat(rollDeg: number, pitchDeg: number, yawDeg: number): [number, number, number, number] {
  const d = Math.PI / 360;
  const cr = Math.cos(rollDeg * d), sr = Math.sin(rollDeg * d);
  const cp = Math.cos(pitchDeg * d), sp = Math.sin(pitchDeg * d);
  const cy = Math.cos(yawDeg * d), sy = Math.sin(yawDeg * d);
  return [
    cr * cp * cy + sr * sp * sy,
    sr * cp * cy - cr * sp * sy,
    cr * sp * cy + sr * cp * sy,
    cr * cp * sy - sr * sp * cy,
  ];
}

export class Simulator {
  private startNs = 0n;
  private emittedUntilS: Record<ChannelId, { six: number }>;
  private rotorAngle: Record<ChannelId, number>;
  private noise = rng(0x5eed);
  private quality: Record<ChannelId, { checksum_errors: number; length_errors: number; discarded_bytes: number; incomplete_bytes: number; frames: number; read_bytes: number }>;
  private lastFirmwareS = -Infinity;
  private firmware = { throttled_hex: '0x0' as string | null, ext5v_v: 5.08 as number | null, sample: '' };
  private readonly store: TelemetryStore;
  private readonly range: () => SensorRangeConfig;

  constructor(store: TelemetryStore, range: () => SensorRangeConfig) {
    this.store = store;
    this.range = range;
    this.emittedUntilS = Object.fromEntries(CHANNELS.map((c) => [c, { six: 0 }])) as typeof this.emittedUntilS;
    this.rotorAngle = Object.fromEntries(CHANNELS.map((c) => [c, 0])) as Record<ChannelId, number>;
    this.quality = Object.fromEntries(
      CHANNELS.map((c) => [c, { checksum_errors: 0, length_errors: 0, discarded_bytes: 0, incomplete_bytes: 0, frames: 0, read_bytes: 0 }])
    ) as typeof this.quality;
  }

  start(): void {
    this.startNs = nowNs();
    this.store.setEpoch(this.startNs);
  }

  private rpmAt(c: ChannelId, t: number): number {
    const m = MODELS[c];
    return m.baseRpm + 55 * Math.sin((2 * Math.PI * t) / 28 + m.phase) + 18 * Math.sin((2 * Math.PI * t) / 6.5 + m.phase * 2);
  }

  /** Emit all samples due up to now. */
  tick(): void {
    const tNow = Number((nowNs() - this.startNs) / 1000n) / 1e6;
    const range = this.range();
    const accK = 32768 / range.accRangeG;
    const gyroK = 32768 / range.gyroRangeDps;
    for (const c of CHANNELS) {
      const m = MODELS[c];
      const st = this.emittedUntilS[c];
      // after a hidden tab, skip ahead instead of generating minutes of backlog
      if (tNow - st.six > 2) st.six = tNow - 2;
      // one time-ordered stream per channel, like the serial port delivers it:
      // a six-axis frame every tick, attitude + quaternion every ATTITUDE_EVERY ticks
      let n = Math.round(st.six * SIX_AXIS_HZ) + 1;
      for (; n / SIX_AXIS_HZ <= tNow; n++) {
        const t = n / SIX_AXIS_HZ;
        const ns = String(this.startNs + BigInt(Math.round(t * 1e9)));
        const rpm = this.rpmAt(c, t);
        const f1 = rpm / 60;
        this.rotorAngle[c] += (2 * Math.PI * f1) / SIX_AXIS_HZ;
        const th = this.rotorAngle[c];
        const nz = this.noise;
        const ax = 0.012 + m.imbalanceG * Math.sin(th) + 0.035 * Math.sin(3 * th + 0.4) + 0.018 * nz();
        const ay = -0.02 + m.imbalanceG * 0.6 * Math.cos(th) + 0.03 * Math.sin(3 * th + 1.1) + 0.018 * nz();
        const az = 0.995 + 0.015 * Math.sin(2 * th) + 0.012 * nz();
        const gx = 1.2 * Math.sin(th) * m.imbalanceG * 10 + 0.4 * nz();
        const gy = 0.8 * Math.cos(th * 0.5) + 0.4 * nz();
        const gz = 0.6 * Math.sin((2 * Math.PI * t) / 9) + 0.3 * nz();
        const hex = buildImuFrameHex(0x03, [ax * accK, ay * accK, az * accK, gx * gyroK, gy * gyroK, gz * gyroK]);
        this.store.ingest(c, { utc_ns: ns, raw_hex: hex });
        this.quality[c].frames++;
        this.quality[c].read_bytes += hex.length / 2;
        if (n % ATTITUDE_EVERY === 0) {
          const roll = 1.6 * Math.sin((2 * Math.PI * t) / 3.1 + m.phase) + (c === 'usb-if04' ? 0.9 * Math.sin(th) : 0);
          const pitch = -2.2 + 1.1 * Math.sin((2 * Math.PI * t) / 4.3 + m.phase);
          const yaw = m.yawBias + 14 * Math.sin((2 * Math.PI * t) / 40 + m.phase * 0.3);
          this.store.ingest(c, { utc_ns: ns, raw_hex: buildImuFrameHex(0x01, [(roll / 180) * 32768, (pitch / 180) * 32768, (yaw / 180) * 32768]) });
          const q = eulerToQuat(roll, pitch, yaw);
          this.store.ingest(c, { utc_ns: ns, raw_hex: buildImuFrameHex(0x02, q.map((v) => v * 32767)) });
          this.quality[c].frames += 2;
          this.quality[c].read_bytes += 34;
        }
      }
      st.six = (n - 1) / SIX_AXIS_HZ;
      this.store.tracks[c].rpm = this.rpmAt(c, tNow);
    }
  }

  /** Status snapshot in the exact shape of GET /api/gateways. */
  snapshot(): GatewaySnapshot {
    const now = nowNs();
    const tNow = Number((now - this.startNs) / 1000n) / 1e6;
    // the T3 collector occasionally rejects a corrupted frame
    if (Math.random() < 0.06) this.quality['usb-if04'].checksum_errors++;
    if (Math.random() < 0.03) this.quality['usb-if04'].discarded_bytes += 17;
    // firmware values are cached for 30 s, exactly like the real uploader
    if (tNow - this.lastFirmwareS >= 30) {
      this.lastFirmwareS = tNow;
      this.firmware = {
        throttled_hex: '0x0',
        ext5v_v: 5.07 + 0.02 * Math.random(),
        sample: String(now),
      };
    }
    const channels = Object.fromEntries(
      CHANNELS.map((c) => {
        const tr = this.store.tracks[c];
        const q = this.quality[c];
        const latestHex = tr.lastParsed?.rawHex ?? null;
        return [
          c,
          {
            updated_utc_ns: String(now),
            running: true,
            frames: q.frames,
            segments: Math.floor(tNow / 60),
            quality: {
              checksum_errors: q.checksum_errors,
              length_errors: q.length_errors,
              discarded_bytes: q.discarded_bytes,
              incomplete_bytes: q.incomplete_bytes,
            },
            read_bytes: q.read_bytes,
            queue_bytes: 0,
            queue_peak_bytes: 600,
            latest: latestHex && tr.lastNs !== null ? { utc_ns: String(tr.lastNs), raw_hex: latestHex } : null,
          },
        ];
      })
    );
    return {
      gateway_id: SIM_GATEWAY_ID,
      online: true,
      received_utc_ns: String(now),
      status: {
        channels,
        host: {
          boot_utc_ns: String(this.startNs - 7_384_000_000_000n),
          uptime_sec: 7384 + tNow,
          cpu_temp_mc: Math.round(51200 + 2500 * Math.sin(tNow / 50) + 400 * Math.random()),
          disk_used_percent: 37.4,
          throttled_hex: this.firmware.throttled_hex,
          ext5v_v: this.firmware.ext5v_v,
          undervoltage_alarm: false,
          firmware_sample_utc_ns: this.firmware.sample,
        },
      },
    };
  }
}
