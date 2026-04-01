import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Switch, View } from 'react-native';
import type { LucideIcon } from 'lucide-react-native';
import { ChevronRight } from 'lucide-react-native';

import { Body, Caption } from '@/components/ui/Typography';
import { theme } from '@/constants/theme';

export function ListItem({
  title,
  subtitle,
  icon: Icon,
  onPress,
  trailing,
}: {
  title: string;
  subtitle?: string;
  icon?: LucideIcon;
  onPress?: () => void;
  trailing?: ReactNode;
}) {
  const content = (
    <View style={styles.row}>
      <View style={styles.leading}>
        {Icon ? (
          <View style={styles.iconWrap}>
            <Icon color={theme.colors.primary} size={18} strokeWidth={2.1} />
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
}: {
  value: boolean;
  onValueChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return <Switch value={value} onValueChange={onValueChange} disabled={disabled} />;
}

const styles = StyleSheet.create({
  wrap: {
    borderRadius: theme.radius.md,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.md,
    marginBottom: theme.spacing.sm,
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
    width: 38,
    height: 38,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(86, 194, 255, 0.1)',
  },
  textWrap: {
    flex: 1,
    gap: 4,
  },
  title: {
    color: theme.colors.text,
    fontWeight: '700',
  },
});
