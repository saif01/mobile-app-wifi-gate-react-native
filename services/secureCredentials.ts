import * as SecureStore from 'expo-secure-store';
import { STORAGE_KEYS } from '@/constants/defaults';
import type { SavedCredentials } from '@/types/models';

export async function saveSuccessfulCredentials(userId: string, password: string, lastLoginAt: number): Promise<void> {
  await SecureStore.setItemAsync(STORAGE_KEYS.CRED_USER, userId, {
    keychainAccessible: SecureStore.WHEN_UNLOCKED,
  });
  await SecureStore.setItemAsync(STORAGE_KEYS.CRED_PASS, password, {
    keychainAccessible: SecureStore.WHEN_UNLOCKED,
  });
  await SecureStore.setItemAsync(STORAGE_KEYS.CRED_META, new Date(lastLoginAt).toISOString(), {
    keychainAccessible: SecureStore.WHEN_UNLOCKED,
  });
}

export async function getSavedCredentials(): Promise<SavedCredentials | null> {
  const userId = await SecureStore.getItemAsync(STORAGE_KEYS.CRED_USER);
  const password = await SecureStore.getItemAsync(STORAGE_KEYS.CRED_PASS);
  const lastLoginAt = await SecureStore.getItemAsync(STORAGE_KEYS.CRED_META);
  if (!userId || !password) return null;
  return {
    userId,
    password,
    lastLoginAt: lastLoginAt ?? new Date(0).toISOString(),
  };
}

export async function clearSavedCredentials(): Promise<void> {
  await SecureStore.deleteItemAsync(STORAGE_KEYS.CRED_USER);
  await SecureStore.deleteItemAsync(STORAGE_KEYS.CRED_PASS);
  await SecureStore.deleteItemAsync(STORAGE_KEYS.CRED_META);
}

export async function hasSavedCredentials(): Promise<boolean> {
  return (await getSavedCredentials()) !== null;
}

export async function setSessionAuthenticated(flag: boolean): Promise<void> {
  if (flag) {
    await SecureStore.setItemAsync(STORAGE_KEYS.SESSION_FLAG, '1');
  } else {
    await SecureStore.deleteItemAsync(STORAGE_KEYS.SESSION_FLAG);
  }
}

export async function getSessionAuthenticated(): Promise<boolean> {
  const v = await SecureStore.getItemAsync(STORAGE_KEYS.SESSION_FLAG);
  return v === '1';
}

export async function setBiometricEnabled(flag: boolean): Promise<void> {
  await SecureStore.setItemAsync(STORAGE_KEYS.BIOMETRIC_ENABLED, flag ? '1' : '0');
}

export async function getBiometricEnabled(): Promise<boolean> {
  const v = await SecureStore.getItemAsync(STORAGE_KEYS.BIOMETRIC_ENABLED);
  return v === '1';
}

export async function setManualLoginCompleted(flag: boolean): Promise<void> {
  await SecureStore.setItemAsync(STORAGE_KEYS.MANUAL_LOGIN_DONE, flag ? '1' : '0');
}

export async function getManualLoginCompleted(): Promise<boolean> {
  const v = await SecureStore.getItemAsync(STORAGE_KEYS.MANUAL_LOGIN_DONE);
  return v === '1';
}
