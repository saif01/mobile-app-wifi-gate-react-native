import { useFocusEffect } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import {
  ArrowRightLeft,
  Bot,
  Clock,
  Globe,
  Key,
  LogIn,
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
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Body, Caption, Eyebrow, Title } from '@/components/ui/Typography';
import { theme } from '@/constants/theme';
import { appendActivityLog } from '@/services/activityLog';
import { evaluateWifiAccess, getNetworkSnapshot } from '@/services/networkService';
import type { NetworkSnapshot } from '@/types/models';
import { useAppStore } from '@/store/appStore';

/** Tone → icon & badge colour */
function toneColor(tone: 'success' | 'error' | 'warning' | 'neutral') {
  return tone === 'success'
    ? theme.colors.success
    : tone === 'error'
      ? theme.colors.danger
      : tone === 'warning'
        ? theme.colors.warning
        : theme.colors.textSoft;
}

function StatBlock({
  title,
  value,
  subtitle,
  tone,
  badgeLabel,
  icon: Icon,
}: {
  title: string;
  value: string;
  subtitle?: string;
  tone: 'success' | 'error' | 'warning' | 'neutral';
  badgeLabel?: string;
  icon: typeof Wifi;
}) {
  const color = toneColor(tone);
  const label = badgeLabel ?? (tone === 'success' ? 'OK' : tone === 'error' ? 'Issue' : tone === 'warning' ? 'Warn' : '—');

  return (
    <View style={styles.statBlock}>
      <View style={styles.statTop}>
        <View style={[styles.statIcon, { backgroundColor: `${color}1a` }]}>
          <Icon color={color} size={16} strokeWidth={2.2} />
        </View>
        <StatusBadge tone={tone} label={label} />
      </View>
      <Caption style={styles.statLabel}>{title}</Caption>
      <Title style={styles.statValue} numberOfLines={1}>{value}</Title>
      {subtitle ? (
        <Caption style={styles.statSub} numberOfLines={2}>{subtitle}</Caption>
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
    () => (snap ? evaluateWifiAccess(snap, settings.allowedWifi, settings.noLoginWifi) : null),
    [settings.allowedWifi, settings.noLoginWifi, snap]
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
    : access.skipPortalAuth
      ? 'success'
      : access.match
        ? 'success'
        : access.noRestriction
          ? 'warning'
          : 'error';

  const sessionTone: 'success' | 'error' = isAuthenticated ? 'success' : 'error';
  const lastStr = lastLoginAt ? new Date(lastLoginAt).toLocaleString() : '—';

  const autoLoginRunning =
    settings.autoLoginEnabled &&
    (authAgent.status === 'authenticating' || authAgent.status === 'checking');

  const loginOutcomeLabel = isAuthenticated
    ? 'Login successful'
    : authAgent.status === 'error' || authAgent.status === 'needs_portal'
      ? 'Failed · try browser'
      : 'Not signed in';

  return (
    <Screen>
      <ScrollView
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.primary} />
        }
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scroll}>

        {/* ── Hero ─────────────────────────────────────────────────────── */}
        <View style={styles.hero}>
          <View style={styles.heroRow}>
            <View style={styles.heroText}>
              <Eyebrow>Overview</Eyebrow>
              <Title style={styles.heroTitle}>Dashboard</Title>
            </View>
            <StatusBadge tone={isAuthenticated ? 'success' : 'neutral'} label={isAuthenticated ? 'Live' : 'Idle'} />
          </View>
          <Caption style={styles.heroSub}>
            {snap?.isWifi
              ? `Connected · ${snap.ssid || 'WiFi'}`
              : snap?.isCellular
                ? 'On cellular — no WiFi'
                : 'No network detected'}
          </Caption>
        </View>

        {/* ── Network & Access card ─────────────────────────────────────── */}
        <View style={styles.mainCard}>
          <LinearGradient
            colors={['#46e2d8', '#56c2ff', '#2e8fff']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.cardAccent}
          />

          <View style={styles.cardHeader}>
            <Caption style={styles.cardEyebrow}>Network</Caption>
          </View>

          <View style={styles.statsRow}>
            <StatBlock
              title="WiFi"
              value={snap?.isWifi ? snap.ssid || 'Connected' : snap?.isCellular ? 'Cellular' : 'Offline'}
              subtitle={snap?.gatewayIp ? `Gateway · ${snap.gatewayIp}` : snap ? 'No gateway' : '…'}
              tone={wifiTone}
              badgeLabel={snap?.isWifi ? 'Online' : snap?.isCellular ? 'Cell' : 'Off'}
              icon={snap?.isWifi ? Wifi : WifiOff}
            />
            <View style={styles.statDivider} />
            <StatBlock
              title="Access"
              value={
                access?.skipPortalAuth
                  ? 'No portal'
                  : access?.match
                    ? 'Allowed'
                    : access?.noRestriction
                      ? 'Open'
                      : access
                        ? 'Blocked'
                        : '…'
              }
              subtitle={
                access?.skipPortalAuth
                  ? access.noLoginMatch?.ssid || access.noLoginMatch?.ip || 'No-portal network'
                  : access?.match
                    ? access.match.ssid || access.match.ip || 'Matched network'
                    : `${settings.allowedWifi.filter((e) => e.isActive).length} portal · ${settings.noLoginWifi.filter((e) => e.isActive).length} open`
              }
              tone={accessTone}
              badgeLabel={
                access?.skipPortalAuth
                  ? 'Skip'
                  : access?.match
                    ? 'Match'
                    : access?.noRestriction
                      ? 'Open'
                      : access
                        ? 'Deny'
                        : '—'
              }
              icon={ShieldCheck}
            />
          </View>
        </View>

        {/* ── Session card ─────────────────────────────────────────────── */}
        <Card style={styles.sessionCard}>
          {/* Header */}
          <View style={styles.sessionHeader}>
            <View style={styles.sessionLeft}>
              <View style={styles.sessionEyebrowRow}>
                <LogIn color={theme.colors.cyan} size={11} strokeWidth={2.3} />
                <Caption style={styles.sectionEyebrow}>Session</Caption>
              </View>
              <Body style={styles.sessionLine}>
                {isAuthenticated ? 'Session active' : 'Not signed in'}
              </Body>
            </View>
            <View style={styles.sessionRight}>
              <StatusBadge tone={sessionTone} label={isAuthenticated ? 'Active' : 'None'} />
              <Caption style={styles.loginOutcome} numberOfLines={2}>
                {loginOutcomeLabel}{autoLoginRunning ? ' · Running' : ''}
              </Caption>
            </View>
          </View>

          <View style={styles.dividerMuted} />

          <View style={styles.metaGrid}>
            {/* Row 1: Credentials + Auto-login */}
            <View style={styles.metaRow}>
              <View style={styles.metaCell}>
                <View style={styles.metaCellTop}>
                  <View style={styles.metaCellLabel}>
                    <Key color={theme.colors.textSoft} size={10} strokeWidth={2.2} />
                    <Caption style={styles.metaLabel}>Credentials</Caption>
                  </View>
                  <StatusBadge
                    tone={storedCredentialsAvailable ? 'success' : 'neutral'}
                    label={storedCredentialsAvailable ? 'Saved' : 'None'}
                  />
                </View>
              </View>

              <View style={styles.metaDividerV} />

              <View style={styles.metaCell}>
                <View style={styles.metaCellTop}>
                  <View style={styles.metaCellLabel}>
                    <Bot color={theme.colors.textSoft} size={10} strokeWidth={2.2} />
                    <Caption style={styles.metaLabel}>Auto-login</Caption>
                  </View>
                  <StatusBadge
                    tone={!settings.autoLoginEnabled ? 'neutral' : autoLoginRunning ? 'warning' : 'success'}
                    label={!settings.autoLoginEnabled ? 'Off' : autoLoginRunning ? 'Running' : 'On'}
                  />
                </View>
              </View>
            </View>

            <View style={styles.dividerMuted} />

            <View style={styles.metaRow}>
              <View style={styles.metaCell}>
                <View style={styles.metaCellTop}>
                  <View style={styles.metaCellLabel}>
                    <Clock color={theme.colors.textSoft} size={10} strokeWidth={2.2} />
                    <Caption style={styles.metaLabel}>Last login</Caption>
                  </View>
                </View>
                <Caption style={styles.metaValue} numberOfLines={2}>{lastStr}</Caption>
              </View>
            </View>
          </View>
        </Card>

        {/* ── Actions ───────────────────────────────────────────────────── */}
        <Caption style={styles.actionsEyebrow}>Actions</Caption>
        <View style={styles.actionStack}>
          <PrimaryButton
            title={isAuthenticated ? 'Reconnect' : 'Login'}
            onPress={() => router.push('/(tabs)/session')}
            icon={ArrowRightLeft}
            trailingArrow
          />
          <View style={styles.actionRow}>
            <PrimaryButton
              title="Refresh"
              onPress={onRefresh}
              variant="secondary"
              icon={RefreshCw}
              style={styles.actionHalf}
            />
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
    paddingTop: theme.spacing.md,
    paddingBottom: 120,
  },

  // ── Hero ──────────────────────────────────────────────────────────────────
  hero: {
    marginTop: theme.spacing.sm,
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
    gap: theme.spacing.xs,
  },
  heroTitle: {
    fontSize: 30,
    letterSpacing: -0.5,
    fontWeight: '800',
  },
  heroSub: {
    color: theme.colors.textSoft,
    fontSize: 12,
  },

  // ── Network card ──────────────────────────────────────────────────────────
  mainCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing.lg,
    paddingTop: theme.spacing.md + 3,
    overflow: 'hidden',
    marginBottom: theme.spacing.md,
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
  cardHeader: {
    marginBottom: theme.spacing.md,
  },
  cardEyebrow: {
    color: theme.colors.cyan,
    fontWeight: '700',
    fontSize: 10,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
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
    marginVertical: theme.spacing.xs,
  },

  // ── Session card ──────────────────────────────────────────────────────────
  sessionCard: {
    marginBottom: theme.spacing.md,
    padding: theme.spacing.lg,
  },
  sessionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: theme.spacing.md,
  },
  sessionLeft: {
    flex: 1,
    gap: 4,
    minWidth: 0,
  },
  sessionEyebrowRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  sectionEyebrow: {
    color: theme.colors.cyan,
    fontWeight: '700',
    letterSpacing: 0.6,
    fontSize: 10,
    textTransform: 'uppercase',
  },
  sessionLine: {
    color: theme.colors.text,
    fontSize: 13,
    lineHeight: 18,
  },
  sessionRight: {
    alignItems: 'flex-end',
    gap: 5,
    flexShrink: 0,
  },
  loginOutcome: {
    color: theme.colors.textSoft,
    fontSize: 11,
    textAlign: 'right',
    lineHeight: 15,
    maxWidth: 110,
  },
  metaGrid: {
    gap: 0,
  },
  metaRow: {
    flexDirection: 'row',
    paddingVertical: theme.spacing.sm,
  },
  metaDividerV: {
    width: StyleSheet.hairlineWidth,
    backgroundColor: theme.colors.border,
    marginHorizontal: theme.spacing.md,
  },
  metaCell: {
    flex: 1,
    minWidth: 0,
    gap: 5,
  },
  metaCellTop: {
    gap: 5,
  },
  metaCellLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
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
    fontSize: 12,
    lineHeight: 17,
  },

  // ── Actions ───────────────────────────────────────────────────────────────
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
