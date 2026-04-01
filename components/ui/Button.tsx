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
}: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  variant?: ButtonVariant;
  style?: ViewStyle;
  icon?: LucideIcon;
  trailingArrow?: boolean;
}) {
  const inactive = disabled || loading;

  return (
    <Pressable
      onPress={onPress}
      disabled={inactive}
      style={({ pressed }) => [styles.wrap, pressed && !inactive && styles.pressed, style]}>
      {variant === 'primary' ? (
        <LinearGradient colors={['#63d8ff', '#2d8fff']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.base, inactive && styles.inactive]}>
          <ButtonContent title={title} variant={variant} loading={loading} icon={Icon} trailingArrow={trailingArrow} />
        </LinearGradient>
      ) : (
        <View
          style={[
            styles.base,
            variant === 'secondary' && styles.secondary,
            variant === 'ghost' && styles.ghost,
            variant === 'danger' && styles.danger,
            inactive && styles.inactive,
          ]}>
          <ButtonContent title={title} variant={variant} loading={loading} icon={Icon} trailingArrow={trailingArrow} />
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
}: {
  title: string;
  variant: ButtonVariant;
  loading?: boolean;
  icon?: LucideIcon;
  trailingArrow?: boolean;
}) {
  const color = variant === 'primary' ? '#05111f' : theme.colors.text;

  if (loading) {
    return <ActivityIndicator color={color} />;
  }

  return (
    <View style={styles.content}>
      <View style={styles.left}>
        {Icon ? <Icon color={color} size={18} strokeWidth={2.2} /> : null}
        <Text style={[styles.label, { color }]}>{title}</Text>
      </View>
      {trailingArrow ? <ArrowRight color={color} size={18} strokeWidth={2.2} /> : null}
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
  left: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  label: {
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
});
