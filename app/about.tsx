import Constants from 'expo-constants';
import { Info, ShieldCheck, Wifi } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';

import { Card } from '@/components/ui/Card';
import { ListItem } from '@/components/ui/ListItem';
import { Screen } from '@/components/ui/Screen';
import { Body, Caption, Eyebrow, Subtitle, Title } from '@/components/ui/Typography';
import { theme } from '@/constants/theme';

export default function AboutScreen() {
  const version = Constants.expoConfig?.version ?? '1.0.1';

  return (
    <Screen scroll contentStyle={styles.content}>
      <View style={styles.hero}>
        <Eyebrow>About</Eyebrow>
        <Title style={styles.title}>WiFiGate</Title>
        <Subtitle>Secure captive portal access for enterprise WiFi.</Subtitle>
      </View>

      <Card style={styles.card}>
        <Body style={styles.version}>Version {version}</Body>
        <Caption style={styles.caption}>Build for firewall login, WiFi control, and secure remembered access.</Caption>
      </Card>

      <Card>
        <ListItem title="Firewall Login" subtitle="Direct portal sign in and browser fallback." icon={ShieldCheck} />
        <ListItem title="WiFi Rules" subtitle="Allow login only on selected networks." icon={Wifi} />
        <ListItem title="Secure Storage" subtitle="Credentials stay in secure storage only." icon={Info} />
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
  card: {
    marginBottom: theme.spacing.sm,
  },
  version: {
    color: theme.colors.text,
    fontWeight: '700',
    marginBottom: 4,
  },
  caption: {
    maxWidth: 300,
  },
});
