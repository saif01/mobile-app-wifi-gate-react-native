import { useFocusEffect } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import {
  AlertTriangle,
  ArrowRightLeft,
  Bot,
  ChevronDown,
  ChevronUp,
  Clock,
  Globe,
  Key,
  LogIn,
  LogOut,
  RefreshCw,
  ShieldCheck,
  UserRound,
  Wifi,
  WifiOff,
} from 'lucide-react-native';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';

import { PrimaryButton } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Screen } from '@/components/ui/Screen';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Body, Caption, Eyebrow, Title } from '@/components/ui/Typography';
import { theme } from '@/constants/theme';
import { appendActivityLog } from '@/services/activityLog';
import {
  fetchAdUserDetails,
  formatDdMmYyyyHmAmPm,
  formatProfileValueIfDateTime,
  getPasswordExpiryRawFromDetails,
  parseExpiryDate,
  PASSWORD_EXPIRY_WARNING_DAYS,
  shouldWarnPasswordExpiry,
  type AdUserDetails,
} from '@/services/adUserDetails';
import { evaluateWifiAccess, getNetworkSnapshot } from '@/services/networkService';
import { getSavedCredentials } from '@/services/secureCredentials';
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

function formatPasswordRemaining(days: number | null): string {
  if (days == null) return '';
  if (days < 0) return 'Expired';
  if (days === 0) return 'Expires today';
  if (days === 1) return '1 day left';
  return `${days} days left`;
}

function passwordExpiryVisual(days: number | null): 'danger' | 'warning' | 'success' | 'neutral' {
  if (days == null) return 'neutral';
  if (days < 0) return 'danger';
  if (shouldWarnPasswordExpiry(days)) return 'warning';
  return 'success';
}

function daysUntilFromExpiryDate(expiry: Date): number {
  const now = new Date();
  const a = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const b = new Date(expiry.getFullYear(), expiry.getMonth(), expiry.getDate()).getTime();
  return Math.round((b - a) / 86400000);
}

function resolveProfileExpiryDateTime(p: AdUserDetails | null | undefined): Date | null {
  if (!p) return null;
  if (p.passwordExpiresAt && !Number.isNaN(p.passwordExpiresAt.getTime())) {
    return p.passwordExpiresAt;
  }
  const raw = getPasswordExpiryRawFromDetails(p);
  if (!raw) return null;
  const parsed = parseExpiryDate(raw);
  if (!parsed || Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

function resolveProfileExpiryDays(p: AdUserDetails | null | undefined): number | null {
  if (!p) return null;
  if (p.daysUntilPasswordExpiry != null) return p.daysUntilPasswordExpiry;
  const d = resolveProfileExpiryDateTime(p);
  if (d) return daysUntilFromExpiryDate(d);
  return null;
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

  const [profile, setProfile] = useState<AdUserDetails | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileExpanded, setProfileExpanded] = useState(false);

  const access = useMemo(
    () => (snap ? evaluateWifiAccess(snap, settings.allowedWifi, settings.noLoginWifi) : null),
    [settings.allowedWifi, settings.noLoginWifi, snap]
  );

  const refresh = useCallback(async () => {
    const s = await getNetworkSnapshot();
    setSnap(s);
  }, []);

  const loadProfile = useCallback(async () => {
    if (!isAuthenticated || !storedCredentialsAvailable) {
      setProfile(null);
      setProfileError(null);
      setProfileLoading(false);
      return;
    }
    setProfileLoading(true);
    setProfileError(null);
    try {
      const creds = await getSavedCredentials();
      if (!creds) {
        setProfile(null);
        setProfileError('No saved credentials.');
        return;
      }
      const result = await fetchAdUserDetails(creds.userId, creds.password);
      if (result.ok) {
        setProfile(result.details);
        setProfileError(null);
      } else {
        setProfileError(result.message);
        setProfile((prev) => prev);
      }
    } catch (e) {
      setProfileError(e instanceof Error ? e.message : 'Could not load profile.');
      setProfile((prev) => prev);
    } finally {
      setProfileLoading(false);
    }
  }, [isAuthenticated, storedCredentialsAvailable]);

  useFocusEffect(
    useCallback(() => {
      void refresh();
      void loadProfile();
    }, [refresh, loadProfile])
  );

  async function onRefresh() {
    setRefreshing(true);
    try {
      await refresh();
      await loadProfile();
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

  const profileDetailRows = useMemo(() => {
    if (!profile) return [];
    const hide = profile.passwordExpiryRowKey;
    return profile.rows.filter((r) => r.key !== hide);
  }, [profile]);

  const profileCollapsibleRows = useMemo(() => {
    const middle = profileDetailRows.slice(1, -1);
    if (middle.length <= 2) return middle;
    return [...middle.slice(-2), ...middle.slice(0, -2)];
  }, [profileDetailRows]);

  const resolvedProfileExpiryDays = useMemo(() => resolveProfileExpiryDays(profile), [profile]);

  const profileExpiryTitleText = useMemo(() => {
    if (!profile) return 'No expiry info';
    if (resolvedProfileExpiryDays != null) return formatPasswordRemaining(resolvedProfileExpiryDays);
    const raw = getPasswordExpiryRawFromDetails(profile);
    if (raw) return raw;
    return 'No expiry info';
  }, [profile, resolvedProfileExpiryDays]);

  const profileExpirySubtitleText = useMemo(() => {
    const d = resolveProfileExpiryDateTime(profile);
    if (!d) return 'No date';
    return formatDdMmYyyyHmAmPm(d);
  }, [profile]);

  const expiryVisual = passwordExpiryVisual(resolvedProfileExpiryDays);
  const expiryColor =
    expiryVisual === 'danger'
      ? theme.colors.danger
      : expiryVisual === 'warning'
        ? theme.colors.warning
        : expiryVisual === 'success'
          ? theme.colors.success
          : theme.colors.cyan;

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

        {/* ── Profile (directory) ─────────────────────────────────────── */}
        <Card style={styles.profileCard}>
          <View style={styles.profileHeaderRow}>
            <View style={styles.profileTitleRow}>
              <View style={styles.profileTitleIcon}>
                <UserRound color={theme.colors.cyan} size={16} strokeWidth={2.2} />
              </View>
              <Caption style={styles.profileEyebrow}>Account profile</Caption>
            </View>
            <Pressable
              onPress={() => void loadProfile()}
              disabled={profileLoading || !isAuthenticated || !storedCredentialsAvailable}
              style={({ pressed }) => [styles.profileRefreshBtn, pressed && styles.profileRefreshPressed]}
              accessibilityRole="button"
              accessibilityLabel="Refresh profile">
              {profileLoading ? (
                <ActivityIndicator size="small" color={theme.colors.primary} />
              ) : (
                <RefreshCw color={theme.colors.primary} size={18} strokeWidth={2.2} />
              )}
            </Pressable>
          </View>

          {!isAuthenticated || !storedCredentialsAvailable ? (
            <Caption style={styles.profileHint}>
              Save your password at sign-in to load directory details here after login.
            </Caption>
          ) : profileLoading && !profile && !profileError ? (
            <View style={styles.profileLoadingBlock}>
              <ActivityIndicator color={theme.colors.cyan} />
              <Caption style={styles.profileHint}>Loading profile…</Caption>
            </View>
          ) : profileError && !profile ? (
            <Caption style={styles.profileError}>{profileError}</Caption>
          ) : (
            <>
              <Pressable
                onPress={() => setProfileExpanded((v) => !v)}
                style={({ pressed }) => [styles.profileExpiryHero, pressed && styles.profileExpiryPressed]}
                accessibilityRole="button"
                accessibilityLabel={profileExpanded ? 'Collapse profile details' : 'Expand profile details'}>
                <View style={[styles.profileExpiryAccent, { backgroundColor: `${expiryColor}33` }]} />
                <View style={styles.profileExpiryHeroInner}>
                  <Caption style={[styles.profileExpiryLabel, { color: expiryColor }]}>Password expiration</Caption>
                  <Title style={[styles.profileExpiryMain, { color: expiryColor }]} numberOfLines={3}>
                    {profileExpiryTitleText}
                  </Title>
                  <Caption style={styles.profileExpirySub}>{profileExpirySubtitleText}</Caption>
                </View>
                {profileExpanded ? (
                  <ChevronUp color={theme.colors.textSoft} size={20} strokeWidth={2.2} />
                ) : (
                  <ChevronDown color={theme.colors.textSoft} size={20} strokeWidth={2.2} />
                )}
              </Pressable>

              {profileError && profile ? <Caption style={styles.profileErrorMuted}>{profileError}</Caption> : null}

              {profile &&
              shouldWarnPasswordExpiry(resolvedProfileExpiryDays) &&
              isAuthenticated ? (
                <View style={styles.profileWarn}>
                  <AlertTriangle color={theme.colors.warning} size={16} strokeWidth={2.3} />
                  <Caption style={styles.profileWarnText}>
                    {resolvedProfileExpiryDays != null && resolvedProfileExpiryDays < 0
                      ? 'Your password has expired. Change it immediately.'
                      : `Your password expires in under ${PASSWORD_EXPIRY_WARNING_DAYS} days. Change it as early as possible.`}
                  </Caption>
                </View>
              ) : null}

              {profileExpanded && profile ? (
                <View style={styles.profileBody}>
                  <Caption style={styles.profileBodyEyebrow}>Common information</Caption>
                  {profileCollapsibleRows.length === 0 ? (
                    <Caption style={styles.profileHint}>
                      {profileDetailRows.length === 0
                        ? 'No additional fields returned.'
                        : 'No fields to display.'}
                    </Caption>
                  ) : (
                    profileCollapsibleRows.map((row) => (
                      <View key={row.key} style={styles.profileKv}>
                        <Caption style={styles.profileKvLabel}>{row.label}</Caption>
                        <Body style={styles.profileKvValue} numberOfLines={6}>
                          {formatProfileValueIfDateTime(row.value)}
                        </Body>
                      </View>
                    ))
                  )}
                </View>
              ) : null}
            </>
          )}
        </Card>

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

  // ── Profile card ────────────────────────────────────────────────────────
  profileCard: {
    marginBottom: theme.spacing.md,
    padding: theme.spacing.lg,
    overflow: 'hidden',
  },
  profileHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: theme.spacing.sm,
  },
  profileTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    flex: 1,
    minWidth: 0,
  },
  profileTitleIcon: {
    width: 30,
    height: 30,
    borderRadius: 10,
    backgroundColor: 'rgba(70, 226, 216, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileEyebrow: {
    color: theme.colors.cyan,
    fontWeight: '700',
    fontSize: 10,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  profileRefreshBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: 'rgba(86, 194, 255, 0.1)',
    borderWidth: 1,
    borderColor: theme.colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileRefreshPressed: {
    opacity: 0.82,
  },
  profileHint: {
    color: theme.colors.textSoft,
    fontSize: 12,
    lineHeight: 17,
  },
  profileLoadingBlock: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    paddingVertical: theme.spacing.sm,
  },
  profileError: {
    color: theme.colors.danger,
    fontSize: 12,
    lineHeight: 17,
  },
  profileErrorMuted: {
    color: theme.colors.warning,
    fontSize: 11,
    lineHeight: 15,
    marginTop: theme.spacing.xs,
  },
  profileExpiryHero: {
    flexDirection: 'row',
    alignItems: 'stretch',
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.borderStrong,
    backgroundColor: 'rgba(255,255,255,0.03)',
    overflow: 'hidden',
    marginTop: theme.spacing.xs,
  },
  profileExpiryPressed: {
    opacity: 0.92,
  },
  profileExpiryAccent: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
  },
  profileExpiryHeroInner: {
    flex: 1,
    paddingVertical: theme.spacing.md,
    paddingLeft: theme.spacing.md + 4,
    paddingRight: theme.spacing.sm,
    gap: 4,
    minWidth: 0,
  },
  profileExpiryLabel: {
    fontWeight: '700',
    fontSize: 10,
    letterSpacing: 0.55,
    textTransform: 'uppercase',
  },
  profileExpiryMain: {
    fontSize: 22,
    letterSpacing: -0.4,
    fontWeight: '800',
  },
  profileExpirySub: {
    color: theme.colors.textSoft,
    fontSize: 12,
    lineHeight: 16,
  },
  profileWarn: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: theme.spacing.sm,
    marginTop: theme.spacing.sm,
    padding: theme.spacing.sm,
    borderRadius: theme.radius.sm,
    backgroundColor: 'rgba(255, 179, 71, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255, 179, 71, 0.28)',
  },
  profileWarnText: {
    flex: 1,
    color: theme.colors.textMuted,
    fontSize: 11,
    lineHeight: 15,
  },
  profileBody: {
    marginTop: theme.spacing.md,
    paddingTop: theme.spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.colors.border,
    gap: theme.spacing.sm,
  },
  profileBodyEyebrow: {
    color: theme.colors.textSoft,
    fontWeight: '700',
    fontSize: 10,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: theme.spacing.xs,
  },
  profileKv: {
    gap: 3,
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.border,
  },
  profileKvLabel: {
    color: theme.colors.textSoft,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.35,
    textTransform: 'uppercase',
  },
  profileKvValue: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
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
