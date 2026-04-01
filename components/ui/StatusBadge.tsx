import { StyleSheet, View } from 'react-native';
import { Caption } from '@/components/ui/Typography';
import { theme } from '@/constants/theme';

export function StatusBadge({
  tone,
  label,
}: {
  tone: 'success' | 'error' | 'warning' | 'neutral';
  label: string;
}) {
  return (
    <View
      style={[
        styles.badge,
        tone === 'success' && styles.success,
        tone === 'error' && styles.error,
        tone === 'warning' && styles.warning,
        tone === 'neutral' && styles.neutral,
      ]}>
      <View
        style={[
          styles.dot,
          tone === 'success' && { backgroundColor: theme.colors.success },
          tone === 'error' && { backgroundColor: theme.colors.danger },
          tone === 'warning' && { backgroundColor: theme.colors.warning },
          tone === 'neutral' && { backgroundColor: theme.colors.textSoft },
        ]}
      />
      <Caption style={styles.label}>{label}</Caption>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: theme.radius.pill,
    borderWidth: 1,
  },
  success: {
    backgroundColor: 'rgba(61, 220, 151, 0.12)',
    borderColor: 'rgba(61, 220, 151, 0.22)',
  },
  error: {
    backgroundColor: 'rgba(255, 114, 114, 0.12)',
    borderColor: 'rgba(255, 114, 114, 0.22)',
  },
  warning: {
    backgroundColor: 'rgba(255, 179, 71, 0.12)',
    borderColor: 'rgba(255, 179, 71, 0.22)',
  },
  neutral: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderColor: theme.colors.border,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 8,
  },
  label: {
    color: theme.colors.text,
    fontWeight: '700',
    fontSize: 11,
    lineHeight: 14,
  },
});
