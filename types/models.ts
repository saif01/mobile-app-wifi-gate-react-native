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
  ip?: string;
  remarks?: string;
  isActive: boolean;
}

export interface CurrentWifiInfo {
  isConnected: boolean;
  isWifi: boolean;
  ssid?: string;
  ip?: string;
  gateway?: string;
  permissionGranted: boolean;
  canAskPermissionAgain: boolean;
  permissionMessage?: string;
}

export interface SavedCredentials {
  userId: string;
  password: string;
  lastLoginAt: string;
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

export interface WifiAccessEvaluation {
  allowed: boolean;
  noRestriction: boolean;
  requiresWifiConnection: boolean;
  match: AllowedWifiEntry | null;
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
