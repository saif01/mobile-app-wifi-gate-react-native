import { create } from 'zustand';
import { loadSettings, saveSettings, type AppSettings } from '@/services/settingsService';
import {
  clearCredentials,
  getBiometricEnabled,
  getManualLoginCompleted,
  getSessionAuthenticated,
  loadCredentials,
  saveCredentials,
  setBiometricEnabled,
  setManualLoginCompleted,
  setSessionAuthenticated,
} from '@/services/secureCredentials';

export interface AppState {
  hydrated: boolean;
  settings: AppSettings;
  isAuthenticated: boolean;
  lastLoginAt: number | null;
  biometricEnabled: boolean;
  manualLoginDone: boolean;
  /** In-memory only; secrets loaded on demand via SecureStore */
  snapshotUserId: string | null;

  hydrate: () => Promise<void>;
  setSettings: (partial: Partial<AppSettings>) => Promise<void>;
  setAuthenticated: (v: boolean, lastLoginAt?: number) => Promise<void>;
  saveUserPassword: (userId: string, password: string, remember: boolean) => Promise<void>;
  clearSession: () => Promise<void>;
  setBiometric: (v: boolean) => Promise<void>;
  loadCredentialPreview: () => Promise<void>;
}

export const useAppStore = create<AppState>((set, get) => ({
  hydrated: false,
  settings: {
    firewallEndpoint: 'http://10.64.4.253:8090',
    allowedWifi: [],
    rememberCredentials: true,
    warnCellularInterference: true,
    lastLoginAt: null,
  },
  isAuthenticated: false,
  lastLoginAt: null,
  biometricEnabled: false,
  manualLoginDone: false,
  snapshotUserId: null,

  hydrate: async () => {
    const settings = await loadSettings();
    const [session, bio, manual] = await Promise.all([
      getSessionAuthenticated(),
      getBiometricEnabled(),
      getManualLoginCompleted(),
    ]);
    const creds = settings.rememberCredentials ? await loadCredentials() : null;
    set({
      hydrated: true,
      settings,
      isAuthenticated: session,
      lastLoginAt: settings.lastLoginAt,
      biometricEnabled: bio,
      manualLoginDone: manual,
      snapshotUserId: creds?.userId ?? null,
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

  saveUserPassword: async (userId, password, remember) => {
    if (remember) {
      await saveCredentials(userId, password);
    } else {
      await clearCredentials();
    }
    set({ snapshotUserId: remember ? userId : null });
  },

  clearSession: async () => {
    await setSessionAuthenticated(false);
    await clearCredentials();
    const next = await saveSettings({ lastLoginAt: null });
    set({ isAuthenticated: false, lastLoginAt: null, snapshotUserId: null, settings: next });
  },

  setBiometric: async (v) => {
    await setBiometricEnabled(v);
    set({ biometricEnabled: v });
  },

  loadCredentialPreview: async () => {
    const s = get().settings;
    if (!s.rememberCredentials) {
      set({ snapshotUserId: null });
      return;
    }
    const c = await loadCredentials();
    set({ snapshotUserId: c?.userId ?? null });
  },
}));

export async function markManualLoginSuccess() {
  await setManualLoginCompleted(true);
  useAppStore.setState({ manualLoginDone: true });
}
