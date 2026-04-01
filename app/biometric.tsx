import { router } from 'expo-router';
import { Fingerprint, Settings2, ShieldCheck } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';

import { PrimaryButton } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Screen } from '@/components/ui/Screen';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Body, Caption, Eyebrow, Subtitle, Title } from '@/components/ui/Typography';
import { theme } from '@/constants/theme';
import { useAppStore } from '@/store/appStore';

export default function BiometricScreen() {
  const settings = useAppStore((s) => s.settings);
  const biometricEnabled = useAppStore((s) => s.biometricEnabled);
  const savedCredentials = useAppStore((s) => s.savedCredentials);

  return (
    <Screen scroll contentStyle={styles.content}>
      <Eyebrow>Security</Eyebrow>
      <Title style={styles.title}>Biometric Login</Title>
      <Subtitle>Fingerprint access is managed from Settings and only works with remembered successful credentials.</Subtitle>

      <Card style={styles.card}>
        <View style={styles.header}>
          <View style={styles.iconWrap}>
            <Fingerprint color={theme.colors.primary} size={22} strokeWidth={2.2} />
          </View>
          <StatusBadge
            tone={biometricEnabled ? 'success' : settings.rememberCredentials ? 'warning' : 'neutral'}
            label={biometricEnabled ? 'Enabled' : settings.rememberCredentials ? 'Available' : 'Disabled'}
          />
        </View>

        <Body style={styles.body}>
          {settings.rememberCredentials
            ? savedCredentials
              ? 'This device can use the latest remembered credentials after a successful biometric check.'
              : 'Remember Me is enabled, but biometric login will remain unavailable until one successful login stores credentials.'
            : 'Remember Me is disabled, so fingerprint login cannot be used.'}
        </Body>

        <Caption style={styles.caption}>
          WiFiGate keeps biometric availability aligned with remembered credentials to avoid confusing or insecure states.
        </Caption>

        <PrimaryButton title="Open Settings" onPress={() => router.replace('/(tabs)/settings')} icon={Settings2} trailingArrow />
        <View style={styles.gap} />
        <PrimaryButton title="Go to Session" onPress={() => router.replace('/(tabs)/session')} variant="secondary" icon={ShieldCheck} />
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingTop: theme.spacing.xl,
  },
  title: {
    marginTop: theme.spacing.sm,
    marginBottom: theme.spacing.sm,
  },
  card: {
    marginTop: theme.spacing.xl,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing.lg,
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(86, 194, 255, 0.1)',
  },
  body: {
    color: theme.colors.text,
  },
  caption: {
    marginTop: theme.spacing.md,
    marginBottom: theme.spacing.lg,
  },
  gap: {
    height: theme.spacing.md,
  },
});
