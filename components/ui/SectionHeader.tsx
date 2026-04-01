import { StyleSheet, View } from 'react-native';

import { Caption, Subtitle } from '@/components/ui/Typography';
import { theme } from '@/constants/theme';

export function SectionHeader({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string;
}) {
  return (
    <View style={styles.wrap}>
      <Subtitle style={styles.title}>{title}</Subtitle>
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
  title: {
    color: theme.colors.text,
    fontSize: 20,
  },
});
