import { zodResolver } from '@hookform/resolvers/zod';
import { router } from 'expo-router';
import { Fingerprint, KeyRound, LockKeyhole, Settings2, ShieldCheck, Wifi } from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { KeyboardAvoidingView, Platform, StyleSheet, Switch, View } from 'react-native';
import { z } from 'zod';

import { PrimaryButton } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { InputField } from '@/components/ui/InputField';
import { Screen } from '@/components/ui/Screen';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Body, Caption, Eyebrow, Subtitle, Title } from '@/components/ui/Typography';
import { theme } from '@/constants/theme';
import { appendActivityLog } from '@/services/activityLog';
import { authenticateWithBiometrics, isBiometricAvailable } from '@/services/biometricService';
import { mapFailureToMessage, performFirewallLogin } from '@/services/firewallLogin';
import { evaluateWifiAccess, getNetworkSnapshot } from '@/services/networkService';
import { getSavedCredentials } from '@/services/secureCredentials';
import { useAppStore } from '@/store/appStore';

const schema = z.object({
  userId: z.string().min(1, 'ID is required'),
  password: z.string().min(1, 'Password is required'),
  remember: z.boolean(),
});

type FormValues = z.infer<typeof schema>;

export default function LoginScreen() {
  const settings = useAppStore((s) => s.settings);
  const savedCredentials = useAppStore((s) => s.savedCredentials);
  const biometricEnabled = useAppStore((s) => s.biometricEnabled);
  const setRememberMe = useAppStore((s) => s.setRememberMe);
  const saveSuccessfulLogin = useAppStore((s) => s.saveSuccessfulLogin);
  const setAuthenticated = useAppStore((s) => s.setAuthenticated);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPass, setShowPass] = useState(false);
  const [bioAvailable, setBioAvailable] = useState(false);
  const [netHint, setNetHint] = useState<string | null>(null);
  const [networkTone, setNetworkTone] = useState<'success' | 'warning' | 'error' | 'neutral'>('neutral');

  const { control, getValues, handleSubmit, reset } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      userId: '',
      password: '',
      remember: settings.rememberCredentials,
    },
  });

  useEffect(() => {
    void (async () => {
      setBioAvailable(await isBiometricAvailable());
    })();
  }, []);

  useEffect(() => {
    const current = getValues();
    reset({
      userId: settings.rememberCredentials ? savedCredentials?.userId ?? current.userId : '',
      password: settings.rememberCredentials ? savedCredentials?.password ?? current.password : '',
      remember: settings.rememberCredentials,
    });
  }, [getValues, reset, savedCredentials, settings.rememberCredentials]);

  useEffect(() => {
    void (async () => {
      const snap = await getNetworkSnapshot();
      const access = evaluateWifiAccess(snap, settings.allowedWifi);

      if (access.noRestriction) {
        setNetHint('No WiFi restriction is configured. Login is allowed on any connected network.');
        setNetworkTone('warning');
        return;
      }
      if (access.requiresWifiConnection) {
        setNetHint('Connect to an allowed WiFi network before signing in.');
        setNetworkTone('error');
        return;
      }
      if (!access.match) {
        setNetHint('Current WiFi is not in the allowed list.');
        setNetworkTone('error');
        return;
      }
      if (settings.warnCellularInterference && snap.cellularMayInterfere) {
        setNetHint('Android may still prefer mobile data. Disable it if login appears unreliable.');
        setNetworkTone('warning');
        return;
      }
      setNetHint('Connected to an authorized WiFi network.');
      setNetworkTone('success');
    })();
  }, [settings.allowedWifi, settings.warnCellularInterference]);

  const canUseBiometric = useMemo(
    () => bioAvailable && biometricEnabled && settings.rememberCredentials && Boolean(savedCredentials),
    [bioAvailable, biometricEnabled, savedCredentials, settings.rememberCredentials]
  );

  async function runLoginFlow(userId: string, password: string) {
    setBusy(true);
    setError(null);
    try {
      const snap = await getNetworkSnapshot();
      const access = evaluateWifiAccess(snap, settings.allowedWifi);

      if (!access.allowed) {
        setError(
          access.requiresWifiConnection
            ? 'Connect to an allowed WiFi network before logging in.'
            : 'Current WiFi is not in the allowed list.'
        );
        await appendActivityLog('warn', 'Login blocked: WiFi not allowed', {
          noRestriction: access.noRestriction,
        });
        return;
      }

      await appendActivityLog('info', 'Firewall login attempt', {
        noRestriction: access.noRestriction,
      });

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

      const ts = await saveSuccessfulLogin(userId, password);
      await setAuthenticated(true, ts);
      await appendActivityLog('success', 'Firewall login success');
      router.replace('/(tabs)/home');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unexpected error');
      await appendActivityLog('error', 'Login exception', { message: String(e) });
    } finally {
      setBusy(false);
    }
  }

  const onSubmit = handleSubmit((values) => runLoginFlow(values.userId, values.password));

  async function onBiometric() {
    const auth = await authenticateWithBiometrics('Unlock WiFiGate');
    if (!auth.ok) return;

    const creds = await getSavedCredentials();
    if (!creds) {
      setError('No remembered credentials found. Sign in manually once first.');
      return;
    }

    await runLoginFlow(creds.userId, creds.password);
  }

  return (
    <Screen scroll contentStyle={styles.content}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.hero}>
          <View style={styles.logoShell}>
            <View style={styles.logoCore}>
              <ShieldCheck color={theme.colors.white} size={30} strokeWidth={2.4} />
            </View>
          </View>
          <Eyebrow>Enterprise Access</Eyebrow>
          <Title style={styles.title}>WiFiGate</Title>
          <Subtitle style={styles.subtitle}>Secure WiFi login.</Subtitle>
        </View>

        <Card style={styles.statusStrip}>
          <View style={styles.statusRow}>
            <View style={styles.statusTextWrap}>
              <Caption style={styles.label}>Network readiness</Caption>
              <Body style={styles.statusText}>{netHint ?? 'Checking WiFi status...'}</Body>
            </View>
            <StatusBadge
              tone={networkTone}
              label={
                networkTone === 'success'
                  ? 'Ready'
                  : networkTone === 'warning'
                    ? 'Caution'
                    : networkTone === 'error'
                      ? 'Blocked'
                      : 'Checking'
              }
            />
          </View>
        </Card>

        <Card style={styles.formCard}>
          <View style={styles.formHeader}>
            <View>
              <Caption style={styles.label}>Firewall session</Caption>
              <Subtitle style={styles.formTitle}>Sign in to your network</Subtitle>
            </View>
            <View style={styles.endpointPill}>
              <Wifi color={theme.colors.primary} size={16} strokeWidth={2.1} />
              <Caption style={styles.endpointText}>HTTP portal</Caption>
            </View>
          </View>

          <Controller
            control={control}
            name="userId"
            render={({ field, fieldState }) => (
              <InputField
                label="User ID"
                value={field.value}
                onChangeText={field.onChange}
                placeholder="Enter your WiFiGate ID"
                icon={KeyRound}
                error={fieldState.error?.message}
                autoCapitalize="none"
                autoCorrect={false}
              />
            )}
          />

          <Controller
            control={control}
            name="password"
            render={({ field, fieldState }) => (
              <InputField
                label="Password"
                value={field.value}
                onChangeText={field.onChange}
                placeholder="Enter your password"
                icon={LockKeyhole}
                error={fieldState.error?.message}
                secureTextEntry={!showPass}
                showToggle
                onToggleSecure={() => setShowPass((v) => !v)}
                autoCapitalize="none"
                autoCorrect={false}
              />
            )}
          />

          <Controller
            control={control}
            name="remember"
            render={({ field }) => (
              <View style={styles.preferenceRow}>
              <View style={styles.preferenceText}>
                  <Body style={styles.preferenceTitle}>Remember Me</Body>
                  <Caption>Save last successful login.</Caption>
                </View>
                <Switch
                  value={field.value}
                  onValueChange={async (v) => {
                    field.onChange(v);
                    await setRememberMe(v);
                    setError(null);
                    if (!v) {
                      reset({ userId: '', password: '', remember: false });
                    }
                  }}
                />
              </View>
            )}
          />

          {error ? (
            <View style={styles.errorBox}>
              <StatusBadge tone="error" label="Login failed" />
              <Body style={styles.errorText}>{error}</Body>
            </View>
          ) : null}

          <PrimaryButton
            title={busy ? 'Connecting...' : 'Sign In'}
            onPress={onSubmit}
            loading={busy}
            disabled={busy}
            icon={ShieldCheck}
            trailingArrow
          />

          {canUseBiometric ? (
            <View style={styles.secondaryAction}>
              <PrimaryButton
                title="Unlock with Fingerprint"
                variant="secondary"
                onPress={onBiometric}
                disabled={busy}
                icon={Fingerprint}
              />
            </View>
          ) : null}

          <View style={styles.utilityRow}>
            <PrimaryButton
              title="Settings"
              variant="ghost"
              onPress={() => router.push('/(tabs)/settings')}
              icon={Settings2}
              style={styles.utilityButton}
            />
            <PrimaryButton
              title="Browser Login"
              variant="ghost"
              onPress={() => router.push('/webview-login')}
              icon={Wifi}
              style={styles.utilityButton}
            />
          </View>
        </Card>

        <Card style={styles.footerCard}>
          <Caption style={styles.label}>Portal endpoint</Caption>
          <Body style={styles.endpointBody}>{settings.firewallEndpoint}</Body>
          {!settings.rememberCredentials ? (
            <Caption style={styles.footerHint}>Fingerprint needs Remember Me.</Caption>
          ) : biometricEnabled && !savedCredentials ? (
            <Caption style={styles.footerHint}>Login once to enable fingerprint.</Caption>
          ) : null}
        </Card>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingTop: theme.spacing.lg,
  },
  hero: {
    alignItems: 'center',
    marginTop: theme.spacing.md,
    marginBottom: theme.spacing.lg,
  },
  logoShell: {
    width: 88,
    height: 88,
    borderRadius: 32,
    backgroundColor: 'rgba(255,255,255,0.05)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  logoCore: {
    width: 62,
    height: 62,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.primaryStrong,
  },
  title: {
    marginTop: theme.spacing.sm,
    fontSize: theme.typography.hero,
  },
  subtitle: {
    marginTop: 6,
    textAlign: 'center',
    paddingHorizontal: theme.spacing.md,
  },
  statusStrip: {
    marginBottom: theme.spacing.lg,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.md,
  },
  statusTextWrap: {
    flex: 1,
    gap: theme.spacing.sm,
  },
  label: {
    color: theme.colors.cyan,
    fontWeight: '700',
    letterSpacing: 0.6,
  },
  statusText: {
    color: theme.colors.text,
  },
  formCard: {
    marginBottom: theme.spacing.lg,
  },
  formHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: theme.spacing.md,
    marginBottom: theme.spacing.md,
  },
  formTitle: {
    marginTop: 6,
  },
  endpointPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: theme.radius.pill,
    backgroundColor: 'rgba(86, 194, 255, 0.08)',
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  endpointText: {
    color: theme.colors.text,
    fontWeight: '700',
  },
  preferenceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: theme.spacing.md,
    marginBottom: theme.spacing.md,
  },
  preferenceText: {
    flex: 1,
  },
  preferenceTitle: {
    color: theme.colors.text,
    fontWeight: '700',
    marginBottom: 4,
  },
  errorBox: {
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.lg,
    padding: theme.spacing.md,
    borderRadius: theme.radius.md,
    backgroundColor: 'rgba(120, 23, 35, 0.38)',
    borderWidth: 1,
    borderColor: 'rgba(255, 114, 114, 0.2)',
  },
  errorText: {
    color: '#ffd2d2',
  },
  secondaryAction: {
    marginTop: theme.spacing.md,
  },
  utilityRow: {
    flexDirection: 'row',
    gap: theme.spacing.md,
    marginTop: theme.spacing.md,
  },
  utilityButton: {
    flex: 1,
  },
  footerCard: {
    marginBottom: theme.spacing.xl,
  },
  endpointBody: {
    color: theme.colors.text,
    marginTop: 6,
  },
  footerHint: {
    marginTop: theme.spacing.sm,
  },
});
