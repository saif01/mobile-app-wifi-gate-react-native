import { useCallback, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';

import { PrimaryButton } from '@/components/ui/Button';
import { Screen } from '@/components/ui/Screen';
import { Body, Caption, Title } from '@/components/ui/Typography';
import { appendActivityLog, clearActivityLogs, getActivityLogs } from '@/services/activityLog';
import type { ActivityLogEntry } from '@/types/models';

const levelColor: Record<string, string> = {
  info: '#9aa7b8',
  success: '#3dd6c6',
  warn: '#ffc7a6',
  error: '#ff9b9b',
};

export default function LogsScreen() {
  const [items, setItems] = useState<ActivityLogEntry[]>([]);

  const load = useCallback(async () => {
    setItems(await getActivityLogs());
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  async function onClear() {
    await clearActivityLogs();
    await appendActivityLog('info', 'Activity log cleared');
    await load();
  }

  return (
    <Screen>
      <View style={styles.header}>
        <Title>Activity</Title>
        <PrimaryButton title="Clear" variant="ghost" onPress={onClear} />
      </View>
      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <View style={styles.row}>
            <Caption style={{ color: levelColor[item.level] ?? '#9aa7b8' }}>{item.level.toUpperCase()}</Caption>
            <Caption style={styles.time}>{new Date(item.ts).toLocaleString()}</Caption>
            <Body style={styles.msg}>{item.message}</Body>
          </View>
        )}
        ListEmptyComponent={<Caption style={styles.empty}>No events yet.</Caption>}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  list: { paddingBottom: 32 },
  row: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: '#2a3441',
    paddingVertical: 10,
  },
  time: { marginTop: 4 },
  msg: { marginTop: 6 },
  empty: { marginTop: 24 },
});
