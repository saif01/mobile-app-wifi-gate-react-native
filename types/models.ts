export type ActivityLogLevel = 'info' | 'warn' | 'error' | 'success';

export interface ActivityLogEntry {
  id: string;
  ts: number;
  level: ActivityLogLevel;
  message: string;
  meta?: Record<string, string | number | boolean | undefined>;
}

export interface AllowedWifiEntry {
  id: string;
  ssid: string;
  /** Substring match on default gateway IP (e.g. "10.64.4.") */
  gatewayMatch?: string;
  remarks?: string;
  active: boolean;
}

export interface NetworkSnapshot {
  isConnected: boolean;
  type: string | null;
  isWifi: boolean;
  isCellular: boolean;
  ssid: string | null;
  ipAddress: string | null;
  gatewayIp: string | null;
  /** True when both WiFi and cellular may be active (Android dual transport). */
  cellularMayInterfere: boolean;
}

export type FirewallLoginFailureReason =
  | 'unauthorized_wifi'
  | 'invalid_credentials'
  | 'timeout'
  | 'unreachable'
  | 'unexpected_response'
  | 'parse_error'
  | 'cancelled';

export interface FirewallLoginResult {
  ok: boolean;
  reason?: FirewallLoginFailureReason;
  message?: string;
  statusCode?: number;
}
