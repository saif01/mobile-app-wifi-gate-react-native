import { zodResolver } from '@hookform/resolvers/zod';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { Fingerprint, KeyRound, LockKeyhole, Settings2, ShieldCheck, Wifi } from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Image, KeyboardAvoidingView, Platform, StyleSheet, Switch, Text, View } from 'react-native';
import { z } from 'zod';

import { PrimaryButton } from '@/components/ui/Button';
import { InputField } from '@/components/ui/InputField';
import { Screen } from '@/components/ui/Screen';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Body, Caption, Title } from '@/components/ui/Typography';
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
        <View style={styles.headerSection}>
          <View style={styles.headerRow}>
            <View style={styles.logoShell}>
              <LinearGradient
                colors={['rgba(99, 216, 255, 0.35)', 'rgba(45, 143, 255, 0.2)']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.logoGradient}>
                <View style={styles.logoCore}>
                  <Image source={require('../assets/images/icon.png')} style={styles.logoImage} resizeMode="contain" />
                </View>
              </LinearGradient>
            </View>
            <View style={styles.headerText}>
              <Title style={styles.brandTitle}>WiFiGate</Title>
              <Caption style={styles.brandTag}>Firewall portal</Caption>
            </View>
          </View>
        </View>

        <View style={styles.mainCard}>
          <LinearGradient
            colors={['#46e2d8', '#56c2ff', '#2e8fff']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.cardAccent}
          />

          <View style={styles.formTitleRow}>
            <View>
              <Caption style={styles.sectionEyebrow}>Session</Caption>
              <Title style={styles.signInTitle}>Sign in</Title>
            </View>
            <View style={styles.portalPill}>
              <Wifi color={theme.colors.cyan} size={13} strokeWidth={2.1} />
              <Caption style={styles.portalPillText}>HTTP</Caption>
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
                placeholder="WiFiGate ID"
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
                placeholder="Password"
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
                  <Body style={styles.preferenceTitle}>Remember</Body>
                  <Caption numberOfLines={1}>Save credentials after success.</Caption>
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
              <StatusBadge tone="error" label="Failed" />
              <Body style={styles.errorText}>{error}</Body>
            </View>
          ) : null}

          <PrimaryButton
            title={busy ? 'Connecting…' : 'Sign in'}
            onPress={onSubmit}
            loading={busy}
            disabled={busy}
            icon={ShieldCheck}
            trailingArrow
          />

          {canUseBiometric ? (
            <View style={styles.secondaryAction}>
              <PrimaryButton
                title="Fingerprint"
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
              title="Browser"
              variant="ghost"
              onPress={() => router.push('/webview-login')}
              icon={Wifi}
              style={styles.utilityButton}
            />
          </View>

          <View style={styles.dividerMuted} />

          <Caption style={styles.endpointLabel}>Endpoint</Caption>
          <Text style={styles.endpointMono} numberOfLines={2} selectable>
            {settings.firewallEndpoint}
          </Text>
          {!settings.rememberCredentials ? (
            <Caption style={styles.footerHint}>Fingerprint needs Remember.</Caption>
          ) : biometricEnabled && !savedCredentials ? (
            <Caption style={styles.footerHint}>Sign in once to enable fingerprint.</Caption>
          ) : null}

          <View style={styles.dividerMuted} />

          <View style={styles.networkSection}>
            <View style={styles.networkHeaderRow}>
              <View style={styles.networkTitleLeft}>
                <Wifi color={theme.colors.primary} size={16} strokeWidth={2.2} />
                <Caption style={styles.networkSectionLabel}>WiFi status</Caption>
              </View>
              <StatusBadge
                tone={networkTone}
                label={
                  networkTone === 'success'
                    ? 'Ready'
                    : networkTone === 'warning'
                      ? 'Warn'
                      : networkTone === 'error'
                        ? 'Blocked'
                        : 'Wait'
                }
              />
            </View>
            <Text style={styles.networkHintBody}>{netHint ?? 'Checking WiFi status…'}</Text>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingTop: theme.spacing.md,
  },
  headerSection: {
    alignItems: 'center',
    marginBottom: theme.spacing.lg,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    maxWidth: '100%',
  },
  headerText: {
    justifyContent: 'center',
    flexShrink: 1,
  },
  brandTitle: {
    fontSize: 22,
    letterSpacing: -0.6,
    marginBottom: 2,
  },
  brandTag: {
    color: theme.colors.textSoft,
    fontSize: 11,
    letterSpacing: 0.4,
  },
  logoShell: {
    borderRadius: theme.radius.md,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: theme.colors.borderStrong,
  },
  logoGradient: {
    padding: 2,
  },
  logoCore: {
    width: 48,
    height: 48,
    borderRadius: theme.radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.surfaceStrong,
  },
  logoImage: {
    width: 30,
    height: 30,
  },
  mainCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing.lg,
    paddingTop: theme.spacing.md + 3,
    overflow: 'hidden',
    marginBottom: theme.spacing.xl,
    ...theme.shadow.card,
  },
  cardAccent: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 3,
    opacity: 0.95,
  },
  networkSection: {
    marginTop: theme.spacing.xs,
  },
  networkHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.md,
    marginBottom: theme.spacing.sm,
  },
  networkTitleLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    flex: 1,
    minWidth: 0,
  },
  networkSectionLabel: {
    color: theme.colors.cyan,
    fontWeight: '700',
    letterSpacing: 0.6,
    fontSize: 11,
  },
  networkHintBody: {
    color: theme.colors.text,
    fontSize: 13,
    lineHeight: 20,
    letterSpacing: -0.15,
  },
  dividerMuted: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: theme.colors.border,
    marginTop: theme.spacing.sm,
    marginBottom: theme.spacing.sm,
  },
  formTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    gap: theme.spacing.md,
    marginBottom: theme.spacing.sm,
  },
  sectionEyebrow: {
    color: theme.colors.cyan,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    fontSize: 10,
    marginBottom: 2,
  },
  signInTitle: {
    fontSize: 18,
    letterSpacing: -0.4,
    fontWeight: '800',
  },
  portalPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: theme.radius.pill,
    backgroundColor: 'rgba(70, 226, 216, 0.08)',
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  portalPillText: {
    color: theme.colors.text,
    fontWeight: '800',
    fontSize: 11,
  },
  preferenceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: theme.spacing.md,
    marginBottom: theme.spacing.sm,
    marginTop: -theme.spacing.xs,
  },
  preferenceText: {
    flex: 1,
  },
  preferenceTitle: {
    color: theme.colors.text,
    fontWeight: '700',
    marginBottom: 2,
    fontSize: 14,
  },
  errorBox: {
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.md,
    padding: theme.spacing.sm,
    borderRadius: theme.radius.sm,
    backgroundColor: 'rgba(120, 23, 35, 0.38)',
    borderWidth: 1,
    borderColor: 'rgba(255, 114, 114, 0.2)',
  },
  errorText: {
    color: '#ffd2d2',
  },
  secondaryAction: {
    marginTop: theme.spacing.sm,
  },
  utilityRow: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
    marginTop: theme.spacing.sm,
  },
  utilityButton: {
    flex: 1,
  },
  endpointLabel: {
    color: theme.colors.textSoft,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    fontSize: 10,
    marginBottom: 4,
  },
  endpointMono: {
    color: theme.colors.text,
    fontSize: 12,
    fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
    lineHeight: 17,
  },
  footerHint: {
    marginTop: theme.spacing.sm,
    color: theme.colors.textSoft,
  },
});
