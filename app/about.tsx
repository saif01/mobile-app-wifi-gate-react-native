import Constants from 'expo-constants';
import { BookText, Building2, LifeBuoy, Smartphone, Sparkles } from 'lucide-react-native';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import { AboutCard } from '@/components/about/AboutCard';
import { Screen } from '@/components/ui/Screen';
import { Body, Eyebrow, Subtitle, Title } from '@/components/ui/Typography';
import { theme } from '@/constants/theme';

const COMPANY_WEBSITE = 'https://cpbangladesh.com';
const SUPPORT_EMAIL = 'syful@cpbangladesh.com';
const SUPPORT_PHONE = '+8801730731201';

function InfoRow({ label, value, subdued = false }: { label: string; value: string; subdued?: boolean }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={[styles.infoValue, subdued && styles.infoValueSubdued]}>{value}</Text>
    </View>
  );
}

function LinkRow({ label, value, href }: { label: string; value: string; href: string }) {
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`${label}: ${value}`}
      onPress={() => void Linking.openURL(href)}
      style={({ pressed }) => [styles.linkRow, pressed && styles.linkRowPressed]}
    >
      <View style={styles.linkRowInner}>
        <Text style={styles.linkLabel}>{label}</Text>
        <Text style={styles.linkValueText} selectable>
          {value}
        </Text>
      </View>
    </Pressable>
  );
}

export default function AboutScreen() {
  const version = Constants.expoConfig?.version ?? '1.0.2';

  return (
    <Screen scroll contentStyle={styles.content}>
      <View style={styles.hero}>
        <Eyebrow>About</Eyebrow>
        <Title style={styles.title}>WiFiGate</Title>
        <Subtitle>Secure captive portal access for enterprise WiFi.</Subtitle>
      </View>

      <View style={styles.cards}>
        <AboutCard title="Version Info" icon={Smartphone}>
          <InfoRow label="App Version" value={`v${version}`} />
          <Body style={styles.summary}>
            Built for firewall login, WiFi control, and secure remembered access.
          </Body>
        </AboutCard>

        <AboutCard title="Capabilities" icon={Sparkles}>
          <InfoRow label="Firewall Login" value="Portal sign-in & browser fallback" />
          <InfoRow label="WiFi Rules" value="Login only on selected networks" />
          <InfoRow label="Secure Storage" value="Credentials in secure storage" />
        </AboutCard>

        <AboutCard title="Company Info" icon={Building2}>
          <InfoRow label="Powered By" value="CPB-IT" />
          <InfoRow label="Developer" value="CPB Application Development Team" />
          <LinkRow label="Website" value={COMPANY_WEBSITE} href={COMPANY_WEBSITE} />
        </AboutCard>

        <AboutCard title="Credits" icon={BookText}>
          <InfoRow label="Core Stack" value="Expo Router, React Native, TypeScript" />
          <InfoRow label="UI & Icons" value="Lucide React Native, Safe Area Context" />
          <InfoRow label="Data & Platform" value="Axios, Expo Updates, WebView support" />
        </AboutCard>

        <View style={styles.supportCard}>
          <AboutCard title="Support" icon={LifeBuoy}>
            <LinkRow label="Email" value={SUPPORT_EMAIL} href={`mailto:${SUPPORT_EMAIL}`} />
            <LinkRow label="Phone" value={SUPPORT_PHONE} href={`tel:${SUPPORT_PHONE.replace(/\s/g, '')}`} />
          </AboutCard>
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingTop: theme.spacing.lg,
    paddingBottom: theme.spacing.xxl,
    gap: theme.spacing.md,
  },
  hero: {
    marginTop: theme.spacing.md,
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.sm,
  },
  title: {
    fontSize: theme.typography.hero,
  },
  cards: {
    gap: 14,
  },
  supportCard: {
    marginBottom: theme.spacing.xxxl,
  },
  summary: {
    color: theme.colors.textMuted,
    lineHeight: 20,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    minHeight: 28,
  },
  infoLabel: {
    flex: 1,
    fontSize: 13,
    color: theme.colors.textSoft,
    fontWeight: '600',
  },
  infoValue: {
    flex: 1,
    fontSize: 14,
    color: theme.colors.text,
    fontWeight: '700',
    textAlign: 'right',
  },
  infoValueSubdued: {
    color: theme.colors.textMuted,
  },
  linkRow: {
    borderRadius: 16,
    backgroundColor: theme.colors.surfaceMuted,
    borderWidth: 1,
    borderColor: theme.colors.borderStrong,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  linkRowPressed: {
    opacity: 0.92,
  },
  linkRowInner: {
    width: '100%',
    gap: 6,
  },
  linkLabel: {
    fontSize: 12,
    color: theme.colors.textSoft,
    fontWeight: '700',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  linkValueText: {
    fontSize: 15,
    lineHeight: 22,
    color: theme.colors.cyan,
    fontWeight: '700',
  },
});
