import type { AllowedWifiEntry, NetworkSnapshot, WifiAccessEvaluation } from '@/types/models';

import { evaluateWifiAccess, getNetworkSnapshot } from '@/services/networkService';

/** User-facing copy aligned with product requirements */
export const WIFI_GATE_MESSAGES = {
  notOnWifi: 'Not connected to WiFi.',
  wifiNotAllowed: 'Current WiFi is not allowed for login. Add this network under Settings → Allowed Wi‑Fi.',
} as const;

export type WifiLoginGateFailureCode = 'offline_or_no_wifi' | 'wifi_not_allowed';

export type WifiLoginGateResult =
  | { ok: true; snapshot: NetworkSnapshot; access: WifiAccessEvaluation }
  | {
      ok: false;
      code: WifiLoginGateFailureCode;
      message: string;
      snapshot: NetworkSnapshot;
      access: WifiAccessEvaluation;
    };

/**
 * Central gate for manual and automated portal login: device must be on Wi‑Fi and
 * satisfy allowed-network policy when the list is non-empty.
 */
export function evaluateWifiLoginGate(
  snapshot: NetworkSnapshot,
  allowedWifi: AllowedWifiEntry[]
): WifiLoginGateResult {
  const access = evaluateWifiAccess(snapshot, allowedWifi);

  if (!snapshot.isConnected || !snapshot.isWifi) {
    return {
      ok: false,
      code: 'offline_or_no_wifi',
      message: WIFI_GATE_MESSAGES.notOnWifi,
      snapshot,
      access,
    };
  }

  if (!access.allowed) {
    return {
      ok: false,
      code: 'wifi_not_allowed',
      message: WIFI_GATE_MESSAGES.wifiNotAllowed,
      snapshot,
      access,
    };
  }

  return { ok: true, snapshot, access };
}

export async function fetchWifiLoginGate(allowedWifi: AllowedWifiEntry[]): Promise<WifiLoginGateResult> {
  const snapshot = await getNetworkSnapshot();
  return evaluateWifiLoginGate(snapshot, allowedWifi);
}

export function wifiLoginGateLogMeta(gate: WifiLoginGateResult): Record<string, string | number | boolean | undefined> {
  return {
    ok: gate.ok,
    code: gate.ok ? 'ok' : gate.code,
    type: gate.snapshot.type ?? 'unknown',
    isConnected: gate.snapshot.isConnected,
    isWifi: gate.snapshot.isWifi,
    ssid: gate.snapshot.ssid ?? '',
    gateway: gate.snapshot.gatewayIp ?? '',
    noRestriction: gate.access.noRestriction,
  };
}
