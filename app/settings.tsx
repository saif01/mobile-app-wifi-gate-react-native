import Constants from 'expo-constants';
import { router } from 'expo-router';
import { Alert, StyleSheet, View } from 'react-native';
import { Fingerprint, Globe, Info, Shield, Wifi } from 'lucide-react-native';
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
  const version = Constants.expoConfig?.version ?? '1.0.1';

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
      <Card>
        <ListItem
          title="Fingerprint Login"
          subtitle={
            !manualLoginDone
              ? 'Login with ID and password first.'
              : biometricCredentialsStored
                ? 'Use stored credentials after fingerprint.'
                : 'Enable after your latest manual login.'
          }
          icon={Fingerprint}
          trailing={<ToggleTrailing value={biometricEnabled} onValueChange={onBiometricToggle} disabled={!hardwareAvailable && !biometricEnabled} />}
        />
      </Card>

      <SectionHeader title="Network" />
      <Card>
        <ListItem
          title="Auto Login Agent"
          subtitle={settings.autoLoginEnabled ? 'Automatically authenticate on allowed WiFi.' : 'Only detect WiFi and wait for manual action.'}
          icon={Shield}
          trailing={
            <ToggleTrailing
              value={settings.autoLoginEnabled}
              onValueChange={async (v) => {
                await setSettings({ autoLoginEnabled: v });
              }}
            />
          }
        />
        <ListItem title="Firewall Endpoint" subtitle={settings.firewallEndpoint} icon={Globe} onPress={() => router.push('/endpoint')} />
        <ListItem
          title="Allowed WiFi List"
          subtitle={`${settings.allowedWifi.filter((entry) => entry.isActive).length} active entries`}
          icon={Wifi}
          onPress={() => router.push('/(tabs)/wifi')}
        />
        <ListItem
          title="Warn About Mobile Data"
          subtitle="Warn if mobile data may interfere."
          icon={Shield}
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
        <ListItem title="About" subtitle="Version, app info, and features." icon={Info} onPress={() => router.push('/about')} />
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
});
