import NetInfo from '@react-native-community/netinfo';
import type { AllowedWifiEntry, NetworkSnapshot } from '@/types/models';
import { Platform } from 'react-native';

function pickSsid(details: Record<string, unknown> | null | undefined): string | null {
  if (!details) return null;
  const ssid = (details as { ssid?: string }).ssid;
  return typeof ssid === 'string' && ssid.length > 0 ? ssid : null;
}

function pickIp(details: Record<string, unknown> | null | undefined): string | null {
  if (!details) return null;
  const ip = (details as { ipAddress?: string }).ipAddress;
  return typeof ip === 'string' && ip.length > 0 ? ip : null;
}

/** Gateway is not always exposed by NetInfo; use optional subnet hints from ip. */
export async function getNetworkSnapshot(): Promise<NetworkSnapshot> {
  const netInfo = await NetInfo.fetch();

  const type = netInfo.type;
  const isWifi = type === 'wifi';
  const isCellular = type === 'cellular';
  const details = netInfo.details as Record<string, unknown> | undefined;

  const ssid = isWifi ? pickSsid(details) : null;
  const ipAddress = pickIp(details);

  /** OS cannot reliably expose dual WiFi+cellular; Android users get a soft hint when on Wi‑Fi. */
  const cellularMayInterfere = Platform.OS === 'android' && isWifi;

  let gatewayIp: string | null = null;
  if (ipAddress && isWifi) {
    const parts = ipAddress.split('.');
    if (parts.length === 4) {
      gatewayIp = `${parts[0]}.${parts[1]}.${parts[2]}.1`;
    }
  }

  return {
    isConnected: netInfo.isConnected === true,
    type,
    isWifi,
    isCellular,
    ssid,
    ipAddress,
    gatewayIp,
    cellularMayInterfere,
  };
}

export function matchAllowedWifi(
  snapshot: NetworkSnapshot,
  entries: AllowedWifiEntry[]
): AllowedWifiEntry | null {
  if (!snapshot.isWifi || !snapshot.isConnected) return null;
  const active = entries.filter((e) => e.active);
  for (const e of active) {
    const ssidOk =
      e.ssid &&
      snapshot.ssid &&
      snapshot.ssid.trim().toLowerCase() === e.ssid.trim().toLowerCase();
    const gatewayOk =
      e.gatewayMatch &&
      ((snapshot.gatewayIp && snapshot.gatewayIp.includes(e.gatewayMatch)) ||
        (snapshot.ipAddress && snapshot.ipAddress.includes(e.gatewayMatch)));
    if (ssidOk || gatewayOk) return e;
  }
  return null;
}
