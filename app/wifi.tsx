import { useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Switch, TextInput, View } from 'react-native';

import { PrimaryButton } from '@/components/ui/Button';
import { Screen } from '@/components/ui/Screen';
import { Body, Caption, Title } from '@/components/ui/Typography';
import { appendActivityLog } from '@/services/activityLog';
import type { AllowedWifiEntry } from '@/types/models';
import { useAppStore } from '@/store/appStore';

function newId() {
  return `wf-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export default function WifiScreen() {
  const settings = useAppStore((s) => s.settings);
  const setSettings = useAppStore((s) => s.setSettings);

  const [ssid, setSsid] = useState('');
  const [gateway, setGateway] = useState('');
  const [remarks, setRemarks] = useState('');

  const list = useMemo(() => settings.allowedWifi, [settings.allowedWifi]);

  async function addEntry() {
    const trimmed = ssid.trim();
    if (!trimmed && !gateway.trim()) return;
    const next: AllowedWifiEntry = {
      id: newId(),
      ssid: trimmed,
      gatewayMatch: gateway.trim() || undefined,
      remarks: remarks.trim() || undefined,
      active: true,
    };
    await setSettings({ allowedWifi: [...settings.allowedWifi, next] });
    await appendActivityLog('success', 'Allowed Wi‑Fi entry added', { id: next.id });
    setSsid('');
    setGateway('');
    setRemarks('');
  }

  async function toggleActive(id: string, active: boolean) {
    const allowedWifi = settings.allowedWifi.map((e) => (e.id === id ? { ...e, active } : e));
    await setSettings({ allowedWifi });
    await appendActivityLog('info', 'Allowed Wi‑Fi entry toggled', { id, active });
  }

  async function remove(id: string) {
    const allowedWifi = settings.allowedWifi.filter((e) => e.id !== id);
    await setSettings({ allowedWifi });
    await appendActivityLog('warn', 'Allowed Wi‑Fi entry removed', { id });
  }

  return (
    <Screen scroll>
      <Title>Allowed Wi‑Fi</Title>
      <Body style={styles.desc}>
        Match by SSID (exact, case-insensitive) or by gateway/subnet hint (e.g. 10.64.4.). At least one
        field should be set per entry.
      </Body>

      <Caption style={styles.label}>SSID</Caption>
      <TextInput value={ssid} onChangeText={setSsid} placeholder="Office-WiFi" style={styles.input} />

      <Caption style={styles.label}>Gateway / subnet hint</Caption>
      <TextInput
        value={gateway}
        onChangeText={setGateway}
        placeholder="10.64.4."
        autoCapitalize="none"
        style={styles.input}
      />

      <Caption style={styles.label}>Remarks</Caption>
      <TextInput value={remarks} onChangeText={setRemarks} placeholder="Optional" style={styles.input} />

      <PrimaryButton title="Add network" onPress={addEntry} />

      <Title style={styles.listTitle}>Configured networks</Title>
      <FlatList
        data={list}
        keyExtractor={(item) => item.id}
        scrollEnabled={false}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={styles.cardTop}>
              <Body style={styles.bold}>{item.ssid || '(gateway match only)'}</Body>
              <Pressable onPress={() => remove(item.id)}>
                <Caption style={styles.remove}>Remove</Caption>
              </Pressable>
            </View>
            {item.gatewayMatch ? <Caption>Gateway: {item.gatewayMatch}</Caption> : null}
            {item.remarks ? <Caption>{item.remarks}</Caption> : null}
            <View style={styles.switchRow}>
              <Caption>Active</Caption>
              <Switch value={item.active} onValueChange={(v) => void toggleActive(item.id, v)} />
            </View>
          </View>
        )}
        ListEmptyComponent={<Caption style={styles.empty}>No entries yet.</Caption>}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  desc: { marginTop: 8, marginBottom: 12 },
  label: { marginTop: 10 },
  input: {
    marginTop: 6,
    backgroundColor: '#111a24',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: '#f2f5f9',
    borderWidth: 1,
    borderColor: '#2a3441',
  },
  listTitle: { marginTop: 24, marginBottom: 10, fontSize: 18 },
  card: {
    backgroundColor: '#111a24',
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#1f2a36',
  },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  bold: { fontWeight: '600' },
  remove: { color: '#ff9b9b' },
  switchRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 },
  empty: { marginTop: 8 },
});
