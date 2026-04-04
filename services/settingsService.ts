import AsyncStorage from '@react-native-async-storage/async-storage';
import { DEFAULT_FIREWALL_ENDPOINT, STORAGE_KEYS } from '@/constants/defaults';
import { normalizeEndpointUrl } from '@/utils/endpoint';
import type { AllowedWifiEntry } from '@/types/models';

export interface AppSettings {
  firewallEndpoint: string;
  allowedWifi: AllowedWifiEntry[];
  lastLoginId: string;
  /** Prefer WiFi path; warn when cellular may interfere */
  warnCellularInterference: boolean;
  autoLoginEnabled: boolean;
  lastLoginAt: number | null;
}

const DEFAULTS: AppSettings = {
  firewallEndpoint: DEFAULT_FIREWALL_ENDPOINT,
  allowedWifi: [],
  lastLoginId: '',
  warnCellularInterference: true,
  autoLoginEnabled: true,
  lastLoginAt: null,
};

function canonicalizeFirewallEndpoint(value: string | undefined): string {
  const normalized = normalizeEndpointUrl(value ?? DEFAULTS.firewallEndpoint);
  if (normalized === 'http://10.64.4.253:8090' || normalized === 'https://10.64.4.253:8090') {
    return `${normalized}/httpclient.html`;
  }
  return normalized;
}

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
    const next: AppSettings = {
      ...DEFAULTS,
      ...parsed,
      firewallEndpoint: canonicalizeFirewallEndpoint(parsed.firewallEndpoint),
      allowedWifi,
      lastLoginId: typeof parsed.lastLoginId === 'string' ? parsed.lastLoginId : '',
      autoLoginEnabled: typeof parsed.autoLoginEnabled === 'boolean' ? parsed.autoLoginEnabled : DEFAULTS.autoLoginEnabled,
      lastLoginAt: typeof parsed.lastLoginAt === 'number' ? parsed.lastLoginAt : null,
    };
    if (JSON.stringify(next) !== JSON.stringify({ ...DEFAULTS, ...parsed, allowedWifi })) {
      await AsyncStorage.setItem(STORAGE_KEYS.SETTINGS_V1, JSON.stringify(next));
    }
    return next;
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
      ? canonicalizeFirewallEndpoint(partial.firewallEndpoint)
      : current.firewallEndpoint,
    allowedWifi: partial.allowedWifi ?? current.allowedWifi,
  };
  await AsyncStorage.setItem(STORAGE_KEYS.SETTINGS_V1, JSON.stringify(next));
  return next;
}

export async function saveLastLoginId(lastLoginId: string): Promise<AppSettings> {
  return await saveSettings({ lastLoginId });
}

export async function getLastLoginId(): Promise<string> {
  const settings = await loadSettings();
  return settings.lastLoginId;
}
