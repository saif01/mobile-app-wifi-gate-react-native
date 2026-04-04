import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { Globe, MonitorSmartphone } from 'lucide-react-native';
import { router } from 'expo-router';

import { Card } from '@/components/ui/Card';
import { Screen } from '@/components/ui/Screen';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Body, Caption, Eyebrow, Subtitle, Title } from '@/components/ui/Typography';
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
  const [portalState, setPortalState] = useState<'idle' | 'waiting' | 'signed_in' | 'rejected'>(
    pendingPortalLogin ? 'waiting' : 'idle'
  );

  useEffect(() => {
    return () => {
      clearPortalLoginFallback();
    };
  }, [clearPortalLoginFallback]);

  const injectedJavaScript = useMemo(() => {
    if (!pendingPortalLogin) {
      return `
        true;
      `;
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
        message?: string;
      };

      if (payload.type === 'portal-error') {
        return;
      }

      if (payload.type !== 'portal-state') return;
      attemptedRef.current = true;

      if (payload.state === 'waiting') {
        setPortalState('waiting');
        return;
      }
      if (payload.state === 'signed_in') {
        setPortalState('signed_in');
        void handlePortalSuccess();
        return;
      }
      if (payload.state === 'rejected') {
        setPortalState('rejected');
        handlePortalRejected(payload.statusText || payload.captionText);
        return;
      }
      setPortalState('idle');
    } catch {
      // Ignore malformed messages from the page.
    }
  }

  return (
    <Screen contentStyle={styles.content}>
      <View style={styles.header}>
        <Eyebrow>Fallback Flow</Eyebrow>
        <Title style={styles.title}>Browser Login</Title>
        <Subtitle>{pendingPortalLogin ? 'Completing sign-in through the portal.' : 'Use this if direct login fails.'}</Subtitle>
      </View>

      <Card style={styles.infoCard}>
        <View style={styles.infoHeader}>
          <View style={styles.iconWrap}>
            <MonitorSmartphone color={theme.colors.primary} size={18} strokeWidth={2.2} />
          </View>
          <StatusBadge
            tone={portalState === 'signed_in' ? 'success' : portalState === 'rejected' ? 'error' : 'warning'}
            label={portalState === 'signed_in' ? 'Connected' : portalState === 'rejected' ? 'Failed' : pendingPortalLogin ? 'Auto Flow' : 'Manual Flow'}
          />
        </View>
        <Body style={styles.infoText}>
          {pendingPortalLogin ? 'WiFiGate is using the portal page to complete sign-in.' : 'Complete login in the portal.'}
        </Body>
        <View style={styles.endpointRow}>
          <Globe color={theme.colors.textMuted} size={16} strokeWidth={2.1} />
          <Caption>{uri}</Caption>
        </View>
      </Card>

      <View style={styles.webShell}>
        <WebView source={{ uri }} style={styles.web} injectedJavaScript={injectedJavaScript} onMessage={onMessage} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: theme.spacing.xl,
    paddingTop: theme.spacing.lg,
    paddingBottom: theme.spacing.xl,
  },
  header: {
    marginTop: theme.spacing.md,
    marginBottom: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  title: {
    fontSize: theme.typography.hero,
  },
  infoCard: {
    marginBottom: theme.spacing.lg,
  },
  infoHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: theme.spacing.md,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(86, 194, 255, 0.1)',
  },
  infoText: {
    color: theme.colors.text,
    marginBottom: theme.spacing.md,
  },
  endpointRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  webShell: {
    flex: 1,
    overflow: 'hidden',
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.bgSoft,
  },
  web: {
    flex: 1,
    backgroundColor: theme.colors.bgSoft,
  },
});
