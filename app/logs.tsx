import { useCallback, useMemo, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { AlertCircle, CheckCircle2, Filter, Info, Search, TriangleAlert } from 'lucide-react-native';

import { PrimaryButton } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Screen } from '@/components/ui/Screen';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Body, Caption, Eyebrow, Subtitle, Title } from '@/components/ui/Typography';
import { theme } from '@/constants/theme';
import { appendActivityLog, clearActivityLogs, getActivityLogs } from '@/services/activityLog';
import type { ActivityLogEntry, ActivityLogLevel } from '@/types/models';

const filters: Array<ActivityLogLevel | 'all'> = ['all', 'info', 'success', 'warn', 'error'];

const levelMap = {
  info: { icon: Info, tone: 'neutral' as const, label: 'Info' },
  success: { icon: CheckCircle2, tone: 'success' as const, label: 'Success' },
  warn: { icon: TriangleAlert, tone: 'warning' as const, label: 'Warning' },
  error: { icon: AlertCircle, tone: 'error' as const, label: 'Error' },
};

export default function LogsScreen() {
  const [items, setItems] = useState<ActivityLogEntry[]>([]);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<ActivityLogLevel | 'all'>('all');

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

  function confirmClearLogs() {
    Alert.alert(
      'Clear all logs?',
      'This removes every activity log entry. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Clear', style: 'destructive', onPress: () => void onClear() },
      ]
    );
  }

  const filtered = useMemo(() => {
    return items.filter((item) => {
      const levelMatch = filter === 'all' || item.level === filter;
      const q = query.trim().toLowerCase();
      const textMatch = !q || item.message.toLowerCase().includes(q) || new Date(item.ts).toLocaleString().toLowerCase().includes(q);
      return levelMatch && textMatch;
    });
  }, [filter, items, query]);

  return (
    <Screen contentStyle={styles.content}>
      <View style={styles.hero}>
        <Eyebrow>Audit Trail</Eyebrow>
        <Title style={styles.title}>Logs</Title>
        <Subtitle>Search and filter events.</Subtitle>
      </View>

      <Card style={styles.searchCard}>
        <View style={styles.searchRow}>
          <Search color={theme.colors.textSoft} size={18} strokeWidth={2.1} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search logs"
            placeholderTextColor={theme.colors.textSoft}
            style={styles.searchInput}
          />
        </View>
      </Card>

      <View style={styles.filterRow}>
        <View style={styles.filterHeader}>
          <Filter color={theme.colors.textMuted} size={16} strokeWidth={2.1} />
          <Caption>Filters</Caption>
        </View>
        <PrimaryButton title="Clear Logs" onPress={confirmClearLogs} variant="ghost" style={styles.clearButton} />
      </View>

      <View style={styles.chips}>
        {filters.map((item) => {
          const active = filter === item;
          return (
            <Pressable
              key={item}
              onPress={() => setFilter(item)}
              style={[styles.chip, active && styles.chipActive]}>
              <Caption style={[styles.chipText, active && styles.chipTextActive]}>{item.toUpperCase()}</Caption>
            </Pressable>
          );
        })}
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => {
          const meta = levelMap[item.level];
          const Icon = meta.icon;
          return (
            <Card style={styles.logCard}>
              <View style={styles.logRow}>
                <View style={styles.logIcon}>
                  <Icon color={theme.colors.primary} size={18} strokeWidth={2.2} />
                </View>
                <View style={styles.logBody}>
                  <View style={styles.logTop}>
                    <StatusBadge tone={meta.tone} label={meta.label} />
                    <Caption>{new Date(item.ts).toLocaleString()}</Caption>
                  </View>
                  <Body style={styles.logMessage}>{item.message}</Body>
                </View>
              </View>
            </Card>
          );
        }}
        ListEmptyComponent={
          <Card style={styles.emptyCard}>
            <Body style={styles.emptyTitle}>No matching events</Body>
            <Caption>
              {items.length === 0 ? 'No activity yet.' : 'Try another filter.'}
            </Caption>
          </Card>
        }
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingTop: theme.spacing.lg,
  },
  hero: {
    marginTop: theme.spacing.md,
    marginBottom: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  title: {
    fontSize: theme.typography.hero,
  },
  searchCard: {
    marginBottom: theme.spacing.sm,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  searchInput: {
    flex: 1,
    color: theme.colors.text,
    fontSize: 15,
    paddingVertical: 4,
  },
  filterRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing.sm,
  },
  filterHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  clearButton: {
    minWidth: 132,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.sm,
  },
  chip: {
    borderRadius: theme.radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  chipActive: {
    backgroundColor: 'rgba(86, 194, 255, 0.14)',
    borderColor: theme.colors.borderStrong,
  },
  chipText: {
    color: theme.colors.textMuted,
    fontWeight: '700',
  },
  chipTextActive: {
    color: theme.colors.text,
  },
  list: {
    paddingBottom: 140,
    gap: theme.spacing.md,
  },
  logCard: {
    marginBottom: theme.spacing.sm,
  },
  logRow: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  logIcon: {
    width: 34,
    height: 34,
    borderRadius: 12,
    backgroundColor: 'rgba(86, 194, 255, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logBody: {
    flex: 1,
    gap: 6,
  },
  logTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  logMessage: {
    color: theme.colors.text,
  },
  emptyCard: {
    marginTop: theme.spacing.lg,
  },
  emptyTitle: {
    color: theme.colors.text,
    fontWeight: '700',
    marginBottom: theme.spacing.sm,
  },
});
