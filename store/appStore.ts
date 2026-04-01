import { create } from 'zustand';

import { loadSettings, saveSettings, type AppSettings } from '@/services/settingsService';
import {
  clearSavedCredentials,
  getBiometricEnabled,
  getManualLoginCompleted,
  getSavedCredentials,
  getSessionAuthenticated,
  hasSavedCredentials,
  saveSuccessfulCredentials,
  setBiometricEnabled,
  setManualLoginCompleted,
  setSessionAuthenticated,
} from '@/services/secureCredentials';
import type { SavedCredentials } from '@/types/models';

export interface AppState {
  hydrated: boolean;
  settings: AppSettings;
  isAuthenticated: boolean;
  lastLoginAt: number | null;
  biometricEnabled: boolean;
  manualLoginDone: boolean;
  savedCredentials: SavedCredentials | null;

  hydrate: () => Promise<void>;
  setSettings: (partial: Partial<AppSettings>) => Promise<void>;
  setAuthenticated: (v: boolean, lastLoginAt?: number) => Promise<void>;
  setRememberMe: (enabled: boolean) => Promise<void>;
  saveSuccessfulLogin: (userId: string, password: string) => Promise<number>;
  clearSession: () => Promise<void>;
  setBiometric: (v: boolean) => Promise<void>;
  refreshSavedCredentials: () => Promise<void>;
  isBiometricLoginAvailable: () => Promise<boolean>;
}

async function getEffectiveSavedCredentials(rememberMe: boolean): Promise<SavedCredentials | null> {
  if (!rememberMe) return null;
  return await getSavedCredentials();
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
  savedCredentials: null,

  hydrate: async () => {
    const settings = await loadSettings();
    const [session, storedBiometric, manualLoginDone, savedCredentials] = await Promise.all([
      getSessionAuthenticated(),
      getBiometricEnabled(),
      getManualLoginCompleted(),
      getEffectiveSavedCredentials(settings.rememberCredentials),
    ]);

    const biometricEnabled = Boolean(storedBiometric && settings.rememberCredentials && savedCredentials);
    if (storedBiometric !== biometricEnabled) {
      await setBiometricEnabled(biometricEnabled);
    }

    set({
      hydrated: true,
      settings,
      isAuthenticated: session,
      lastLoginAt: settings.lastLoginAt,
      biometricEnabled,
      manualLoginDone,
      savedCredentials,
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

  setRememberMe: async (enabled) => {
    const next = await saveSettings({ rememberCredentials: enabled });

    if (!enabled) {
      await clearSavedCredentials();
      await setBiometricEnabled(false);
      set({
        settings: next,
        savedCredentials: null,
        biometricEnabled: false,
      });
      return;
    }

    const savedCredentials = await getSavedCredentials();
    set({
      settings: next,
      savedCredentials,
    });
  },

  saveSuccessfulLogin: async (userId, password) => {
    const remember = get().settings.rememberCredentials;
    const ts = Date.now();

    if (remember) {
      await saveSuccessfulCredentials(userId, password, ts);
    } else {
      await clearSavedCredentials();
    }

    const savedCredentials = await getEffectiveSavedCredentials(remember);
    await setManualLoginCompleted(true);
    set({
      manualLoginDone: true,
      savedCredentials,
    });
    return ts;
  },

  clearSession: async () => {
    await setSessionAuthenticated(false);
    const next = await saveSettings({ lastLoginAt: null });

    const remember = get().settings.rememberCredentials;
    if (!remember) {
      await clearSavedCredentials();
    }

    const savedCredentials = await getEffectiveSavedCredentials(remember);
    const biometricEnabled = Boolean(get().biometricEnabled && remember && savedCredentials);
    if (get().biometricEnabled !== biometricEnabled) {
      await setBiometricEnabled(biometricEnabled);
    }

    set({
      isAuthenticated: false,
      lastLoginAt: null,
      settings: next,
      savedCredentials,
      biometricEnabled,
    });
  },

  setBiometric: async (v) => {
    const state = get();
    const next = Boolean(v && state.settings.rememberCredentials && state.savedCredentials);
    await setBiometricEnabled(next);
    set({ biometricEnabled: next });
  },

  refreshSavedCredentials: async () => {
    const remember = get().settings.rememberCredentials;
    const savedCredentials = await getEffectiveSavedCredentials(remember);
    const biometricEnabled = Boolean(get().biometricEnabled && remember && savedCredentials);
    if (get().biometricEnabled !== biometricEnabled) {
      await setBiometricEnabled(biometricEnabled);
    }
    set({
      savedCredentials,
      biometricEnabled,
    });
  },

  isBiometricLoginAvailable: async () => {
    const state = get();
    if (!state.settings.rememberCredentials || !state.biometricEnabled) {
      return false;
    }
    if (state.savedCredentials) {
      return true;
    }
    return await hasSavedCredentials();
  },
}));
