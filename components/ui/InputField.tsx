import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import type { LucideIcon } from 'lucide-react-native';
import { Eye, EyeOff } from 'lucide-react-native';

import { Body, Caption } from '@/components/ui/Typography';
import { theme } from '@/constants/theme';

export function InputField({
  label,
  value,
  onChangeText,
  placeholder,
  icon: Icon,
  error,
  secureTextEntry,
  showToggle,
  onToggleSecure,
  multiline,
  autoCapitalize,
  autoCorrect,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  icon?: LucideIcon;
  error?: string;
  secureTextEntry?: boolean;
  showToggle?: boolean;
  onToggleSecure?: () => void;
  multiline?: boolean;
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  autoCorrect?: boolean;
}) {
  return (
    <View style={styles.wrap}>
      <Caption style={styles.label}>{label}</Caption>
      <View style={[styles.field, multiline && styles.multiline]}>
        {Icon ? <Icon color={theme.colors.textMuted} size={18} strokeWidth={2.1} /> : null}
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={theme.colors.textSoft}
          style={[styles.input, multiline && styles.inputMultiline]}
          secureTextEntry={secureTextEntry}
          multiline={multiline}
          autoCapitalize={autoCapitalize}
          autoCorrect={autoCorrect}
        />
        {showToggle ? (
          <Pressable onPress={onToggleSecure} style={styles.toggle}>
            {secureTextEntry ? (
              <Eye color={theme.colors.textMuted} size={18} strokeWidth={2.1} />
            ) : (
              <EyeOff color={theme.colors.textMuted} size={18} strokeWidth={2.1} />
            )}
          </Pressable>
        ) : null}
      </View>
      {error ? <Body style={styles.error}>{error}</Body> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginBottom: theme.spacing.lg,
  },
  label: {
    color: theme.colors.textMuted,
    marginBottom: theme.spacing.sm,
    fontWeight: '700',
  },
  field: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    borderRadius: theme.radius.md,
    paddingHorizontal: theme.spacing.lg,
    backgroundColor: 'rgba(8, 18, 31, 0.76)',
    borderWidth: 1,
    borderColor: theme.colors.borderStrong,
  },
  input: {
    flex: 1,
    color: theme.colors.text,
    fontSize: 15,
    paddingVertical: 14,
  },
  toggle: {
    padding: 4,
  },
  error: {
    color: theme.colors.danger,
    marginTop: 8,
  },
  multiline: {
    alignItems: 'flex-start',
    paddingTop: theme.spacing.md,
  },
  inputMultiline: {
    minHeight: 104,
    textAlignVertical: 'top',
  },
});
