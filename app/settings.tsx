import Constants from 'expo-constants';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Switch, View } from 'react-native';

import { Screen } from '@/components/ui/Screen';
import { Body, Caption, Title } from '@/components/ui/Typography';
import { appendActivityLog } from '@/services/activityLog';
import { useAppStore } from '@/store/appStore';

export default function SettingsScreen() {
  const settings = useAppStore((s) => s.settings);
  const setSettings = useAppStore((s) => s.setSettings);

  const version = Constants.expoConfig?.version ?? '1.0.0';

  return (
    <Screen scroll>
      <Title style={styles.title}>Settings</Title>
      <Caption style={styles.sub}>Configuration and preferences</Caption>

      <Pressable style={styles.row} onPress={() => router.push('/endpoint')}>
        <Body>Firewall endpoint</Body>
        <Caption>{settings.firewallEndpoint}</Caption>
      </Pressable>

      <Pressable style={styles.row} onPress={() => router.push('/wifi')}>
        <Body>Allowed Wi‑Fi networks</Body>
        <Caption>{settings.allowedWifi.filter((x) => x.active).length} active</Caption>
      </Pressable>

      <Pressable style={styles.row} onPress={() => router.push('/biometric')}>
        <Body>Biometric login</Body>
        <Caption>Configure</Caption>
      </Pressable>

      <View style={styles.switchRow}>
        <Body>Remember credentials</Body>
        <Switch
          value={settings.rememberCredentials}
          onValueChange={async (v) => {
            await setSettings({ rememberCredentials: v });
            await appendActivityLog('info', 'Remember credentials toggled', { on: v });
          }}
        />
      </View>

      <View style={styles.switchRow}>
        <Body>Warn about mobile data (Android)</Body>
        <Switch
          value={settings.warnCellularInterference}
          onValueChange={async (v) => {
            await setSettings({ warnCellularInterference: v });
          }}
        />
      </View>

      <Pressable style={styles.row} onPress={() => router.push('/logs')}>
        <Body>Activity logs</Body>
        <Caption>View</Caption>
      </Pressable>

      <View style={styles.meta}>
        <Caption>WiFiGate v{version}</Caption>
        <Caption style={styles.mt}>
          Session state is kept in memory; SecureStore holds credentials when enabled. Full background
          keep-alive may require a custom dev client.
        </Caption>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { marginTop: 8 },
  sub: { marginBottom: 16 },
  row: {
    backgroundColor: '#111a24',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#1f2a36',
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#111a24',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#1f2a36',
  },
  meta: { marginTop: 20 },
  mt: { marginTop: 10 },
});
