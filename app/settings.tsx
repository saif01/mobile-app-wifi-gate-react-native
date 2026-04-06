import Constants from 'expo-constants';
import { router } from 'expo-router';
import { Alert, StyleSheet, View } from 'react-native';
import { Fingerprint, Globe, Info, Radar, ShieldCheck, Smartphone } from 'lucide-react-native';
import { useEffect, useState } from 'react';

import { Card } from '@/components/ui/Card';
import { ListItem, ToggleTrailing } from '@/components/ui/ListItem';
import { Screen } from '@/components/ui/Screen';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Body, Caption, Eyebrow, Subtitle, Title } from '@/components/ui/Typography';
import { theme } from '@/constants/theme';
import { appendActivityLog } from '@/services/activityLog';
import { authenticateWithBiometrics, isBiometricAvailable } from '@/services/biometricService';
import { useAppStore } from '@/store/appStore';

export default function SettingsScreen() {
  const settings = useAppStore((s) => s.settings);
  const biometricEnabled = useAppStore((s) => s.biometricEnabled);
  const biometricCredentialsStored = useAppStore((s) => s.biometricCredentialsStored);
  const storedCredentialsAvailable = useAppStore((s) => s.storedCredentialsAvailable);
  const lastLoginId = useAppStore((s) => s.lastLoginId);
  const manualLoginDone = useAppStore((s) => s.manualLoginDone);
  const setSettings = useAppStore((s) => s.setSettings);
  const enableBiometricAfterSuccessfulLogin = useAppStore((s) => s.enableBiometricAfterSuccessfulLogin);
  const disableBiometric = useAppStore((s) => s.disableBiometric);

  const [hardwareAvailable, setHardwareAvailable] = useState(false);
  const version = Constants.expoConfig?.version ?? '1.0.4';

  useEffect(() => {
    void (async () => {
      setHardwareAvailable(await isBiometricAvailable());
    })();
  }, []);

  async function onBiometricToggle(nextValue: boolean) {
    if (!nextValue) {
      await disableBiometric();
      await appendActivityLog('info', 'Biometric toggled', { enabled: false });
      return;
    }

    if (!manualLoginDone) {
      Alert.alert('Fingerprint Login', 'Login successfully with ID and password first to enable fingerprint login.');
      return;
    }

    if (!hardwareAvailable) {
      Alert.alert('Fingerprint Login', 'Biometric hardware is not available or not enrolled.');
      return;
    }

    const auth = await authenticateWithBiometrics('Enable fingerprint login');
    if (!auth.ok) return;

    const enabled = await enableBiometricAfterSuccessfulLogin();
    if (!enabled) {
      Alert.alert('Fingerprint Login', 'Login successfully with ID and password first to enable fingerprint login.');
      return;
    }

    await appendActivityLog('info', 'Biometric toggled', { enabled: true });
  }

  return (
    <Screen scroll contentStyle={styles.content}>
      <View style={styles.hero}>
        <Eyebrow>Configuration</Eyebrow>
        <Title style={styles.title}>Settings</Title>
        <Subtitle>Security and network options.</Subtitle>
      </View>

      <Card style={styles.summaryCard}>
        <View style={styles.summaryHeader}>
          <View>
            <Caption style={styles.summaryLabel}>Login state</Caption>
            <Body style={styles.summaryText}>
              {lastLoginId ? `Last ID: ${lastLoginId}` : 'No successful login yet.'}
            </Body>
          </View>
          <StatusBadge tone={biometricCredentialsStored ? 'success' : 'neutral'} label={biometricCredentialsStored ? 'Fingerprint Ready' : 'Manual Login'} />
        </View>
        <Caption style={styles.summaryCaption}>
          {storedCredentialsAvailable ? 'Credentials are stored securely for auto-login.' : 'Credentials will be stored securely after your first successful login.'}
        </Caption>
      </Card>

      <SectionHeader title="Security" />
      <Card style={styles.bioCard}>
        <View style={styles.bioRow}>
          <View
            style={[
              styles.bioIconWrap,
              biometricEnabled && biometricCredentialsStored ? styles.bioIconWrapActive : styles.bioIconWrapIdle,
            ]}>
            <Fingerprint
              color={
                biometricEnabled && biometricCredentialsStored
                  ? theme.colors.success
                  : hardwareAvailable
                    ? theme.colors.primary
                    : theme.colors.textSoft
              }
              size={26}
              strokeWidth={2.3}
            />
          </View>
          <View style={styles.bioTextCol}>
            <Body style={styles.bioHeading}>Fingerprint login</Body>
            <Caption style={styles.bioSub}>
              {!manualLoginDone
                ? 'Sign in with ID and password once, then you can turn this on.'
                : biometricCredentialsStored
                  ? 'Unlocks saved credentials after biometric verification.'
                  : 'Complete a manual login to store credentials for fingerprint use.'}
            </Caption>
            <View style={styles.bioBadgeRow}>
              <StatusBadge
                tone={biometricEnabled && biometricCredentialsStored ? 'success' : 'neutral'}
                label={
                  !hardwareAvailable
                    ? 'Unavailable'
                    : biometricEnabled && biometricCredentialsStored
                      ? 'Enabled'
                      : biometricEnabled
                        ? 'Waiting for credentials'
                        : 'Off'
                }
              />
            </View>
          </View>
          <ToggleTrailing
            value={biometricEnabled}
            onValueChange={onBiometricToggle}
            disabled={!hardwareAvailable && !biometricEnabled}
            trackTone="success"
            large
          />
        </View>
      </Card>

      <SectionHeader title="Network" subtitle="Firewall target, Wi‑Fi policy, and background login." />
      <Card>
        <ListItem
          title="Firewall endpoint"
          subtitle={settings.firewallEndpoint}
          icon={Globe}
          iconTint="primary"
          onPress={() => router.push('/endpoint')}
        />
        <ListItem
          title="Wi‑Fi lists"
          subtitle={`${settings.allowedWifi.filter((entry) => entry.isActive).length} portal allowlist · ${settings.noLoginWifi.filter((entry) => entry.isActive).length} no-portal`}
          icon={ShieldCheck}
          iconTint="cyan"
          onPress={() => router.push('/(tabs)/wifi')}
        />
        <ListItem
          title="Auto Login Agent"
          subtitle={
            settings.autoLoginEnabled
              ? 'When Wi‑Fi allows portal login, syncs session and signs in with saved credentials if needed.'
              : 'Background auto-login is off — use manual sign-in on the Session tab.'
          }
          icon={Radar}
          iconTint="success"
          trailing={
            <ToggleTrailing
              value={settings.autoLoginEnabled}
              onValueChange={async (v) => {
                await setSettings({ autoLoginEnabled: v });
              }}
            />
          }
        />
        <ListItem
          title="Warn about mobile data"
          subtitle="On allowed Wi‑Fi, show a hint when cellular data might steal traffic from the portal."
          icon={Smartphone}
          iconTint="warning"
          trailing={
            <ToggleTrailing
              value={settings.warnCellularInterference}
              onValueChange={async (v) => {
                await setSettings({ warnCellularInterference: v });
              }}
            />
          }
        />
      </Card>

      <SectionHeader title="General" />
      <Card>
        <ListItem title="About" subtitle="Version, app info, and features." icon={Info} iconTint="default" onPress={() => router.push('/about')} />
        <Body style={styles.versionText}>WiFiGate v{version}</Body>
        <Caption style={styles.versionCaption}>Captive portal access app.</Caption>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingTop: theme.spacing.lg,
  },
  hero: {
    marginTop: theme.spacing.md,
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.md,
  },
  title: {
    fontSize: theme.typography.hero,
  },
  summaryCard: {
    marginTop: theme.spacing.sm,
  },
  summaryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: theme.spacing.sm,
  },
  summaryLabel: {
    color: theme.colors.cyan,
    fontWeight: '700',
  },
  summaryText: {
    color: theme.colors.text,
    marginTop: 4,
    maxWidth: 220,
  },
  summaryCaption: {
    marginTop: theme.spacing.sm,
  },
  versionText: {
    color: theme.colors.text,
    fontWeight: '700',
    marginBottom: 4,
  },
  versionCaption: {
    maxWidth: 320,
  },
  bioCard: {
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.sm,
  },
  bioRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
  },
  bioIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  bioIconWrapActive: {
    backgroundColor: 'rgba(61, 220, 151, 0.14)',
    borderColor: 'rgba(61, 220, 151, 0.35)',
  },
  bioIconWrapIdle: {
    backgroundColor: 'rgba(86, 194, 255, 0.1)',
    borderColor: theme.colors.borderStrong,
  },
  bioTextCol: {
    flex: 1,
    gap: 4,
    minWidth: 0,
  },
  bioHeading: {
    fontWeight: '800',
    fontSize: 16,
    color: theme.colors.text,
  },
  bioSub: {
    lineHeight: 17,
  },
  bioBadgeRow: {
    marginTop: 6,
  },
});
