import { ActivityIndicator, Pressable, StyleSheet, Text, ViewStyle } from 'react-native';

export function PrimaryButton({
  title,
  onPress,
  disabled,
  loading,
  variant = 'primary',
  style,
}: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  variant?: 'primary' | 'ghost' | 'danger';
  style?: ViewStyle;
}) {
  const dim = disabled || loading;
  return (
    <Pressable
      onPress={onPress}
      disabled={dim}
      style={({ pressed }) => [
        styles.base,
        variant === 'primary' && styles.primary,
        variant === 'ghost' && styles.ghost,
        variant === 'danger' && styles.danger,
        dim && styles.disabled,
        pressed && !dim && styles.pressed,
        style,
      ]}>
      {loading ? (
        <ActivityIndicator color={variant === 'primary' ? '#0f1419' : '#f2f5f9'} />
      ) : (
        <Text
          style={[
            styles.label,
            variant === 'ghost' && { color: '#e8f0f8' },
            variant === 'danger' && { color: '#fff' },
          ]}>
          {title}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primary: { backgroundColor: '#3dd6c6' },
  ghost: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#2a3441',
  },
  danger: { backgroundColor: '#e85d5d' },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.88 },
  label: { color: '#0f1419', fontWeight: '700', fontSize: 16 },
});
