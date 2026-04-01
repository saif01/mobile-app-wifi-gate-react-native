import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, View, type ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';

import { theme } from '@/constants/theme';

export function Screen({
  children,
  scroll,
  contentStyle,
}: {
  children: ReactNode;
  scroll?: boolean;
  contentStyle?: ViewStyle;
}) {
  const content = scroll ? (
    <ScrollView
      contentContainerStyle={[styles.scrollContent, contentStyle]}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}>
      {children}
    </ScrollView>
  ) : (
    <View style={[styles.body, contentStyle]}>{children}</View>
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <LinearGradient
        colors={['#0b1730', '#071323', '#04101d']}
        start={{ x: 0.1, y: 0 }}
        end={{ x: 0.9, y: 1 }}
        style={styles.fill}>
        <View style={styles.orbOne} />
        <View style={styles.orbTwo} />
        {content}
      </LinearGradient>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.bg },
  fill: { flex: 1 },
  body: {
    flex: 1,
    paddingHorizontal: theme.spacing.xl,
    paddingBottom: theme.spacing.xxl,
  },
  scrollContent: {
    paddingHorizontal: theme.spacing.xl,
    paddingBottom: 140,
  },
  orbOne: {
    position: 'absolute',
    top: -60,
    right: -30,
    width: 220,
    height: 220,
    borderRadius: 220,
    backgroundColor: 'rgba(86, 194, 255, 0.12)',
  },
  orbTwo: {
    position: 'absolute',
    top: 150,
    left: -50,
    width: 180,
    height: 180,
    borderRadius: 180,
    backgroundColor: 'rgba(70, 226, 216, 0.08)',
  },
});
