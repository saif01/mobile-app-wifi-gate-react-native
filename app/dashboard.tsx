import { useFocusEffect } from '@react-navigation/native';
import { router } from 'expo-router';
import {
  ArrowRightLeft,
  Globe,
  LogOut,
  RefreshCw,
  ShieldCheck,
  Wifi,
  WifiOff,
} from 'lucide-react-native';
import { useCallback, useMemo, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';

import { PrimaryButton } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Screen } from '@/components/ui/Screen';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Body, Caption, Eyebrow, Subtitle, Title } from '@/components/ui/Typography';
import { theme } from '@/constants/theme';
import { appendActivityLog } from '@/services/activityLog';
import { evaluateWifiAccess, getNetworkSnapshot } from '@/services/networkService';
import type { NetworkSnapshot } from '@/types/models';
import { useAppStore } from '@/store/appStore';

function MetricCard({
  title,
  value,
  subtitle,
  tone,
  icon: Icon,
}: {
  title: string;
  value: string;
  subtitle?: string;
  tone: 'success' | 'error' | 'warning' | 'neutral';
  icon: typeof Wifi;
}) {
  return (
    <Card style={styles.metricCard}>
      <View style={styles.metricHeader}>
        <View style={styles.metricIcon}>
          <Icon color={theme.colors.primary} size={18} strokeWidth={2.2} />
        </View>
        <StatusBadge tone={tone} label={tone === 'success' ? 'Healthy' : tone === 'error' ? 'Attention' : tone === 'warning' ? 'Warning' : 'Checking'} />
      </View>
      <Caption style={styles.metricTitle}>{title}</Caption>
      <Title style={styles.metricValue}>{value}</Title>
      {subtitle ? <Caption>{subtitle}</Caption> : null}
    </Card>
  );
}

export default function DashboardScreen() {
  const settings = useAppStore((s) => s.settings);
  const isAuthenticated = useAppStore((s) => s.isAuthenticated);
  const lastLoginAt = useAppStore((s) => s.lastLoginAt);
  const clearSession = useAppStore((s) => s.clearSession);

  const [snap, setSnap] = useState<NetworkSnapshot | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const access = useMemo(
    () => (snap ? evaluateWifiAccess(snap, settings.allowedWifi) : null),
    [settings.allowedWifi, snap]
  );

  const refresh = useCallback(async () => {
    const s = await getNetworkSnapshot();
    setSnap(s);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh])
  );

  async function onRefresh() {
    setRefreshing(true);
    try {
      await refresh();
      await appendActivityLog('info', 'Status refreshed');
    } finally {
      setRefreshing(false);
    }
  }

  async function logout() {
    await appendActivityLog('info', 'Logout');
    await clearSession();
    router.replace('/(tabs)/session');
  }

  const wifiTone: 'success' | 'error' | 'warning' | 'neutral' = !snap
    ? 'neutral'
    : snap.isWifi
      ? 'success'
      : snap.isCellular
        ? 'warning'
        : 'error';

  const accessTone: 'success' | 'error' | 'warning' | 'neutral' = !access
    ? 'neutral'
    : access.match
      ? 'success'
      : access.noRestriction
        ? 'warning'
        : 'error';

  const sessionTone: 'success' | 'error' = isAuthenticated ? 'success' : 'error';
  const lastStr = lastLoginAt ? new Date(lastLoginAt).toLocaleString() : 'No successful login recorded';

  return (
    <Screen>
      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.primary} />}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scroll}>
        <View style={styles.hero}>
          <View style={styles.heroText}>
            <Eyebrow>Operations Overview</Eyebrow>
            <Title style={styles.heroTitle}>WiFi overview</Title>
            <Subtitle style={styles.heroSubtitle}>Status, session, and quick actions.</Subtitle>
          </View>
          <StatusBadge tone={isAuthenticated ? 'success' : 'error'} label={isAuthenticated ? 'Live Session' : 'Signed Out'} />
        </View>

        <View style={styles.metricsGrid}>
          <MetricCard
            title="WiFi Status"
            value={snap?.isWifi ? snap.ssid || 'Connected' : snap?.isCellular ? 'Cellular' : 'Offline'}
            subtitle={snap?.gatewayIp ? `Gateway ${snap.gatewayIp}` : 'Waiting for connection data'}
            tone={wifiTone}
            icon={snap?.isWifi ? Wifi : WifiOff}
          />
          <MetricCard
            title="Access Policy"
            value={
              access?.match ? 'Authorized' : access?.noRestriction ? 'Open Access' : access ? 'Unauthorized' : 'Checking'
            }
            subtitle={
              access?.match
                ? `Matched ${access.match.ssid || access.match.ip}`
                : `${settings.allowedWifi.filter((entry) => entry.isActive).length} active allowed WiFi entries`
            }
            tone={accessTone}
            icon={ShieldCheck}
          />
        </View>

        <Card style={styles.sessionCard}>
          <View style={styles.sessionHeader}>
            <View style={styles.sessionHeaderText}>
              <Caption style={styles.metaLabel}>Session</Caption>
              <Subtitle style={styles.sessionTitle}>{isAuthenticated ? 'Firewall session is active' : 'Authentication required'}</Subtitle>
            </View>
            <StatusBadge tone={sessionTone} label={isAuthenticated ? 'Authenticated' : 'Inactive'} />
          </View>
          <View style={styles.sessionDetails}>
            <View style={styles.sessionMetric}>
              <Caption>Last login</Caption>
              <Body style={styles.sessionMetricValue}>{lastStr}</Body>
            </View>
            <View style={styles.sessionMetric}>
              <Caption>Endpoint</Caption>
              <Body style={styles.sessionMetricValue}>{settings.firewallEndpoint}</Body>
            </View>
          </View>
        </Card>

        <SectionHeader title="Quick Actions" />
        <View style={styles.actionStack}>
          <PrimaryButton
            title={isAuthenticated ? 'Reconnect Session' : 'Open Login'}
            onPress={() => router.push('/(tabs)/session')}
            icon={ArrowRightLeft}
            trailingArrow
          />
          <PrimaryButton title="Refresh Status" onPress={onRefresh} variant="secondary" icon={RefreshCw} />
          <PrimaryButton title="Open Browser Login" onPress={() => router.push('/webview-login')} variant="ghost" icon={Globe} />
          <PrimaryButton title="Logout" onPress={logout} variant="danger" icon={LogOut} />
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: {
    paddingHorizontal: theme.spacing.xl,
    paddingTop: theme.spacing.md,
    paddingBottom: 128,
  },
  hero: {
    marginTop: theme.spacing.sm,
    marginBottom: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  heroText: {
    gap: theme.spacing.sm,
  },
  heroTitle: {
    fontSize: theme.typography.hero,
  },
  heroSubtitle: {
    maxWidth: 260,
  },
  metricsGrid: {
    gap: theme.spacing.sm,
  },
  metricCard: {
    gap: 6,
    padding: theme.spacing.md,
  },
  metricHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: theme.spacing.md,
  },
  metricIcon: {
    width: 42,
    height: 42,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(86, 194, 255, 0.1)',
  },
  metricTitle: {
    color: theme.colors.cyan,
    fontWeight: '700',
  },
  metricValue: {
    fontSize: 20,
  },
  sessionCard: {
    marginTop: theme.spacing.sm,
    padding: theme.spacing.md,
  },
  sessionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: theme.spacing.md,
    marginBottom: theme.spacing.md,
  },
  sessionHeaderText: {
    flex: 1,
    paddingRight: theme.spacing.sm,
  },
  metaLabel: {
    color: theme.colors.cyan,
    fontWeight: '700',
  },
  sessionTitle: {
    marginTop: 4,
    color: theme.colors.text,
    fontSize: 15,
  },
  sessionDetails: {
    gap: theme.spacing.sm,
  },
  sessionMetric: {
    gap: 6,
  },
  sessionMetricValue: {
    color: theme.colors.text,
  },
  actionStack: {
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.xxl,
  },
});
