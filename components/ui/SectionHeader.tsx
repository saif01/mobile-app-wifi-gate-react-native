import type { LucideIcon } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';

import { Caption, Subtitle } from '@/components/ui/Typography';
import { theme } from '@/constants/theme';

export function SectionHeader({
  title,
  subtitle,
  icon: Icon,
  accentColor,
}: {
  title: string;
  subtitle?: string;
  icon?: LucideIcon;
  accentColor?: string;
}) {
  const accent = accentColor ?? theme.colors.primary;
  return (
    <View style={styles.wrap}>
      <View style={styles.titleRow}>
        {!Icon && accentColor ? <View style={[styles.accentBar, { backgroundColor: accentColor }]} /> : null}
        {Icon ? (
          <View style={[styles.iconWrap, { backgroundColor: `${accent}18` }]}>
            <Icon color={accent} size={20} strokeWidth={2.2} />
          </View>
        ) : null}
        <Subtitle style={styles.title}>{title}</Subtitle>
      </View>
      {subtitle ? <Caption>{subtitle}</Caption> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginTop: theme.spacing.xl,
    marginBottom: theme.spacing.sm,
    gap: theme.spacing.xs,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  accentBar: {
    width: 4,
    height: 26,
    borderRadius: 3,
    marginRight: 2,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    color: theme.colors.text,
    fontSize: 20,
    flex: 1,
  },
});
