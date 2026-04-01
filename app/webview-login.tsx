import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { Globe, MonitorSmartphone } from 'lucide-react-native';

import { Card } from '@/components/ui/Card';
import { Screen } from '@/components/ui/Screen';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Body, Caption, Eyebrow, Subtitle, Title } from '@/components/ui/Typography';
import { theme } from '@/constants/theme';
import { useAppStore } from '@/store/appStore';

export default function WebViewLoginScreen() {
  const endpoint = useAppStore((s) => s.settings.firewallEndpoint);
  const uri = useMemo(() => endpoint, [endpoint]);

  return (
    <Screen contentStyle={styles.content}>
      <View style={styles.header}>
        <Eyebrow>Fallback Flow</Eyebrow>
        <Title style={styles.title}>Browser Login</Title>
        <Subtitle>Use this if direct login fails.</Subtitle>
      </View>

      <Card style={styles.infoCard}>
        <View style={styles.infoHeader}>
          <View style={styles.iconWrap}>
            <MonitorSmartphone color={theme.colors.primary} size={18} strokeWidth={2.2} />
          </View>
          <StatusBadge tone="warning" label="Manual Flow" />
        </View>
        <Body style={styles.infoText}>
          Complete login in the portal.
        </Body>
        <View style={styles.endpointRow}>
          <Globe color={theme.colors.textMuted} size={16} strokeWidth={2.1} />
          <Caption>{uri}</Caption>
        </View>
      </Card>

      <View style={styles.webShell}>
        <WebView source={{ uri }} style={styles.web} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: theme.spacing.xl,
    paddingTop: theme.spacing.lg,
    paddingBottom: theme.spacing.xl,
  },
  header: {
    marginTop: theme.spacing.md,
    marginBottom: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  title: {
    fontSize: theme.typography.hero,
  },
  infoCard: {
    marginBottom: theme.spacing.lg,
  },
  infoHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: theme.spacing.md,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(86, 194, 255, 0.1)',
  },
  infoText: {
    color: theme.colors.text,
    marginBottom: theme.spacing.md,
  },
  endpointRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  webShell: {
    flex: 1,
    overflow: 'hidden',
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.bgSoft,
  },
  web: {
    flex: 1,
    backgroundColor: theme.colors.bgSoft,
  },
});
