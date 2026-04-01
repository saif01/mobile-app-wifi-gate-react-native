import AsyncStorage from '@react-native-async-storage/async-storage';
import { ACTIVITY_LOG_MAX, STORAGE_KEYS } from '@/constants/defaults';
import type { ActivityLogEntry, ActivityLogLevel } from '@/types/models';

const KEY = `${STORAGE_KEYS.SETTINGS_V1}_logs`;

async function readAll(): Promise<ActivityLogEntry[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ActivityLogEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeAll(entries: ActivityLogEntry[]) {
  await AsyncStorage.setItem(KEY, JSON.stringify(entries.slice(0, ACTIVITY_LOG_MAX)));
}

export async function appendActivityLog(
  level: ActivityLogLevel,
  message: string,
  meta?: ActivityLogEntry['meta']
): Promise<void> {
  const entry: ActivityLogEntry = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    ts: Date.now(),
    level,
    message,
    meta,
  };
  const all = await readAll();
  all.unshift(entry);
  await writeAll(all);
}

export async function getActivityLogs(): Promise<ActivityLogEntry[]> {
  return readAll();
}

export async function clearActivityLogs(): Promise<void> {
  await AsyncStorage.removeItem(KEY);
}
