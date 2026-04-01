import { StyleSheet, Text, TextProps } from 'react-native';

import { theme } from '@/constants/theme';

export function Title(props: TextProps) {
  return <Text {...props} style={[styles.title, props.style]} />;
}

export function Subtitle(props: TextProps) {
  return <Text {...props} style={[styles.subtitle, props.style]} />;
}

export function Body(props: TextProps) {
  return <Text {...props} style={[styles.body, props.style]} />;
}

export function Caption(props: TextProps) {
  return <Text {...props} style={[styles.caption, props.style]} />;
}

export function Eyebrow(props: TextProps) {
  return <Text {...props} style={[styles.eyebrow, props.style]} />;
}

const styles = StyleSheet.create({
  title: {
    color: theme.colors.text,
    fontSize: theme.typography.title,
    fontWeight: '800',
    letterSpacing: -0.7,
  },
  subtitle: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.subtitle,
    fontWeight: '600',
    letterSpacing: -0.3,
  },
  body: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.body,
    lineHeight: 20,
  },
  caption: {
    color: theme.colors.textSoft,
    fontSize: theme.typography.caption,
    lineHeight: 16,
  },
  eyebrow: {
    color: theme.colors.cyan,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.3,
    textTransform: 'uppercase',
  },
});
