import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import * as ExpoSplashScreen from 'expo-splash-screen';

import { Body, Title } from '@/components/ui/Typography';
import { appendActivityLog } from '@/services/activityLog';
import { useAppStore } from '@/store/appStore';

const BOOTSTRAP_WAIT_MS = 12_000;

function waitForAuthBootstrap(): Promise<void> {
  if (useAppStore.getState().authBootstrapComplete) {
    return Promise.resolve();
  }
  let settled = false;
  return new Promise((resolve) => {
    const done = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      unsub();
      resolve();
    };
    const unsub = useAppStore.subscribe((s) => {
      if (s.authBootstrapComplete) {
        done();
      }
    });
    const timeout = setTimeout(done, BOOTSTRAP_WAIT_MS);
  });
}

export default function SplashRoute() {
  const hydrate = useAppStore((s) => s.hydrate);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await hydrate();
        await appendActivityLog('info', 'App opened');
        await waitForAuthBootstrap();
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
      router.replace('/(tabs)/home');
    } else {
      router.replace('/(tabs)/session');
    }
  }, [ready]);

  return (
    <View style={styles.wrap}>
      <Title style={styles.brand}>WiFiGate</Title>
      <Body style={styles.tag}>Enterprise firewall access</Body>
      <Body style={styles.statusLine}>Checking Wi‑Fi and session…</Body>
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
  statusLine: { marginTop: 16, textAlign: 'center', color: 'rgba(255,255,255,0.55)', fontSize: 13 },
  spin: { marginTop: 20 },
});
