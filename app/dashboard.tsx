import { useFocusEffect } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
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
import { Platform, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { PrimaryButton } from '@/components/ui/Button';
import { Screen } from '@/components/ui/Screen';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Body, Caption, Eyebrow, Title } from '@/components/ui/Typography';
import { theme } from '@/constants/theme';
import { appendActivityLog } from '@/services/activityLog';
import { evaluateWifiAccess, getNetworkSnapshot } from '@/services/networkService';
import type { NetworkSnapshot } from '@/types/models';
import { useAppStore } from '@/store/appStore';

function StatBlock({
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
  const badgeLabel =
    tone === 'success' ? 'OK' : tone === 'error' ? 'Issue' : tone === 'warning' ? 'Warn' : '…';

  return (
    <View style={styles.statBlock}>
      <View style={styles.statTop}>
        <View style={styles.statIcon}>
          <Icon color={theme.colors.primary} size={15} strokeWidth={2.2} />
        </View>
        <StatusBadge tone={tone} label={badgeLabel} />
      </View>
      <Caption style={styles.statLabel}>{title}</Caption>
      <Title style={styles.statValue} numberOfLines={1}>
        {value}
      </Title>
      {subtitle ? (
        <Caption style={styles.statSub} numberOfLines={2}>
          {subtitle}
        </Caption>
      ) : null}
    </View>
  );
}

export default function DashboardScreen() {
  const settings = useAppStore((s) => s.settings);
  const isAuthenticated = useAppStore((s) => s.isAuthenticated);
  const lastLoginAt = useAppStore((s) => s.lastLoginAt);
  const authAgent = useAppStore((s) => s.authAgent);
  const storedCredentialsAvailable = useAppStore((s) => s.storedCredentialsAvailable);
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
  const lastStr = lastLoginAt ? new Date(lastLoginAt).toLocaleString() : '—';
  const agentTone: 'success' | 'error' | 'warning' | 'neutral' =
    authAgent.status === 'authenticated'
      ? 'success'
      : authAgent.status === 'authenticating' || authAgent.status === 'checking'
        ? 'warning'
        : authAgent.status === 'error' || authAgent.status === 'blocked' || authAgent.status === 'needs_portal'
          ? 'error'
          : 'neutral';

  const autoLoginRunning =
    settings.autoLoginEnabled &&
    (authAgent.status === 'authenticating' || authAgent.status === 'checking');

  const loginOutcomeLabel = isAuthenticated
    ? 'Login successful'
    : authAgent.status === 'error' || authAgent.status === 'needs_portal'
      ? 'Login failed or needs browser'
      : 'Not signed in';

  return (
    <Screen>
      <ScrollView
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.primary} />
        }
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scroll}>
        <View style={styles.hero}>
          <View style={styles.heroRow}>
            <View style={styles.heroText}>
              <Eyebrow style={styles.heroEyebrow}>Overview</Eyebrow>
              <Title style={styles.heroTitle}>Dashboard</Title>
            </View>
            <StatusBadge tone={isAuthenticated ? 'success' : 'error'} label={isAuthenticated ? 'Live' : 'Idle'} />
          </View>
          <Caption style={styles.heroSub}>Network, policy, session.</Caption>
        </View>

        <View style={styles.mainCard}>
          <LinearGradient
            colors={['#46e2d8', '#56c2ff', '#2e8fff']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.cardAccent}
          />

          <View style={styles.statsRow}>
            <StatBlock
              title="WiFi"
              value={snap?.isWifi ? snap.ssid || 'On' : snap?.isCellular ? 'Cell' : 'Off'}
              subtitle={snap?.gatewayIp ? `GW ${snap.gatewayIp}` : snap ? 'No gateway yet' : '…'}
              tone={wifiTone}
              icon={snap?.isWifi ? Wifi : WifiOff}
            />
            <View style={styles.statDivider} />
            <StatBlock
              title="Access"
              value={
                access?.match ? 'OK' : access?.noRestriction ? 'Open' : access ? 'Denied' : '…'
              }
              subtitle={
                access?.match
                  ? `${access.match.ssid || access.match.ip}`
                  : `${settings.allowedWifi.filter((e) => e.isActive).length} allowed`
              }
              tone={accessTone}
              icon={ShieldCheck}
            />
          </View>

          <View style={styles.dividerMuted} />

          <View style={styles.sessionHeaderRow}>
            <Caption style={styles.sessionEyebrow}>Session</Caption>
            <StatusBadge tone={sessionTone} label={isAuthenticated ? 'Active' : 'None'} />
          </View>
          <Body style={styles.sessionLine} numberOfLines={2}>
            {isAuthenticated ? 'Firewall session is active.' : 'Sign in to open a session.'}
          </Body>

          <View style={styles.outcomeRow}>
            <Caption style={styles.metaLabel}>Login status</Caption>
            <Text style={styles.metaValue} numberOfLines={2}>
              {loginOutcomeLabel}
              {autoLoginRunning ? ' · Auto-login running' : ''}
            </Text>
          </View>

          <View style={styles.metaGrid}>
            <View style={styles.metaCell}>
              <Caption style={styles.metaLabel}>Saved credentials</Caption>
              <View style={styles.agentRow}>
                <StatusBadge tone={storedCredentialsAvailable ? 'success' : 'neutral'} label={storedCredentialsAvailable ? 'Available' : 'None'} />
                <Text style={styles.metaValue} numberOfLines={2}>
                  {storedCredentialsAvailable
                    ? 'Stored in secure storage (not shown in UI).'
                    : 'Sign in successfully once to enable auto-login.'}
                </Text>
              </View>
            </View>
            <View style={styles.metaCell}>
              <Caption style={styles.metaLabel}>Auto-login</Caption>
              <View style={styles.agentRow}>
                <StatusBadge
                  tone={!settings.autoLoginEnabled ? 'neutral' : autoLoginRunning ? 'warning' : 'success'}
                  label={!settings.autoLoginEnabled ? 'Off' : autoLoginRunning ? 'Running' : 'On'}
                />
                <Text style={styles.metaValue} numberOfLines={2}>
                  {!settings.autoLoginEnabled
                    ? 'Enable under Settings to log in automatically when Wi‑Fi is ready.'
                    : autoLoginRunning
                      ? authAgent.message
                      : 'Monitors Wi‑Fi and portal when the app is open.'}
                </Text>
              </View>
            </View>
            <View style={styles.metaCell}>
              <Caption style={styles.metaLabel}>Last login</Caption>
              <Text style={styles.metaValue} numberOfLines={2}>
                {lastStr}
              </Text>
            </View>
            <View style={styles.metaCell}>
              <Caption style={styles.metaLabel}>Auth agent</Caption>
              <View style={styles.agentRow}>
                <StatusBadge tone={agentTone} label={authAgent.status === 'authenticated' ? 'Auto' : 'Monitor'} />
                <Text style={styles.metaValue} numberOfLines={3}>
                  {authAgent.message}
                </Text>
              </View>
            </View>
            <View style={styles.metaCell}>
              <Caption style={styles.metaLabel}>Endpoint</Caption>
              <Text
                style={styles.endpointMono}
                numberOfLines={3}
                selectable>
                {settings.firewallEndpoint}
              </Text>
            </View>
          </View>
        </View>

        <Caption style={styles.actionsEyebrow}>Actions</Caption>
        <View style={styles.actionStack}>
          <PrimaryButton
            title={isAuthenticated ? 'Reconnect' : 'Login'}
            onPress={() => router.push('/(tabs)/session')}
            icon={ArrowRightLeft}
            trailingArrow
          />
          <View style={styles.actionRow}>
            <PrimaryButton title="Refresh" onPress={onRefresh} variant="secondary" icon={RefreshCw} style={styles.actionHalf} />
            <PrimaryButton
              title="Browser"
              onPress={() => router.push('/webview-login')}
              variant="ghost"
              icon={Globe}
              style={styles.actionHalf}
            />
          </View>
          <PrimaryButton title="Logout" onPress={logout} variant="danger" icon={LogOut} />
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: {
    paddingHorizontal: theme.spacing.xl,
    paddingTop: theme.spacing.sm,
    paddingBottom: 120,
  },
  hero: {
    marginBottom: theme.spacing.md,
  },
  heroRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: theme.spacing.md,
    marginBottom: theme.spacing.xs,
  },
  heroText: {
    flex: 1,
    minWidth: 0,
  },
  heroEyebrow: {
    fontSize: 10,
    marginBottom: 2,
  },
  heroTitle: {
    fontSize: 24,
    letterSpacing: -0.5,
    fontWeight: '800',
  },
  heroSub: {
    color: theme.colors.textSoft,
    fontSize: 12,
  },
  mainCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing.lg,
    paddingTop: theme.spacing.md + 3,
    overflow: 'hidden',
    marginBottom: theme.spacing.lg,
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
  statsRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 0,
  },
  statBlock: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  statTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.xs,
    marginBottom: 2,
  },
  statIcon: {
    width: 28,
    height: 28,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(86, 194, 255, 0.1)',
  },
  statLabel: {
    color: theme.colors.cyan,
    fontWeight: '700',
    fontSize: 10,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  statValue: {
    fontSize: 17,
    letterSpacing: -0.3,
    fontWeight: '800',
  },
  statSub: {
    color: theme.colors.textSoft,
    fontSize: 11,
    lineHeight: 15,
  },
  statDivider: {
    width: StyleSheet.hairlineWidth,
    backgroundColor: theme.colors.borderStrong,
    marginHorizontal: theme.spacing.sm,
  },
  dividerMuted: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: theme.colors.border,
    marginVertical: theme.spacing.md,
  },
  sessionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.xs,
  },
  sessionEyebrow: {
    color: theme.colors.cyan,
    fontWeight: '700',
    letterSpacing: 0.6,
    fontSize: 10,
    textTransform: 'uppercase',
  },
  sessionLine: {
    color: theme.colors.textMuted,
    fontSize: 13,
    lineHeight: 18,
    marginBottom: theme.spacing.sm,
  },
  outcomeRow: {
    gap: 4,
    marginBottom: theme.spacing.sm,
  },
  metaGrid: {
    gap: theme.spacing.sm,
  },
  metaCell: {
    gap: 4,
  },
  agentRow: {
    gap: theme.spacing.xs,
  },
  metaLabel: {
    color: theme.colors.textSoft,
    fontWeight: '700',
    fontSize: 10,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  metaValue: {
    color: theme.colors.text,
    fontSize: 13,
    lineHeight: 18,
  },
  endpointMono: {
    color: theme.colors.text,
    fontSize: 11,
    fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
    lineHeight: 16,
  },
  actionsEyebrow: {
    color: theme.colors.textSoft,
    fontWeight: '700',
    letterSpacing: 0.8,
    fontSize: 10,
    textTransform: 'uppercase',
    marginBottom: theme.spacing.sm,
  },
  actionStack: {
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.xl,
  },
  actionRow: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  actionHalf: {
    flex: 1,
  },
});
