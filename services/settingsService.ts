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

export async function loadSettings(): Promise<AppSettings> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEYS.SETTINGS_V1);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw) as Partial<AppSettings>;
    return {
      ...DEFAULTS,
      ...parsed,
      firewallEndpoint: normalizeEndpointUrl(parsed.firewallEndpoint ?? DEFAULTS.firewallEndpoint),
      allowedWifi: Array.isArray(parsed.allowedWifi) ? parsed.allowedWifi : [],
      lastLoginAt:
        typeof parsed.lastLoginAt === 'number' ? parsed.lastLoginAt : null,
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
