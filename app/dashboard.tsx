import { useFocusEffect } from '@react-navigation/native';
import { router } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';

import { PrimaryButton } from '@/components/ui/Button';
import { Screen } from '@/components/ui/Screen';
import { Body, Caption, Subtitle, Title } from '@/components/ui/Typography';
import { appendActivityLog } from '@/services/activityLog';
import { getNetworkSnapshot, matchAllowedWifi } from '@/services/networkService';
import type { AllowedWifiEntry, NetworkSnapshot } from '@/types/models';
import { useAppStore } from '@/store/appStore';

export default function DashboardScreen() {
  const settings = useAppStore((s) => s.settings);
  const isAuthenticated = useAppStore((s) => s.isAuthenticated);
  const lastLoginAt = useAppStore((s) => s.lastLoginAt);
  const clearSession = useAppStore((s) => s.clearSession);

  const [snap, setSnap] = useState<NetworkSnapshot | null>(null);
  const [match, setMatch] = useState<AllowedWifiEntry | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const refresh = useCallback(async () => {
    const s = await getNetworkSnapshot();
    setSnap(s);
    setMatch(matchAllowedWifi(s, settings.allowedWifi));
  }, [settings.allowedWifi]);

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
    router.replace('/login');
  }

  const lastStr = lastLoginAt ? new Date(lastLoginAt).toLocaleString() : '—';

  return (
    <Screen>
      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#3dd6c6" />}
        contentContainerStyle={styles.scroll}>
        <View style={styles.hero}>
          <Title>WiFiGate</Title>
          <Subtitle>Session and network overview</Subtitle>
        </View>

        <View style={styles.card}>
          <Caption>Authentication</Caption>
          <Body style={styles.cardValue}>{isAuthenticated ? 'Authenticated' : 'Not authenticated'}</Body>
        </View>

        <View style={styles.card}>
          <Caption>Wi‑Fi status</Caption>
          <Body style={styles.cardValue}>
            {snap?.isWifi ? 'Connected via Wi‑Fi' : snap?.isCellular ? 'Mobile data' : 'Offline / unknown'}
          </Body>
          {snap?.ssid ? <Caption style={styles.mt}>SSID: {snap.ssid}</Caption> : null}
          {snap?.ipAddress ? <Caption>IP: {snap.ipAddress}</Caption> : null}
        </View>

        <View style={styles.card}>
          <Caption>Allowed network match</Caption>
          <Body style={styles.cardValue}>
            {settings.allowedWifi.length === 0
              ? 'No networks configured'
              : match
                ? `Matched: ${match.ssid || match.gatewayMatch || 'rule'}`
                : 'No match for current connection'}
          </Body>
          {match?.remarks ? <Caption style={styles.mt}>{match.remarks}</Caption> : null}
        </View>

        <View style={styles.card}>
          <Caption>Firewall endpoint</Caption>
          <Body style={styles.cardValue}>{settings.firewallEndpoint}</Body>
        </View>

        <View style={styles.card}>
          <Caption>Last login</Caption>
          <Body style={styles.cardValue}>{lastStr}</Body>
        </View>

        <View style={styles.actions}>
          <PrimaryButton title="Re-login" onPress={() => router.push('/login')} />
          <View style={styles.gap} />
          <PrimaryButton title="Refresh status" variant="ghost" onPress={onRefresh} />
          <View style={styles.gap} />
          <PrimaryButton title="Open settings" variant="ghost" onPress={() => router.push('/settings')} />
          <View style={styles.gap} />
          <PrimaryButton title="Activity logs" variant="ghost" onPress={() => router.push('/logs')} />
          <View style={styles.gap} />
          <PrimaryButton title="Logout" variant="danger" onPress={logout} />
        </View>

        <Pressable onPress={() => router.push('/webview-login')} style={styles.link}>
          <Caption style={styles.linkText}>Open browser login (WebView)</Caption>
        </Pressable>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingBottom: 40 },
  hero: { marginTop: 8, marginBottom: 16 },
  card: {
    backgroundColor: '#111a24',
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#1f2a36',
  },
  cardValue: { marginTop: 6, fontSize: 16 },
  mt: { marginTop: 8 },
  actions: { marginTop: 8 },
  gap: { height: 10 },
  link: { marginTop: 16, alignSelf: 'center', padding: 8 },
  linkText: { color: '#3dd6c6', textDecorationLine: 'underline' },
});
