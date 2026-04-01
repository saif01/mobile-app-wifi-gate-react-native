import * as LocalAuthentication from 'expo-local-authentication';

export async function isBiometricAvailable(): Promise<boolean> {
  const has = await LocalAuthentication.hasHardwareAsync();
  if (!has) return false;
  const enrolled = await LocalAuthentication.isEnrolledAsync();
  return enrolled;
}

export async function authenticateWithBiometrics(reason: string): Promise<{ ok: boolean; cancelled?: boolean }> {
  const result = await LocalAuthentication.authenticateAsync({
    promptMessage: reason,
    cancelLabel: 'Use password',
    disableDeviceFallback: false,
  });
  if (result.success) return { ok: true };
  if (result.error === 'user_cancel') return { ok: false, cancelled: true };
  return { ok: false, cancelled: false };
}
