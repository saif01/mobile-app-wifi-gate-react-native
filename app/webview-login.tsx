import { useEffect, useMemo, useRef } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { theme } from '@/constants/theme';
import { appendActivityLog } from '@/services/activityLog';
import { resolvePortalEntryUrl } from '@/services/firewallLogin';
import { useAppStore } from '@/store/appStore';

export default function WebViewLoginScreen() {
  const endpoint = useAppStore((s) => s.settings.firewallEndpoint);
  const pendingPortalLogin = useAppStore((s) => s.pendingPortalLogin);
  const clearPortalLoginFallback = useAppStore((s) => s.clearPortalLoginFallback);
  const recordSuccessfulManualLogin = useAppStore((s) => s.recordSuccessfulManualLogin);
  const setAuthenticated = useAppStore((s) => s.setAuthenticated);
  const uri = useMemo(() => resolvePortalEntryUrl(endpoint), [endpoint]);
  const attemptedRef = useRef(false);
  const successRef = useRef(false);
  const rejectedRef = useRef(false);

  useEffect(() => {
    return () => {
      clearPortalLoginFallback();
    };
  }, [clearPortalLoginFallback]);

  const injectedJavaScript = useMemo(() => {
    if (!pendingPortalLogin) {
      return `true;`;
    }

    const userId = JSON.stringify(pendingPortalLogin.userId);
    const password = JSON.stringify(pendingPortalLogin.password);

    return `
      (function() {
        var attempted = false;
        function post(payload) {
          window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify(payload));
        }
        function snapshot() {
          try {
            var state = typeof getState === 'function' ? getState() : 'unknown';
            var statusNode = document.getElementById('statusmessage');
            var captionNode = document.getElementById('signin-caption');
            post({
              type: 'portal-state',
              state: state,
              statusText: statusNode ? statusNode.innerText : '',
              captionText: captionNode ? captionNode.innerText : ''
            });
          } catch (error) {
            post({ type: 'portal-error', message: String(error) });
          }
        }
        function trySubmit() {
          if (attempted) return;
          var user = document.getElementById('username');
          var pass = document.getElementById('password');
          if (!user || !pass || typeof submitRequest !== 'function') {
            setTimeout(trySubmit, 300);
            return;
          }
          attempted = true;
          user.value = ${userId};
          pass.value = ${password};
          snapshot();
          submitRequest();
        }
        setTimeout(trySubmit, 450);
        setInterval(snapshot, 500);
        true;
      })();
    `;
  }, [pendingPortalLogin]);

  async function handlePortalSuccess() {
    if (!pendingPortalLogin || successRef.current) return;
    successRef.current = true;
    clearPortalLoginFallback();

    if (pendingPortalLogin.source === 'manual') {
      const ts = await recordSuccessfulManualLogin(pendingPortalLogin.userId, pendingPortalLogin.password);
      await setAuthenticated(true, ts);
    } else {
      await setAuthenticated(true, Date.now());
    }

    await appendActivityLog('success', 'Portal login success', { source: pendingPortalLogin.source });
    router.replace('/(tabs)/home');
  }

  function handlePortalRejected(message?: string) {
    if (!attemptedRef.current || rejectedRef.current) return;
    rejectedRef.current = true;
    clearPortalLoginFallback();
    Alert.alert('Portal Login Failed', message || 'The portal rejected the login.');
  }

  function onMessage(event: { nativeEvent: { data: string } }) {
    try {
      const payload = JSON.parse(event.nativeEvent.data) as {
        type?: string;
        state?: string;
        statusText?: string;
        captionText?: string;
      };

      if (payload.type === 'portal-error') return;
      if (payload.type !== 'portal-state') return;
      attemptedRef.current = true;

      if (payload.state === 'signed_in') {
        void handlePortalSuccess();
        return;
      }
      if (payload.state === 'rejected') {
        handlePortalRejected(payload.statusText || payload.captionText);
      }
    } catch {
      // Ignore malformed messages from the page.
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={['bottom', 'left', 'right']}>
      <View style={styles.webShell}>
        <WebView
          source={{ uri }}
          style={styles.web}
          injectedJavaScript={injectedJavaScript}
          onMessage={onMessage}
          contentInsetAdjustmentBehavior="never"
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: theme.colors.bgSoft,
  },
  webShell: {
    flex: 1,
    backgroundColor: theme.colors.bgSoft,
  },
  web: {
    flex: 1,
    backgroundColor: theme.colors.bgSoft,
  },
});
