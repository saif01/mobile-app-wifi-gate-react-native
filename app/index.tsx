import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import * as ExpoSplashScreen from 'expo-splash-screen';

import { Body, Title } from '@/components/ui/Typography';
import { appendActivityLog } from '@/services/activityLog';
import { useAppStore } from '@/store/appStore';

export default function SplashRoute() {
  const hydrate = useAppStore((s) => s.hydrate);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await hydrate();
        await appendActivityLog('info', 'App opened');
      } finally {
        if (!cancelled) {
          setReady(true);
          await ExpoSplashScreen.hideAsync();
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [hydrate]);

  useEffect(() => {
    if (!ready) return;
    const { isAuthenticated } = useAppStore.getState();
    if (isAuthenticated) {
      router.replace('/dashboard');
    } else {
      router.replace('/login');
    }
  }, [ready]);

  return (
    <View style={styles.wrap}>
      <Title style={styles.brand}>WiFiGate</Title>
      <Body style={styles.tag}>Enterprise firewall access</Body>
      <ActivityIndicator style={styles.spin} color="#3dd6c6" />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    backgroundColor: '#0f1419',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  brand: { fontSize: 28 },
  tag: { marginTop: 8, textAlign: 'center' },
  spin: { marginTop: 28 },
});
