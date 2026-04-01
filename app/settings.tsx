import Constants from 'expo-constants';
import { router } from 'expo-router';
import { Alert, StyleSheet, View } from 'react-native';
import { Fingerprint, Globe, LockKeyhole, Shield, Wifi } from 'lucide-react-native';
import { useEffect, useState } from 'react';

import { Card } from '@/components/ui/Card';
import { ListItem, ToggleTrailing } from '@/components/ui/ListItem';
import { Screen } from '@/components/ui/Screen';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Body, Caption, Eyebrow, Subtitle, Title } from '@/components/ui/Typography';
import { theme } from '@/constants/theme';
import { appendActivityLog } from '@/services/activityLog';
import { isBiometricAvailable } from '@/services/biometricService';
import { useAppStore } from '@/store/appStore';

export default function SettingsScreen() {
  const settings = useAppStore((s) => s.settings);
  const biometricEnabled = useAppStore((s) => s.biometricEnabled);
  const savedCredentials = useAppStore((s) => s.savedCredentials);
  const setSettings = useAppStore((s) => s.setSettings);
  const setRememberMe = useAppStore((s) => s.setRememberMe);
  const setBiometric = useAppStore((s) => s.setBiometric);

  const [hardwareAvailable, setHardwareAvailable] = useState(false);
  const version = Constants.expoConfig?.version ?? '1.0.0';

  useEffect(() => {
    void (async () => {
      setHardwareAvailable(await isBiometricAvailable());
    })();
  }, []);

  async function onRememberToggle(nextValue: boolean) {
    if (nextValue) {
      await setRememberMe(true);
      await appendActivityLog('info', 'Remember credentials toggled', { on: true });
      return;
    }

    Alert.alert(
      'Turn off Remember Me?',
      'Turning off Remember Me will remove saved login credentials and disable fingerprint login. Continue?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Continue',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              await setRememberMe(false);
              await appendActivityLog('info', 'Remember credentials toggled', { on: false });
            })();
          },
        },
      ]
    );
  }

  async function onBiometricToggle(nextValue: boolean) {
    if (!nextValue) {
      await setBiometric(false);
      await appendActivityLog('info', 'Biometric toggled', { enabled: false });
      return;
    }

    if (!settings.rememberCredentials) {
      Alert.alert('Fingerprint Login', 'Enable Remember Me first to use fingerprint login.');
      return;
    }
    if (!savedCredentials) {
      Alert.alert('Fingerprint Login', 'Login successfully once to activate fingerprint login.');
      return;
    }
    if (!hardwareAvailable) {
      Alert.alert('Fingerprint Login', 'Biometric hardware is not available or not enrolled.');
      return;
    }

    await setBiometric(true);
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
            <Caption style={styles.summaryLabel}>Security posture</Caption>
            <Body style={styles.summaryText}>
              {settings.rememberCredentials
                ? savedCredentials
                  ? 'Saved credentials ready.'
                  : 'Remember Me is on.'
                : 'No saved credentials.'}
            </Body>
          </View>
          <StatusBadge
            tone={settings.rememberCredentials ? (savedCredentials ? 'success' : 'warning') : 'neutral'}
            label={settings.rememberCredentials ? (savedCredentials ? 'Ready' : 'Pending') : 'Manual'}
          />
        </View>
      </Card>

      <SectionHeader title="Security" />
      <Card>
        <ListItem
          title="Remember Me"
          subtitle="Save last successful login."
          icon={LockKeyhole}
          trailing={<ToggleTrailing value={settings.rememberCredentials} onValueChange={onRememberToggle} />}
        />
        <ListItem
          title="Fingerprint Login"
          subtitle={
            !settings.rememberCredentials
              ? 'Enable Remember Me first to unlock biometric login.'
              : !savedCredentials
                ? 'Login once to activate.'
                : hardwareAvailable
                  ? 'Use saved credentials after fingerprint.'
                  : 'Biometric hardware unavailable.'
          }
          icon={Fingerprint}
          trailing={
            <ToggleTrailing
              value={biometricEnabled}
              onValueChange={onBiometricToggle}
              disabled={!hardwareAvailable}
            />
          }
        />
      </Card>

      <SectionHeader title="Network" />
      <Card>
        <ListItem
          title="Firewall Endpoint"
          subtitle={settings.firewallEndpoint}
          icon={Globe}
          onPress={() => router.push('/endpoint')}
        />
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
    marginTop: theme.spacing.md,
  },
  summaryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: theme.spacing.md,
  },
  summaryLabel: {
    color: theme.colors.cyan,
    fontWeight: '700',
  },
  summaryText: {
    color: theme.colors.text,
    marginTop: 6,
    maxWidth: 250,
  },
  versionText: {
    color: theme.colors.text,
    fontWeight: '700',
    marginBottom: theme.spacing.sm,
  },
  versionCaption: {
    maxWidth: 320,
  },
});
