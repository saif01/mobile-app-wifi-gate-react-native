import { zodResolver } from '@hookform/resolvers/zod';
import Constants from 'expo-constants';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { Fingerprint, KeyRound, LockKeyhole, ShieldCheck, Wifi } from 'lucide-react-native';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Alert, Image, KeyboardAvoidingView, Platform, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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
  const appVersion = Constants.expoConfig?.version ?? '1.0.2';
  const insets = useSafeAreaInsets();
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
  const [skipPortalNetwork, setSkipPortalNetwork] = useState(false);
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
      const gate = await fetchWifiLoginGate(settings.allowedWifi, settings.noLoginWifi);
      if (!gate.ok) {
        setSkipPortalNetwork(false);
        setNetHint(gate.message);
        setNetworkTone('error');
        return;
      }
      const snap = gate.snapshot;
      if (gate.access.skipPortalAuth) {
        setSkipPortalNetwork(true);
        setNetHint('This Wi‑Fi is on the no-portal list. Firewall sign-in and logout are not used here.');
        setNetworkTone('success');
        return;
      }
      setSkipPortalNetwork(false);
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
  }, [settings.allowedWifi, settings.noLoginWifi, settings.warnCellularInterference]);

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
      const gate = await fetchWifiLoginGate(settings.allowedWifi, settings.noLoginWifi);
      if (attemptId !== loginAttemptGenerationRef.current) return;
      if (!gate.ok) {
        setError(gate.message);
        await appendActivityLog('warn', 'Login blocked: network gate', wifiLoginGateLogMeta(gate));
        return;
      }

      if (gate.access.skipPortalAuth) {
        await setAuthenticated(true, Date.now());
        await appendActivityLog('info', 'Sign-in skipped: no-portal Wi‑Fi', wifiLoginGateLogMeta(gate));
        router.replace('/(tabs)/home');
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
      const gate = await fetchWifiLoginGate(settings.allowedWifi, settings.noLoginWifi);
      if (attemptId !== loginAttemptGenerationRef.current) return;
      if (!gate.ok) {
        setError(gate.message);
        await appendActivityLog('warn', 'Fingerprint login blocked: network gate', wifiLoginGateLogMeta(gate));
        return;
      }

      if (gate.access.skipPortalAuth) {
        await setAuthenticated(true, Date.now());
        await appendActivityLog('info', 'Fingerprint skipped: no-portal Wi‑Fi', wifiLoginGateLogMeta(gate));
        router.replace('/(tabs)/home');
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
    <Screen contentStyle={styles.loginScreenOuter}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.loginKav}
        keyboardVerticalOffset={Platform.OS === 'ios' ? insets.top : 0}>
        <View style={styles.loginStack}>
          <View style={styles.loginMain}>
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
              <Title style={styles.signInTitle}>{skipPortalNetwork ? 'No portal' : 'Sign in'}</Title>
            </View>
            <View style={styles.portalPill}>
              <Wifi color={theme.colors.cyan} size={13} strokeWidth={2.1} />
              <Caption style={styles.portalPillText}>HTTP</Caption>
            </View>
          </View>

          {skipPortalNetwork ? (
            <>
              <Caption style={styles.helperText}>
                You can open the app without firewall credentials on this network. Logout from the menu will not call the portal server here.
              </Caption>
              <PrimaryButton
                title="Continue to app"
                onPress={() => void setAuthenticated(true, Date.now()).then(() => router.replace('/(tabs)/home'))}
                icon={ShieldCheck}
                trailingArrow
              />
            </>
          ) : (
            <>
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
            </>
          )}

          <View style={styles.dividerMuted} />

          {authAgent.status === 'needs_portal' && storedCredentialsAvailable ? (
            <>
              <View style={styles.secondaryAction}>
                <PrimaryButton title="Continue in Portal" variant="secondary" onPress={() => void continuePortalWithStoredCredentials()} icon={Wifi} />
              </View>
              <View style={styles.dividerMuted} />
            </>
          ) : null}

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
          </View>

          <View style={[styles.loginFooter, { paddingBottom: Math.max(theme.spacing.xs, insets.bottom) }]}>
            <Caption style={styles.footerPowered}>Powered By CPB-IT</Caption>
            <Caption style={styles.footerVersion}>Version {appVersion}</Caption>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  loginScreenOuter: {
    flex: 1,
    paddingTop: theme.spacing.sm,
    paddingBottom: theme.spacing.xs,
  },
  loginKav: {
    flex: 1,
  },
  loginStack: {
    flex: 1,
  },
  loginMain: {
    flexShrink: 1,
  },
  loginFooter: {
    alignItems: 'center',
    gap: 2,
    marginTop: theme.spacing.xs,
  },
  footerPowered: {
    color: theme.colors.textSoft,
    fontSize: 11,
    letterSpacing: 0.3,
  },
  footerVersion: {
    color: theme.colors.textMuted,
    fontSize: 11,
  },
  headerSection: {
    alignItems: 'center',
    marginBottom: theme.spacing.sm,
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
    padding: theme.spacing.md,
    paddingTop: theme.spacing.md + 2,
    overflow: 'hidden',
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
  dividerMuted: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: theme.colors.border,
    marginTop: theme.spacing.xs,
    marginBottom: theme.spacing.xs,
  },
  networkSection: {
    marginTop: theme.spacing.sm,
  },
  networkHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.md,
    marginBottom: theme.spacing.xs,
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
