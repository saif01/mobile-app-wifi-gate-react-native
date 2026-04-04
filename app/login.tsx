import { zodResolver } from '@hookform/resolvers/zod';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { Fingerprint, KeyRound, LockKeyhole, Settings2, ShieldCheck, Wifi } from 'lucide-react-native';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Alert, Image, KeyboardAvoidingView, Platform, StyleSheet, Text, View } from 'react-native';
import { z } from 'zod';

import { PrimaryButton } from '@/components/ui/Button';
import { InputField } from '@/components/ui/InputField';
import { Screen } from '@/components/ui/Screen';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Body, Caption, Subtitle, Title } from '@/components/ui/Typography';
import { theme } from '@/constants/theme';
import { appendActivityLog } from '@/services/activityLog';
import { authenticateWithBiometrics, isBiometricAvailable } from '@/services/biometricService';
import {
  beginManualFirewallLoginScope,
  describeFirewallLoginFailure,
  endManualFirewallLoginScope,
  performFirewallLogin,
} from '@/services/firewallLogin';
import { fetchWifiLoginGate, wifiLoginGateLogMeta } from '@/services/wifiGateAuth';
import { getBiometricCredentials, getSavedCredentials } from '@/services/secureCredentials';
import { useAppStore } from '@/store/appStore';

const schema = z.object({
  userId: z.string().min(1, 'ID is required'),
  password: z.string().min(1, 'Password is required'),
});

type FormValues = z.infer<typeof schema>;

function confirmEnableBiometric(): Promise<boolean> {
  return new Promise((resolve) => {
    Alert.alert('Enable Fingerprint Login', 'Use fingerprint for future logins?', [
      { text: 'Not now', style: 'cancel', onPress: () => resolve(false) },
      { text: 'Enable', onPress: () => resolve(true) },
    ]);
  });
}

function shouldOfferPortalFallback(reason?: string): boolean {
  return (
    reason === 'invalid_credentials' ||
    reason === 'unexpected_response' ||
    reason === 'parse_error' ||
    reason === 'unreachable' ||
    reason === 'timeout'
  );
}

export default function LoginScreen() {
  const settings = useAppStore((s) => s.settings);
  const lastLoginId = useAppStore((s) => s.lastLoginId);
  const biometricEnabled = useAppStore((s) => s.biometricEnabled);
  const biometricCredentialsStored = useAppStore((s) => s.biometricCredentialsStored);
  const manualLoginDone = useAppStore((s) => s.manualLoginDone);
  const storedCredentialsAvailable = useAppStore((s) => s.storedCredentialsAvailable);
  const authAgent = useAppStore((s) => s.authAgent);
  const isAuthenticated = useAppStore((s) => s.isAuthenticated);
  const recordSuccessfulManualLogin = useAppStore((s) => s.recordSuccessfulManualLogin);
  const enableBiometricAfterSuccessfulLogin = useAppStore((s) => s.enableBiometricAfterSuccessfulLogin);
  const beginPortalLoginFallback = useAppStore((s) => s.beginPortalLoginFallback);
  const setAuthenticated = useAppStore((s) => s.setAuthenticated);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPass, setShowPass] = useState(false);
  const [bioAvailable, setBioAvailable] = useState(false);
  const [netHint, setNetHint] = useState<string | null>(null);
  const [networkTone, setNetworkTone] = useState<'success' | 'warning' | 'error' | 'neutral'>('neutral');
  const loginAttemptGenerationRef = useRef(0);

  const { control, getValues, handleSubmit, reset } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      userId: lastLoginId,
      password: '',
    },
  });

  useEffect(() => {
    void (async () => {
      setBioAvailable(await isBiometricAvailable());
    })();
  }, []);

  useEffect(() => {
    if (isAuthenticated) {
      router.replace('/(tabs)/home');
    }
  }, [isAuthenticated]);

  useEffect(() => {
    const current = getValues();
    reset({
      userId: lastLoginId || current.userId,
      password: '',
    });
  }, [getValues, lastLoginId, reset]);

  useEffect(() => {
    void (async () => {
      const gate = await fetchWifiLoginGate(settings.allowedWifi);
      if (!gate.ok) {
        setNetHint(gate.message);
        setNetworkTone('error');
        return;
      }
      const snap = gate.snapshot;
      if (gate.access.noRestriction) {
        setNetHint('Wi‑Fi connected. No allowlist — login is allowed on any Wi‑Fi.');
        setNetworkTone('warning');
        return;
      }
      if (settings.warnCellularInterference && snap.cellularMayInterfere) {
        setNetHint('Allowed Wi‑Fi connected. Mobile data may interfere with the portal.');
        setNetworkTone('warning');
        return;
      }
      setNetHint('Allowed Wi‑Fi connected. You can sign in.');
      setNetworkTone('success');
    })();
  }, [settings.allowedWifi, settings.warnCellularInterference]);

  const canUseBiometric = useMemo(
    () => bioAvailable && biometricEnabled && biometricCredentialsStored,
    [bioAvailable, biometricCredentialsStored, biometricEnabled]
  );

  async function maybeEnableBiometricAfterLogin() {
    if (!bioAvailable || biometricEnabled || biometricCredentialsStored) return;
    const shouldEnable = await confirmEnableBiometric();
    if (!shouldEnable) return;

    const auth = await authenticateWithBiometrics('Enable fingerprint login');
    if (!auth.ok) return;

    const enabled = await enableBiometricAfterSuccessfulLogin();
    if (enabled) {
      await appendActivityLog('success', 'Fingerprint login enabled');
    }
  }

  async function openPortalFallback(userId: string, password: string, source: 'manual' | 'biometric') {
    beginPortalLoginFallback(userId, password, source);
    await appendActivityLog('info', 'Opening browser-based portal fallback', { source });
    router.push('/webview-login');
  }

  async function loginWithManualCredentials(userId: string, password: string) {
    const attemptId = ++loginAttemptGenerationRef.current;
    setBusy(true);
    setError(null);
    beginManualFirewallLoginScope();
    try {
      const gate = await fetchWifiLoginGate(settings.allowedWifi);
      if (attemptId !== loginAttemptGenerationRef.current) return;
      if (!gate.ok) {
        setError(gate.message);
        await appendActivityLog('warn', 'Login blocked: network gate', wifiLoginGateLogMeta(gate));
        return;
      }

      await appendActivityLog('info', 'Firewall login attempt', {
        noRestriction: gate.access.noRestriction,
      });

      const res = await performFirewallLogin({
        baseUrl: settings.firewallEndpoint,
        userId,
        password,
        initiator: 'manual',
      });

      if (attemptId !== loginAttemptGenerationRef.current) return;

      if (!res.ok) {
        if (res.reason === 'cancelled') return;
        setError(describeFirewallLoginFailure(res));
        await appendActivityLog('error', 'Firewall login failed', {
          reason: res.reason ?? '',
          detail: res.message ?? '',
          http: res.statusCode != null ? String(res.statusCode) : '',
        });
        if (shouldOfferPortalFallback(res.reason)) {
          Alert.alert('Trying Portal Login', 'Direct login failed. WiFiGate can continue through the portal flow inside the app.', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Continue', onPress: () => void openPortalFallback(userId, password, 'manual') },
          ]);
        }
        return;
      }

      const ts = await recordSuccessfulManualLogin(userId, password);
      await setAuthenticated(true, ts);
      await maybeEnableBiometricAfterLogin();
      reset({ userId, password: '' });
      await appendActivityLog('success', 'Firewall login success');
      router.replace('/(tabs)/home');
    } catch (e) {
      if (attemptId !== loginAttemptGenerationRef.current) return;
      setError(e instanceof Error ? e.message : 'Unexpected error');
      await appendActivityLog('error', 'Login exception', { message: String(e) });
    } finally {
      endManualFirewallLoginScope();
      setBusy(false);
    }
  }

  const onSubmit = handleSubmit((values) => loginWithManualCredentials(values.userId, values.password));

  async function loginWithBiometricCredentials() {
    const attemptId = ++loginAttemptGenerationRef.current;
    setError(null);
    const auth = await authenticateWithBiometrics('Login with fingerprint');
    if (!auth.ok) return;

    const creds = await getBiometricCredentials();
    if (!creds) {
      setError('Fingerprint credentials unavailable.');
      return;
    }

    setBusy(true);
    beginManualFirewallLoginScope();
    try {
      const gate = await fetchWifiLoginGate(settings.allowedWifi);
      if (attemptId !== loginAttemptGenerationRef.current) return;
      if (!gate.ok) {
        setError(gate.message);
        await appendActivityLog('warn', 'Fingerprint login blocked: network gate', wifiLoginGateLogMeta(gate));
        return;
      }

      const res = await performFirewallLogin({
        baseUrl: settings.firewallEndpoint,
        userId: creds.userId,
        password: creds.password,
        initiator: 'manual',
      });

      if (attemptId !== loginAttemptGenerationRef.current) return;

      if (!res.ok) {
        if (res.reason === 'cancelled') return;
        setError(describeFirewallLoginFailure(res));
        await appendActivityLog('error', 'Fingerprint login failed', {
          reason: res.reason ?? '',
          detail: res.message ?? '',
          http: res.statusCode != null ? String(res.statusCode) : '',
        });
        if (shouldOfferPortalFallback(res.reason)) {
          Alert.alert('Trying Portal Login', 'Direct fingerprint login failed. WiFiGate can continue through the portal flow inside the app.', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Continue', onPress: () => void openPortalFallback(creds.userId, creds.password, 'biometric') },
          ]);
        }
        return;
      }

      await setAuthenticated(true, Date.now());
      reset({ userId: creds.userId, password: '' });
      await appendActivityLog('success', 'Fingerprint login success');
      router.replace('/(tabs)/home');
    } catch (e) {
      if (attemptId !== loginAttemptGenerationRef.current) return;
      setError(e instanceof Error ? e.message : 'Unexpected error');
      await appendActivityLog('error', 'Fingerprint login exception', { message: String(e) });
    } finally {
      endManualFirewallLoginScope();
      setBusy(false);
    }
  }

  async function continuePortalWithStoredCredentials() {
    const creds = await getSavedCredentials();
    if (!creds) {
      setError('Saved credentials are unavailable.');
      return;
    }
    await openPortalFallback(creds.userId, creds.password, 'manual');
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
          <LinearGradient colors={['#46e2d8', '#56c2ff', '#2e8fff']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.cardAccent} />

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
                label="Login ID"
                value={field.value}
                onChangeText={field.onChange}
                placeholder="Login ID"
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

          {error ? (
            <View style={styles.errorBox}>
              <StatusBadge tone="error" label="Failed" />
              <Body style={styles.errorText}>{error}</Body>
            </View>
          ) : null}

          <PrimaryButton
            title={busy ? 'Connecting...' : 'Sign in'}
            onPress={onSubmit}
            loading={busy}
            disabled={busy}
            icon={ShieldCheck}
            trailingArrow
          />

          {canUseBiometric ? (
            <View style={styles.secondaryAction}>
              <PrimaryButton title="Login with Fingerprint" variant="secondary" onPress={loginWithBiometricCredentials} disabled={busy} icon={Fingerprint} />
            </View>
          ) : manualLoginDone && bioAvailable && !biometricCredentialsStored ? (
            <Caption style={styles.helperText}>Sign in with ID and password first to enable fingerprint.</Caption>
          ) : null}

          <View style={styles.utilityRow}>
            <PrimaryButton title="Settings" variant="ghost" onPress={() => router.push('/(tabs)/settings')} icon={Settings2} style={styles.utilityButton} />
          </View>

          <View style={styles.dividerMuted} />

          <Caption style={styles.endpointLabel}>Endpoint</Caption>
          <Text style={styles.endpointMono} numberOfLines={2} selectable>
            {settings.firewallEndpoint}
          </Text>

          <View style={styles.dividerMuted} />

          <View style={styles.quickStatusRow}>
            <Caption style={styles.quickStatusLabel}>Saved credentials</Caption>
            <StatusBadge
              tone={storedCredentialsAvailable ? 'success' : 'neutral'}
              label={storedCredentialsAvailable ? 'Available' : 'None'}
            />
          </View>
          <Caption style={styles.quickStatusHint}>
            {storedCredentialsAvailable
              ? 'Auto-login can run when Wi‑Fi is ready and enabled in Settings.'
              : 'Successful sign-in stores ID and password in secure storage for next launch.'}
          </Caption>

          <View style={styles.dividerMuted} />

          <View style={styles.networkSection}>
            <View style={styles.networkHeaderRow}>
              <View style={styles.networkTitleLeft}>
                <ShieldCheck color={theme.colors.primary} size={16} strokeWidth={2.2} />
                <Caption style={styles.networkSectionLabel}>Agent status</Caption>
              </View>
              <StatusBadge
                tone={
                  authAgent.status === 'authenticated'
                    ? 'success'
                    : authAgent.status === 'authenticating' || authAgent.status === 'checking'
                      ? 'warning'
                      : authAgent.status === 'needs_portal' || authAgent.status === 'error' || authAgent.status === 'blocked'
                        ? 'error'
                        : 'neutral'
                }
                label={
                  authAgent.status === 'authenticated'
                    ? 'Live'
                    : authAgent.status === 'authenticating'
                      ? 'Login'
                      : authAgent.status === 'checking'
                        ? 'Check'
                        : authAgent.status === 'needs_portal'
                          ? 'Portal'
                          : authAgent.status === 'needs_credentials'
                            ? 'Setup'
                            : authAgent.status === 'paused'
                              ? 'Paused'
                              : 'Idle'
                }
              />
            </View>
            <Text style={styles.networkHintBody}>{authAgent.message}</Text>
          </View>

          {authAgent.status === 'needs_portal' && storedCredentialsAvailable ? (
            <View style={styles.secondaryAction}>
              <PrimaryButton title="Continue in Portal" variant="secondary" onPress={() => void continuePortalWithStoredCredentials()} icon={Wifi} />
            </View>
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
                label={networkTone === 'success' ? 'Ready' : networkTone === 'warning' ? 'Warn' : networkTone === 'error' ? 'Blocked' : 'Wait'}
              />
            </View>
            <Text style={styles.networkHintBody}>{netHint ?? 'Checking WiFi status...'}</Text>
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
  helperText: {
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
  dividerMuted: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: theme.colors.border,
    marginTop: theme.spacing.sm,
    marginBottom: theme.spacing.sm,
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
  quickStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.xs,
  },
  quickStatusLabel: {
    color: theme.colors.textSoft,
    fontWeight: '700',
    fontSize: 11,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  quickStatusHint: {
    color: theme.colors.textMuted,
    fontSize: 12,
    lineHeight: 17,
    marginBottom: theme.spacing.xs,
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
});
