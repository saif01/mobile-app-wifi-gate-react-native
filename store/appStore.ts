import { create } from 'zustand';

import { DEFAULT_FIREWALL_ENDPOINT } from '@/constants/defaults';
import { performFirewallLogout } from '@/services/firewallLogin';
import { evaluateWifiAccess, getNetworkSnapshot } from '@/services/networkService';
import { loadSettings, saveLastLoginId, saveSettings, type AppSettings } from '@/services/settingsService';
import {
  getSavedCredentials,
  getBiometricEnabled,
  getManualLoginCompleted,
  hasSavedCredentials,
  setBiometricEnabled,
  setManualLoginCompleted,
  setSessionAuthenticated,
  getSessionAuthenticated,
  storeSavedCredentials,
} from '@/services/secureCredentials';
import type { AuthAgentSnapshot, SavedCredentials } from '@/types/models';

export interface AppState {
  hydrated: boolean;
  settings: AppSettings;
  isAuthenticated: boolean;
  lastLoginAt: number | null;
  lastLoginId: string;
  biometricEnabled: boolean;
  biometricCredentialsStored: boolean;
  storedCredentialsAvailable: boolean;
  manualLoginDone: boolean;
  authAgent: AuthAgentSnapshot;
  /** True after the first post-hydrate network/auth sync (splash waits on this). */
  authBootstrapComplete: boolean;
  autoLoginPausedUntilDisconnect: boolean;
  pendingBiometricCredentials: SavedCredentials | null;
  pendingPortalLogin:
    | {
        userId: string;
        password: string;
        source: 'manual' | 'biometric';
      }
    | null;

  hydrate: () => Promise<void>;
  setSettings: (partial: Partial<AppSettings>) => Promise<void>;
  setAuthenticated: (v: boolean, lastLoginAt?: number) => Promise<void>;
  recordSuccessfulManualLogin: (userId: string, password: string) => Promise<number>;
  markStoredCredentialLogin: (userId: string, password: string, lastLoginAt?: number) => Promise<number>;
  enableBiometricAfterSuccessfulLogin: () => Promise<boolean>;
  disableBiometric: () => Promise<void>;
  clearSession: () => Promise<void>;
  isBiometricLoginAvailable: () => boolean;
  updateAuthAgent: (partial: Partial<AuthAgentSnapshot>) => void;
  setAuthBootstrapComplete: (complete: boolean) => void;
  setAutoLoginPausedUntilDisconnect: (paused: boolean) => void;
  beginPortalLoginFallback: (userId: string, password: string, source: 'manual' | 'biometric') => void;
  clearPortalLoginFallback: () => void;
}

export const useAppStore = create<AppState>((set, get) => ({
  hydrated: false,
  settings: {
    firewallEndpoint: DEFAULT_FIREWALL_ENDPOINT,
    allowedWifi: [],
    noLoginWifi: [],
    lastLoginId: '',
    warnCellularInterference: true,
    autoLoginEnabled: true,
    lastLoginAt: null,
  },
  isAuthenticated: false,
  lastLoginAt: null,
  lastLoginId: '',
  biometricEnabled: false,
  biometricCredentialsStored: false,
  storedCredentialsAvailable: false,
  manualLoginDone: false,
  authAgent: {
    status: 'idle',
    message: 'Waiting for network changes.',
    targetSsid: null,
    lastCheckedAt: null,
    lastAttemptAt: null,
  },
  authBootstrapComplete: false,
  autoLoginPausedUntilDisconnect: false,
  pendingBiometricCredentials: null,
  pendingPortalLogin: null,

  hydrate: async () => {
    const settings = await loadSettings();
    const [session, storedBiometricEnabled, manualLoginDone, storedCredentials, biometricCredentialsStored] = await Promise.all([
      getSessionAuthenticated(),
      getBiometricEnabled(),
      getManualLoginCompleted(),
      getSavedCredentials(),
      hasSavedCredentials(),
    ]);

    const biometricEnabled = Boolean(storedBiometricEnabled && biometricCredentialsStored);
    if (storedBiometricEnabled !== biometricEnabled) {
      await setBiometricEnabled(biometricEnabled);
    }

    set({
      hydrated: true,
      settings,
      isAuthenticated: session,
      lastLoginAt: settings.lastLoginAt,
      lastLoginId: settings.lastLoginId,
      biometricEnabled,
      biometricCredentialsStored,
      storedCredentialsAvailable: storedCredentials !== null,
      manualLoginDone,
      authAgent: {
        status: session ? 'authenticated' : 'idle',
        message: session ? 'Stored session restored.' : 'Waiting for network changes.',
        targetSsid: null,
        lastCheckedAt: Date.now(),
        lastAttemptAt: null,
      },
      authBootstrapComplete: false,
      autoLoginPausedUntilDisconnect: false,
      pendingBiometricCredentials: null,
      pendingPortalLogin: null,
    });
  },

  setSettings: async (partial) => {
    const next = await saveSettings(partial);
    set({ settings: next });
  },

  setAuthenticated: async (v, lastLoginAt) => {
    await setSessionAuthenticated(v);
    const ts = v ? lastLoginAt ?? Date.now() : null;
    if (v && ts) {
      const next = await saveSettings({ lastLoginAt: ts });
      set({ isAuthenticated: true, lastLoginAt: ts, settings: next });
    } else {
      const next = await saveSettings({ lastLoginAt: null });
      set({ isAuthenticated: false, lastLoginAt: null, settings: next });
    }
  },

  recordSuccessfulManualLogin: async (userId, password) => {
    const ts = Date.now();
    const next = await saveLastLoginId(userId);
    await storeSavedCredentials(userId, password, ts);

    let biometricCredentialsStored = get().biometricCredentialsStored;
    if (get().biometricEnabled) {
      await storeSavedCredentials(userId, password, ts);
      biometricCredentialsStored = true;
    }

    await setManualLoginCompleted(true);
    set({
      settings: next,
      lastLoginId: userId,
      manualLoginDone: true,
      storedCredentialsAvailable: true,
      biometricCredentialsStored,
      autoLoginPausedUntilDisconnect: false,
      pendingBiometricCredentials: {
        userId,
        password,
        lastLoginAt: new Date(ts).toISOString(),
      },
    });
    return ts;
  },

  markStoredCredentialLogin: async (userId, password, lastLoginAt) => {
    const ts = lastLoginAt ?? Date.now();
    const next = await saveLastLoginId(userId);
    await storeSavedCredentials(userId, password, ts);
    set({
      settings: next,
      lastLoginId: userId,
      storedCredentialsAvailable: true,
      autoLoginPausedUntilDisconnect: false,
    });
    return ts;
  },

  enableBiometricAfterSuccessfulLogin: async () => {
    const pending = get().pendingBiometricCredentials;
    if (pending) {
      await storeSavedCredentials(pending.userId, pending.password, Date.parse(pending.lastLoginAt) || Date.now());
      await setBiometricEnabled(true);
      set({
        biometricEnabled: true,
        biometricCredentialsStored: true,
        pendingBiometricCredentials: null,
      });
      return true;
    }

    if (get().biometricCredentialsStored) {
      await setBiometricEnabled(true);
      set({ biometricEnabled: true });
      return true;
    }

    return false;
  },

  disableBiometric: async () => {
    await setBiometricEnabled(false);
    set({
      biometricEnabled: false,
      pendingBiometricCredentials: null,
    });
  },

  clearSession: async () => {
    const { settings, lastLoginId } = get();
    const saved = await getSavedCredentials();
    const portalUser = (saved?.userId ?? lastLoginId)?.trim() || undefined;
    const snapshot = await getNetworkSnapshot();
    const access = evaluateWifiAccess(snapshot, settings.allowedWifi, settings.noLoginWifi);
    if (!access.skipPortalAuth) {
      await performFirewallLogout(settings.firewallEndpoint, portalUser).catch(() => {});
    }

    await setSessionAuthenticated(false);
    const next = await saveSettings({ lastLoginAt: null });
    set({
      isAuthenticated: false,
      lastLoginAt: null,
      settings: next,
      autoLoginPausedUntilDisconnect: true,
      pendingBiometricCredentials: null,
    });
  },

  isBiometricLoginAvailable: () => {
    const state = get();
    return state.biometricEnabled && state.biometricCredentialsStored;
  },

  updateAuthAgent: (partial) => {
    set((state) => ({
      authAgent: {
        ...state.authAgent,
        ...partial,
      },
    }));
  },

  setAuthBootstrapComplete: (complete) => {
    set({ authBootstrapComplete: complete });
  },

  setAutoLoginPausedUntilDisconnect: (paused) => {
    set({ autoLoginPausedUntilDisconnect: paused });
  },

  beginPortalLoginFallback: (userId, password, source) => {
    set({
      pendingPortalLogin: {
        userId,
        password,
        source,
      },
    });
  },

  clearPortalLoginFallback: () => {
    set({ pendingPortalLogin: null });
  },
}));
