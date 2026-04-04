import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Switch, View } from 'react-native';
import type { LucideIcon } from 'lucide-react-native';
import { ChevronRight } from 'lucide-react-native';

import { Body, Caption } from '@/components/ui/Typography';
import { theme } from '@/constants/theme';

export type ListItemIconTint = 'default' | 'primary' | 'cyan' | 'warning' | 'success';

const ICON_TINT: Record<ListItemIconTint, { fg: string; bg: string }> = {
  default: { fg: theme.colors.primary, bg: 'rgba(86, 194, 255, 0.1)' },
  primary: { fg: theme.colors.primary, bg: 'rgba(86, 194, 255, 0.14)' },
  cyan: { fg: theme.colors.cyan, bg: 'rgba(70, 226, 216, 0.14)' },
  warning: { fg: theme.colors.warning, bg: 'rgba(255, 179, 71, 0.14)' },
  success: { fg: theme.colors.success, bg: 'rgba(61, 220, 151, 0.14)' },
};

export function ListItem({
  title,
  subtitle,
  icon: Icon,
  iconTint = 'default',
  onPress,
  trailing,
}: {
  title: string;
  subtitle?: string;
  icon?: LucideIcon;
  iconTint?: ListItemIconTint;
  onPress?: () => void;
  trailing?: ReactNode;
}) {
  const tint = ICON_TINT[iconTint];
  const content = (
    <View style={styles.row}>
      <View style={styles.leading}>
        {Icon ? (
          <View style={[styles.iconWrap, { backgroundColor: tint.bg }]}>
            <Icon color={tint.fg} size={18} strokeWidth={2.1} />
          </View>
        ) : null}
        <View style={styles.textWrap}>
          <Body style={styles.title}>{title}</Body>
          {subtitle ? <Caption>{subtitle}</Caption> : null}
        </View>
      </View>
      {trailing ?? (onPress ? <ChevronRight color={theme.colors.textSoft} size={18} strokeWidth={2.1} /> : null)}
    </View>
  );

  if (onPress) {
    return (
      <Pressable onPress={onPress} style={({ pressed }) => [styles.wrap, pressed && styles.pressed]}>
        {content}
      </Pressable>
    );
  }

  return <View style={styles.wrap}>{content}</View>;
}

export function ToggleTrailing({
  value,
  onValueChange,
  disabled,
  trackTone = 'primary',
  large,
}: {
  value: boolean;
  onValueChange: (v: boolean) => void;
  disabled?: boolean;
  trackTone?: 'primary' | 'success';
  large?: boolean;
}) {
  const trackOn =
    trackTone === 'success' ? 'rgba(61, 220, 151, 0.5)' : 'rgba(86, 194, 255, 0.5)';
  const trackOff = 'rgba(255, 255, 255, 0.14)';
  const el = (
    <Switch
      value={value}
      onValueChange={onValueChange}
      disabled={disabled}
      trackColor={{ false: trackOff, true: trackOn }}
      thumbColor={value ? theme.colors.white : 'rgba(200, 210, 225, 0.95)'}
      ios_backgroundColor={trackOff}
    />
  );
  if (large) {
    return <View style={styles.switchLarge}>{el}</View>;
  }
  return el;
}

const styles = StyleSheet.create({
  wrap: {
    borderRadius: theme.radius.md,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingHorizontal: 10,
    paddingVertical: 10,
    marginBottom: 6,
  },
  pressed: {
    opacity: 0.86,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.md,
  },
  leading: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: theme.spacing.md,
  },
  iconWrap: {
    width: 34,
    height: 34,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textWrap: {
    flex: 1,
    gap: 2,
  },
  title: {
    color: theme.colors.text,
    fontWeight: '700',
    lineHeight: 18,
  },
  switchLarge: {
    transform: [{ scaleX: 1.12 }, { scaleY: 1.12 }],
  },
});
