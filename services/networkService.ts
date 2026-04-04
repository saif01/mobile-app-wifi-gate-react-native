import NetInfo from '@react-native-community/netinfo';
import * as ExpoNetwork from 'expo-network';
import * as Location from 'expo-location';
import { Platform } from 'react-native';

import type {
  AllowedWifiEntry,
  CurrentWifiInfo,
  NetworkSnapshot,
  WifiAccessEvaluation,
} from '@/types/models';

NetInfo.configure({ shouldFetchWiFiSSID: true });

type LocationPermissionState = {
  granted: boolean;
  canAskAgain: boolean;
};

function normalizeSsid(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase();
}

function normalizeIp(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase();
}

function pickSsid(details: Record<string, unknown> | null | undefined): string | null {
  if (!details) return null;
  const ssid = (details as { ssid?: string }).ssid;
  if (typeof ssid !== 'string') return null;
  const normalized = ssid.trim();
  if (!normalized || normalized === '<unknown ssid>') return null;
  return normalized;
}

function pickIp(details: Record<string, unknown> | null | undefined): string | null {
  if (!details) return null;
  const ip = (details as { ipAddress?: string }).ipAddress;
  return typeof ip === 'string' && ip.trim().length > 0 ? ip.trim() : null;
}

function deriveGateway(ipAddress: string | null): string | null {
  if (!ipAddress) return null;
  const parts = ipAddress.split('.');
  if (parts.length !== 4) return null;
  return `${parts[0]}.${parts[1]}.${parts[2]}.1`;
}

function pickExpoIp(ipAddress: string | null | undefined): string | null {
  if (typeof ipAddress !== 'string') return null;
  const normalized = ipAddress.trim();
  return normalized && normalized !== '0.0.0.0' ? normalized : null;
}

async function getLocationPermissionState(requestPermission: boolean): Promise<LocationPermissionState> {
  if (Platform.OS !== 'android') {
    return { granted: true, canAskAgain: false };
  }

  const current = await Location.getForegroundPermissionsAsync();
  if (current.granted || !requestPermission) {
    return {
      granted: current.granted,
      canAskAgain: current.canAskAgain ?? false,
    };
  }

  const requested = await Location.requestForegroundPermissionsAsync();
  return {
    granted: requested.granted,
    canAskAgain: requested.canAskAgain ?? false,
  };
}

export async function getCurrentWifiInfo(options?: {
  requestPermission?: boolean;
}): Promise<CurrentWifiInfo> {
  const permission = await getLocationPermissionState(options?.requestPermission === true);
  const netInfo = await NetInfo.fetch();
  const type = netInfo.type;
  const isWifi = type === 'wifi';
  const details = netInfo.details as Record<string, unknown> | undefined;
  const ip = pickIp(details) ?? undefined;
  const gateway = deriveGateway(ip ?? null) ?? undefined;
  const ssid =
    isWifi && permission.granted
      ? pickSsid(details) ?? undefined
      : undefined;

  let permissionMessage: string | undefined;
  if (Platform.OS === 'android' && !permission.granted) {
    permissionMessage = 'Location permission is required to detect WiFi network name.';
  } else if (isWifi && !ssid) {
    permissionMessage = 'WiFi name could not be detected on this device.';
  }

  return {
    isConnected: netInfo.isConnected === true,
    isWifi,
    ssid,
    ip,
    gateway,
    permissionGranted: permission.granted,
    canAskPermissionAgain: permission.canAskAgain,
    permissionMessage,
  };
}

export async function getNetworkSnapshot(): Promise<NetworkSnapshot> {
  const [netInfo, expoState, expoIp] = await Promise.all([
    NetInfo.fetch(),
    ExpoNetwork.getNetworkStateAsync().catch(() => null),
    ExpoNetwork.getIpAddressAsync().catch(() => null),
  ]);
  const type =
    netInfo.type === 'unknown' && expoState?.type
      ? expoState.type.toLowerCase()
      : netInfo.type;
  const isWifi = type === 'wifi' || expoState?.type === ExpoNetwork.NetworkStateType.WIFI;
  const isCellular = type === 'cellular' || expoState?.type === ExpoNetwork.NetworkStateType.CELLULAR;
  const details = netInfo.details as Record<string, unknown> | undefined;
  const ipAddress = pickIp(details) ?? pickExpoIp(expoIp);
  const gatewayIp = isWifi ? deriveGateway(ipAddress) : null;
  const isConnected =
    netInfo.isConnected === true ||
    expoState?.isConnected === true ||
    (Boolean(ipAddress) && type !== 'none');

  return {
    isConnected,
    type,
    isWifi,
    isCellular,
    ssid: isWifi ? pickSsid(details) : null,
    ipAddress,
    gatewayIp,
    cellularMayInterfere: Platform.OS === 'android' && isWifi,
  };
}

export function findDuplicateAllowedWifi(
  entries: AllowedWifiEntry[],
  candidate: Pick<AllowedWifiEntry, 'ssid' | 'ip'>,
  excludeId?: string
): AllowedWifiEntry | null {
  const candidateSsid = normalizeSsid(candidate.ssid);
  const candidateIp = normalizeIp(candidate.ip);

  if (!candidateSsid && !candidateIp) return null;

  for (const entry of entries) {
    if (excludeId && entry.id === excludeId) continue;
    const sameSsid = candidateSsid && normalizeSsid(entry.ssid) === candidateSsid;
    const sameIp = candidateIp && normalizeIp(entry.ip) === candidateIp;
    if (sameSsid || sameIp) return entry;
  }

  return null;
}

export function matchAllowedWifi(
  snapshot: Pick<NetworkSnapshot, 'isConnected' | 'isWifi' | 'ssid' | 'ipAddress' | 'gatewayIp'>,
  entries: AllowedWifiEntry[]
): AllowedWifiEntry | null {
  if (!snapshot.isWifi || !snapshot.isConnected) return null;

  const currentSsid = normalizeSsid(snapshot.ssid);
  const currentIp = normalizeIp(snapshot.ipAddress);
  const gatewayIp = normalizeIp(snapshot.gatewayIp);

  for (const entry of entries) {
    if (!entry.isActive) continue;
    const ssidMatches = currentSsid && normalizeSsid(entry.ssid) === currentSsid;
    const ipMatches =
      normalizeIp(entry.ip) &&
      (normalizeIp(entry.ip) === currentIp || normalizeIp(entry.ip) === gatewayIp);
    if (ssidMatches || ipMatches) return entry;
  }

  return null;
}

export function evaluateWifiAccess(
  snapshot: NetworkSnapshot,
  allowedWifi: AllowedWifiEntry[],
  noLoginWifi: AllowedWifiEntry[] = []
): WifiAccessEvaluation {
  const noLoginActive = noLoginWifi.filter((entry) => entry.isActive);
  if (noLoginActive.length > 0) {
    const noLoginMatch = matchAllowedWifi(snapshot, noLoginActive);
    if (noLoginMatch) {
      return {
        allowed: snapshot.isWifi && snapshot.isConnected,
        noRestriction: false,
        requiresWifiConnection: !snapshot.isWifi || !snapshot.isConnected,
        match: null,
        skipPortalAuth: true,
        noLoginMatch,
      };
    }
  }

  const activeEntries = allowedWifi.filter((entry) => entry.isActive);
  if (activeEntries.length === 0) {
    return {
      allowed: snapshot.isWifi && snapshot.isConnected,
      noRestriction: true,
      requiresWifiConnection: !snapshot.isWifi || !snapshot.isConnected,
      match: null,
      skipPortalAuth: false,
      noLoginMatch: null,
    };
  }

  const match = matchAllowedWifi(snapshot, activeEntries);
  return {
    allowed: Boolean(match),
    noRestriction: false,
    requiresWifiConnection: !snapshot.isWifi || !snapshot.isConnected,
    match,
    skipPortalAuth: false,
    noLoginMatch: null,
  };
}

/** Returns which list already contains the same SSID or IP as the candidate (if any). */
export function findWifiListConflict(
  candidate: Pick<AllowedWifiEntry, 'ssid' | 'ip'>,
  allowedWifi: AllowedWifiEntry[],
  noLoginWifi: AllowedWifiEntry[],
  excludeId?: string
): 'allowed' | 'noLogin' | null {
  if (findDuplicateAllowedWifi(allowedWifi, candidate, excludeId)) return 'allowed';
  if (findDuplicateAllowedWifi(noLoginWifi, candidate, excludeId)) return 'noLogin';
  return null;
}
