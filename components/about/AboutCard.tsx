import type { LucideIcon } from 'lucide-react-native';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { theme } from '@/constants/theme';

type AboutCardProps = {
  title: string;
  icon: LucideIcon;
  children: React.ReactNode;
};

export function AboutCard({ title, icon: Icon, children }: AboutCardProps) {
  return (
    <View style={styles.card}>
      <View style={styles.cardGlow} />
      <View style={styles.header}>
        <View style={styles.iconWrap}>
          <Icon size={18} color={theme.colors.primary} strokeWidth={2.1} />
        </View>
        <Text style={styles.title}>{title}</Text>
      </View>
      <View style={styles.body}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    position: 'relative',
    borderRadius: 22,
    backgroundColor: theme.colors.surfaceStrong,
    borderWidth: 1,
    borderColor: theme.colors.borderStrong,
    padding: 18,
    overflow: 'hidden',
    shadowColor: theme.colors.shadow,
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.24,
    shadowRadius: 22,
    elevation: 4,
    gap: 14,
  },
  cardGlow: {
    position: 'absolute',
    top: -18,
    right: -10,
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: 'rgba(86, 194, 255, 0.1)',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(86, 194, 255, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  title: {
    fontSize: 16,
    fontWeight: '800',
    color: theme.colors.text,
    letterSpacing: 0.2,
  },
  body: {
    gap: 12,
  },
});
