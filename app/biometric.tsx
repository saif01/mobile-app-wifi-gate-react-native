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
  const biometricEnabled = useAppStore((s) => s.biometricEnabled);
  const biometricCredentialsStored = useAppStore((s) => s.biometricCredentialsStored);
  const lastLoginId = useAppStore((s) => s.lastLoginId);

  return (
    <Screen scroll contentStyle={styles.content}>
      <Eyebrow>Security</Eyebrow>
      <Title style={styles.title}>Fingerprint Login</Title>
      <Subtitle>Stored credentials are used only after fingerprint verification.</Subtitle>

      <Card style={styles.card}>
        <View style={styles.header}>
          <View style={styles.iconWrap}>
            <Fingerprint color={theme.colors.primary} size={22} strokeWidth={2.2} />
          </View>
          <StatusBadge tone={biometricEnabled && biometricCredentialsStored ? 'success' : 'neutral'} label={biometricEnabled && biometricCredentialsStored ? 'Enabled' : 'Disabled'} />
        </View>

        <Body style={styles.body}>
          {lastLoginId
            ? `Last successful ID: ${lastLoginId}`
            : 'Login with ID and password first to prepare fingerprint login.'}
        </Body>
        <Caption style={styles.caption}>The password is never shown again on the login screen.</Caption>

        <PrimaryButton title="Open Settings" onPress={() => router.replace('/(tabs)/settings')} icon={Settings2} trailingArrow />
        <View style={styles.gap} />
        <PrimaryButton title="Go to Login" onPress={() => router.replace('/(tabs)/session')} variant="secondary" icon={ShieldCheck} />
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
