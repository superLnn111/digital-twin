/** Wire types of the wind-cloud API (docs/api-contract.md). All *_ns fields are decimal strings. */

export const CHANNELS = ['usb-if00', 'usb-if02', 'usb-if04', 'usb-if06'] as const;
export type ChannelId = (typeof CHANNELS)[number];

export const CHANNEL_LABEL: Record<ChannelId, string> = {
  'usb-if00': 'T1',
  'usb-if02': 'T2',
  'usb-if04': 'T3',
  'usb-if06': 'T4',
};

export interface LatestFrame {
  utc_ns: string;
  monotonic_ns?: string;
  message_id?: number;
  raw_hex: string;
}

/** Status channel object as posted by the gateway uploader; every field may be missing. */
export interface ChannelStatusWire {
  updated_utc_ns?: string | null;
  running?: boolean | null;
  frames?: number | null;
  segments?: number | null;
  quality?: Record<string, unknown> | null;
  read_bytes?: number | null;
  queue_bytes?: number | null;
  queue_peak_bytes?: number | null;
  latest?: LatestFrame | null;
  [extra: string]: unknown;
}

export interface GatewayStatusWire {
  channels?: Record<string, ChannelStatusWire | null>;
  host?: Record<string, unknown> | null;
  [extra: string]: unknown;
}

export interface GatewaySnapshot {
  gateway_id: string;
  /** Only: the cloud received an upload within 5 s. Says nothing about sensors. */
  online: boolean;
  received_utc_ns: string | null;
  status: GatewayStatusWire | null;
}

export interface SessionSummary {
  gateway_id: string;
  session_id: string;
  segments: number;
  frames: number;
  start_ns: string | null;
  end_ns: string | null;
  checksum_errors: number;
  length_errors: number;
  discarded_bytes: number;
  incomplete_bytes: number;
}

export interface FrameRecord {
  segment_id: string;
  session_id: string;
  utc_ns: string;
  monotonic_ns: string;
  message_id: number;
  raw_hex: string;
  time_basis: string;
}

export interface FramesPage {
  frames: FrameRecord[];
  next_cursor: string | null;
}

export interface FramesQuery {
  gateway_id: string;
  channel_id: string;
  session_id?: string;
  since_ns?: string;
  until_ns?: string;
  message_id?: number;
  limit?: number;
}
