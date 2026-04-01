import { zodResolver } from '@hookform/resolvers/zod';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Switch,
  TextInput,
  View,
} from 'react-native';
import { z } from 'zod';

import { PrimaryButton } from '@/components/ui/Button';
import { Screen } from '@/components/ui/Screen';
import { Body, Caption, Subtitle, Title } from '@/components/ui/Typography';
import { appendActivityLog } from '@/services/activityLog';
import { authenticateWithBiometrics, isBiometricAvailable } from '@/services/biometricService';
import { performFirewallLogin, mapFailureToMessage } from '@/services/firewallLogin';
import { getNetworkSnapshot, matchAllowedWifi } from '@/services/networkService';
import { loadCredentials } from '@/services/secureCredentials';
import { markManualLoginSuccess, useAppStore } from '@/store/appStore';

const schema = z.object({
  userId: z.string().min(1, 'ID is required'),
  password: z.string().min(1, 'Password is required'),
  remember: z.boolean(),
});

type FormValues = z.infer<typeof schema>;

export default function LoginScreen() {
  const settings = useAppStore((s) => s.settings);
  const saveUserPassword = useAppStore((s) => s.saveUserPassword);
  const setAuthenticated = useAppStore((s) => s.setAuthenticated);
  const setSettings = useAppStore((s) => s.setSettings);
  const biometricEnabled = useAppStore((s) => s.biometricEnabled);
  const manualLoginDone = useAppStore((s) => s.manualLoginDone);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [netHint, setNetHint] = useState<string | null>(null);
  const [showPass, setShowPass] = useState(false);
  const [bioAvailable, setBioAvailable] = useState(false);

  const { control, handleSubmit, setValue } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      userId: '',
      password: '',
      remember: settings.rememberCredentials,
    },
  });

  useEffect(() => {
    (async () => {
      setBioAvailable(await isBiometricAvailable());
    })();
  }, []);

  useEffect(() => {
    (async () => {
      if (!settings.rememberCredentials) return;
      const c = await loadCredentials();
      if (c) {
        setValue('userId', c.userId);
        setValue('password', c.password);
        setValue('remember', true);
      }
    })();
  }, [settings.rememberCredentials, setValue]);

  useEffect(() => {
    (async () => {
      const snap = await getNetworkSnapshot();
      const match = matchAllowedWifi(snap, settings.allowedWifi);
      if (settings.allowedWifi.length === 0) {
        setNetHint('No allowed Wi‑Fi networks configured. Add them in Settings.');
        return;
      }
      if (!snap.isWifi) {
        setNetHint('Connect to Wi‑Fi to use WiFiGate.');
        return;
      }
      if (!match) {
        setNetHint('Current Wi‑Fi is not in the allowed list.');
        return;
      }
      if (settings.warnCellularInterference && snap.cellularMayInterfere) {
        setNetHint('Android may route traffic over mobile data. Disable mobile data if login fails.');
        return;
      }
      setNetHint(null);
    })();
  }, [settings.allowedWifi, settings.warnCellularInterference]);

  const canUseBiometric = useMemo(
    () => bioAvailable && biometricEnabled && manualLoginDone && settings.rememberCredentials,
    [bioAvailable, biometricEnabled, manualLoginDone, settings.rememberCredentials]
  );

  async function runLoginFlow(userId: string, password: string, remember: boolean) {
    setBusy(true);
    setError(null);
    try {
      const snap = await getNetworkSnapshot();
      const match = matchAllowedWifi(snap, settings.allowedWifi);
      if (settings.allowedWifi.length === 0) {
        setError('Configure allowed Wi‑Fi networks first.');
        await appendActivityLog('warn', 'Login blocked: no allowed Wi‑Fi configured');
        return;
      }
      if (!snap.isWifi || !match) {
        setError('Connect to an allowed Wi‑Fi network before logging in.');
        await appendActivityLog('warn', 'Login blocked: Wi‑Fi not allowed');
        return;
      }
      await appendActivityLog('info', 'Firewall login attempt');
      const res = await performFirewallLogin({
        baseUrl: settings.firewallEndpoint,
        userId,
        password,
      });
      if (!res.ok) {
        const msg = mapFailureToMessage(res.reason);
        setError(res.message ?? msg);
        await appendActivityLog('error', 'Firewall login failed', { reason: res.reason ?? '' });
        return;
      }
      await setSettings({ rememberCredentials: remember });
      await saveUserPassword(userId, password, remember);
      await setAuthenticated(true, Date.now());
      await markManualLoginSuccess();
      await appendActivityLog('success', 'Firewall login success');
      router.replace('/dashboard');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unexpected error');
      await appendActivityLog('error', 'Login exception', { message: String(e) });
    } finally {
      setBusy(false);
    }
  }

  const onSubmit = handleSubmit((values) => runLoginFlow(values.userId, values.password, values.remember));

  async function onBiometric() {
    const auth = await authenticateWithBiometrics('Sign in to WiFiGate');
    if (!auth.ok) return;
    const creds = await loadCredentials();
    if (!creds) {
      setError('No saved credentials. Sign in manually once.');
      return;
    }
    await runLoginFlow(creds.userId, creds.password, true);
  }

  return (
    <Screen scroll>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.header}>
          <Title>WiFiGate</Title>
          <Subtitle>Sign in to the firewall portal</Subtitle>
        </View>

        {netHint ? (
          <View style={styles.banner}>
            <Body style={styles.bannerText}>{netHint}</Body>
          </View>
        ) : null}

        <Controller
          control={control}
          name="userId"
          render={({ field, fieldState }) => (
            <View style={styles.field}>
              <Caption>User ID</Caption>
              <TextInput
                value={field.value}
                onChangeText={field.onChange}
                autoCapitalize="none"
                autoCorrect={false}
                placeholder="ID"
                placeholderTextColor="#5c6b7d"
                style={styles.input}
              />
              {fieldState.error ? <Caption style={styles.err}>{fieldState.error.message}</Caption> : null}
            </View>
          )}
        />

        <Controller
          control={control}
          name="password"
          render={({ field, fieldState }) => (
            <View style={styles.field}>
              <Caption>Password</Caption>
              <View style={styles.row}>
                <TextInput
                  value={field.value}
                  onChangeText={field.onChange}
                  secureTextEntry={!showPass}
                  placeholder="Password"
                  placeholderTextColor="#5c6b7d"
                  style={[styles.input, styles.inputFlex]}
                />
                <Pressable onPress={() => setShowPass((v) => !v)} style={styles.eye}>
                  <Caption>{showPass ? 'Hide' : 'Show'}</Caption>
                </Pressable>
              </View>
              {fieldState.error ? <Caption style={styles.err}>{fieldState.error.message}</Caption> : null}
            </View>
          )}
        />

        <Controller
          control={control}
          name="remember"
          render={({ field }) => (
            <View style={styles.switchRow}>
              <Body>Remember credentials</Body>
              <Switch value={field.value} onValueChange={field.onChange} />
            </View>
          )}
        />

        {error ? (
          <View style={styles.bannerDanger}>
            <Body style={styles.bannerDangerText}>{error}</Body>
          </View>
        ) : null}

        <PrimaryButton title="Login" onPress={onSubmit} loading={busy} disabled={busy} />

        {canUseBiometric ? (
          <View style={styles.bio}>
            <PrimaryButton title="Login with biometrics" variant="ghost" onPress={onBiometric} disabled={busy} />
          </View>
        ) : null}

        <View style={styles.footer}>
          <Caption>
            Endpoint: {settings.firewallEndpoint}
            {'\n'}
            {biometricEnabled && !manualLoginDone
              ? 'Biometric unlock is available after a successful manual login.'
              : ''}
          </Caption>
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { marginTop: 12, marginBottom: 20 },
  banner: {
    backgroundColor: '#1a2430',
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#2a3441',
  },
  bannerText: { color: '#c7d0e0' },
  field: { marginBottom: 14 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  input: {
    marginTop: 6,
    backgroundColor: '#111a24',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: '#f2f5f9',
    borderWidth: 1,
    borderColor: '#2a3441',
  },
  inputFlex: { flex: 1 },
  eye: { paddingHorizontal: 8, paddingVertical: 4 },
  err: { color: '#ff9b9b', marginTop: 6 },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
    marginTop: 4,
  },
  bannerDanger: {
    backgroundColor: '#2a1518',
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#5c2a32',
  },
  bannerDangerText: { color: '#ffc7c7' },
  bio: { marginTop: 12 },
  footer: { marginTop: 24 },
});
