import AsyncStorage from '@react-native-async-storage/async-storage';
import { DEFAULT_FIREWALL_ENDPOINT, STORAGE_KEYS } from '@/constants/defaults';
import { normalizeEndpointUrl } from '@/utils/endpoint';
import type { AllowedWifiEntry } from '@/types/models';

export interface AppSettings {
  firewallEndpoint: string;
  allowedWifi: AllowedWifiEntry[];
  rememberCredentials: boolean;
  /** Prefer WiFi path; warn when cellular may interfere */
  warnCellularInterference: boolean;
  lastLoginAt: number | null;
}

const DEFAULTS: AppSettings = {
  firewallEndpoint: DEFAULT_FIREWALL_ENDPOINT,
  allowedWifi: [],
  rememberCredentials: true,
  warnCellularInterference: true,
  lastLoginAt: null,
};

function normalizeAllowedWifiEntry(entry: unknown): AllowedWifiEntry | null {
  if (!entry || typeof entry !== 'object') return null;

  const candidate = entry as {
    id?: unknown;
    ssid?: unknown;
    ip?: unknown;
    gatewayMatch?: unknown;
    remarks?: unknown;
    isActive?: unknown;
    active?: unknown;
  };

  const id = typeof candidate.id === 'string' && candidate.id.trim().length > 0 ? candidate.id : null;
  if (!id) return null;

  const ssid = typeof candidate.ssid === 'string' ? candidate.ssid.trim() : '';
  const ipSource = typeof candidate.ip === 'string' ? candidate.ip : candidate.gatewayMatch;
  const ip = typeof ipSource === 'string' && ipSource.trim().length > 0 ? ipSource.trim() : undefined;
  const remarks =
    typeof candidate.remarks === 'string' && candidate.remarks.trim().length > 0
      ? candidate.remarks.trim()
      : undefined;
  const isActive =
    typeof candidate.isActive === 'boolean'
      ? candidate.isActive
      : typeof candidate.active === 'boolean'
        ? candidate.active
        : true;

  if (!ssid && !ip) return null;

  return {
    id,
    ssid,
    ip,
    remarks,
    isActive,
  };
}

export async function loadSettings(): Promise<AppSettings> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEYS.SETTINGS_V1);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw) as Partial<AppSettings>;
    const allowedWifi = Array.isArray(parsed.allowedWifi)
      ? parsed.allowedWifi
          .map((entry) => normalizeAllowedWifiEntry(entry))
          .filter((entry): entry is AllowedWifiEntry => entry !== null)
      : [];
    return {
      ...DEFAULTS,
      ...parsed,
      firewallEndpoint: normalizeEndpointUrl(parsed.firewallEndpoint ?? DEFAULTS.firewallEndpoint),
      allowedWifi,
      lastLoginAt: typeof parsed.lastLoginAt === 'number' ? parsed.lastLoginAt : null,
    };
  } catch {
    return { ...DEFAULTS };
  }
}

export async function saveSettings(partial: Partial<AppSettings>): Promise<AppSettings> {
  const current = await loadSettings();
  const next: AppSettings = {
    ...current,
    ...partial,
    firewallEndpoint: partial.firewallEndpoint
      ? normalizeEndpointUrl(partial.firewallEndpoint)
      : current.firewallEndpoint,
    allowedWifi: partial.allowedWifi ?? current.allowedWifi,
  };
  await AsyncStorage.setItem(STORAGE_KEYS.SETTINGS_V1, JSON.stringify(next));
  return next;
}
