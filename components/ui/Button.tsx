import { ActivityIndicator, Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { ArrowRight, LucideIcon } from 'lucide-react-native';

import { theme } from '@/constants/theme';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

export function PrimaryButton({
  title,
  onPress,
  disabled,
  loading,
  variant = 'primary',
  style,
  icon: Icon,
  trailingArrow,
  compact,
}: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  variant?: ButtonVariant;
  style?: ViewStyle;
  icon?: LucideIcon;
  trailingArrow?: boolean;
  /** Shorter height and type — for dense toolbars (e.g. list row actions). */
  compact?: boolean;
}) {
  const inactive = disabled || loading;
  const density = compact ? styles.baseCompact : null;

  return (
    <Pressable
      onPress={onPress}
      disabled={inactive}
      style={({ pressed }) => [styles.wrap, pressed && !inactive && styles.pressed, style]}>
      {variant === 'primary' ? (
        <LinearGradient
          colors={['#63d8ff', '#2d8fff']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.base, density, inactive && styles.inactive]}>
          <ButtonContent
            title={title}
            variant={variant}
            loading={loading}
            icon={Icon}
            trailingArrow={trailingArrow}
            compact={compact}
          />
        </LinearGradient>
      ) : (
        <View
          style={[
            styles.base,
            density,
            variant === 'secondary' && styles.secondary,
            variant === 'ghost' && styles.ghost,
            variant === 'danger' && styles.danger,
            inactive && styles.inactive,
          ]}>
          <ButtonContent
            title={title}
            variant={variant}
            loading={loading}
            icon={Icon}
            trailingArrow={trailingArrow}
            compact={compact}
          />
        </View>
      )}
    </Pressable>
  );
}

function ButtonContent({
  title,
  variant,
  loading,
  icon: Icon,
  trailingArrow,
  compact,
}: {
  title: string;
  variant: ButtonVariant;
  loading?: boolean;
  icon?: LucideIcon;
  trailingArrow?: boolean;
  compact?: boolean;
}) {
  const color = variant === 'primary' ? '#05111f' : theme.colors.text;
  const iconSize = compact ? 15 : 18;
  const arrowSize = compact ? 15 : 18;

  if (loading) {
    return <ActivityIndicator color={color} size="small" />;
  }

  return (
    <View style={[styles.content, compact && styles.contentCompact]}>
      <View style={[styles.left, compact && styles.leftCompact]}>
        {Icon ? <Icon color={color} size={iconSize} strokeWidth={2.1} /> : null}
        <Text style={[styles.label, compact && styles.labelCompact, { color }]} numberOfLines={1}>
          {title}
        </Text>
      </View>
      {trailingArrow ? <ArrowRight color={color} size={arrowSize} strokeWidth={2.1} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderRadius: theme.radius.md,
  },
  base: {
    minHeight: 56,
    borderRadius: theme.radius.md,
    paddingHorizontal: theme.spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    ...theme.shadow.card,
  },
  baseCompact: {
    minHeight: 40,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: theme.radius.sm,
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 6,
  },
  secondary: {
    backgroundColor: 'rgba(13, 31, 51, 0.86)',
    borderColor: theme.colors.borderStrong,
  },
  ghost: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderColor: theme.colors.border,
  },
  danger: {
    backgroundColor: 'rgba(110, 24, 34, 0.82)',
    borderColor: 'rgba(255, 114, 114, 0.28)',
  },
  inactive: {
    opacity: 0.48,
  },
  pressed: {
    transform: [{ scale: 0.985 }],
    opacity: 0.92,
  },
  content: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  contentCompact: {
    justifyContent: 'center',
  },
  left: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  leftCompact: {
    gap: 5,
    flexShrink: 1,
    justifyContent: 'center',
  },
  label: {
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  labelCompact: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0,
    flexShrink: 1,
  },
});
