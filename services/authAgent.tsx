import NetInfo from '@react-native-community/netinfo';
import { useEffect, useRef } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

import { appendActivityLog } from '@/services/activityLog';
import {
  describeFirewallLoginFailure,
  inspectFirewallSession,
  performFirewallLogin,
} from '@/services/firewallLogin';
import { getNetworkSnapshot } from '@/services/networkService';
import { evaluateWifiLoginGate } from '@/services/wifiGateAuth';
import { getSavedCredentials } from '@/services/secureCredentials';
import { useAppStore } from '@/store/appStore';

async function syncAuthAgent(reason: string) {
  const store = useAppStore.getState();
  const snapshot = await getNetworkSnapshot();
  const gate = evaluateWifiLoginGate(snapshot, store.settings.allowedWifi, store.settings.noLoginWifi);
  const checkedAt = Date.now();

  if (!gate.ok) {
    if (store.autoLoginPausedUntilDisconnect && (!gate.snapshot.isConnected || !gate.snapshot.isWifi)) {
      store.setAutoLoginPausedUntilDisconnect(false);
    }
    const targetSsid = gate.snapshot.ssid || gate.access.match?.ssid || null;
    const status = !gate.snapshot.isConnected ? 'offline' : 'blocked';
    store.updateAuthAgent({
      status,
      message: gate.message,
      targetSsid,
      lastCheckedAt: checkedAt,
      lastError: undefined,
    });
    if (store.isAuthenticated) {
      await store.setAuthenticated(false);
    }
    return;
  }

  const { access } = gate;
  const targetSsid = access.noLoginMatch?.ssid || access.match?.ssid || gate.snapshot.ssid || null;

  if (access.skipPortalAuth) {
    if (!store.isAuthenticated) {
      await store.setAuthenticated(true, Date.now());
    }
    store.updateAuthAgent({
      status: 'authenticated',
      message: 'This Wi‑Fi does not use captive portal login.',
      targetSsid,
      lastCheckedAt: checkedAt,
      lastError: undefined,
    });
    return;
  }

  if (!store.settings.autoLoginEnabled) {
    store.updateAuthAgent({
      status: 'ready',
      message: 'Allowed WiFi connected. Auto-login is disabled.',
      targetSsid,
      lastCheckedAt: checkedAt,
      lastError: undefined,
    });
    return;
  }

  if (store.autoLoginPausedUntilDisconnect) {
    store.updateAuthAgent({
      status: 'paused',
      message: 'Auto-login is paused until network changes.',
      targetSsid,
      lastCheckedAt: checkedAt,
      lastError: undefined,
    });
    return;
  }

  const savedCredentials = await getSavedCredentials();
  if (!savedCredentials) {
    store.updateAuthAgent({
      status: 'needs_credentials',
      message: 'Login once to store credentials for auto-login.',
      targetSsid,
      lastCheckedAt: checkedAt,
      lastError: undefined,
    });
    return;
  }

  store.updateAuthAgent({
    status: 'checking',
    message: 'Checking captive portal state.',
    targetSsid,
    lastCheckedAt: checkedAt,
    lastError: undefined,
  });

  const probe = await inspectFirewallSession(store.settings.firewallEndpoint);
  if (probe.state === 'authenticated') {
    if (!useAppStore.getState().isAuthenticated) {
      await store.markStoredCredentialLogin(savedCredentials.userId, savedCredentials.password);
      await store.setAuthenticated(true, Date.now());
    }
    store.updateAuthAgent({
      status: 'authenticated',
      message: 'Network session is already authenticated.',
      targetSsid,
      lastCheckedAt: Date.now(),
      lastError: undefined,
    });
    return;
  }

  if (probe.state === 'offline') {
    store.updateAuthAgent({
      status: 'error',
      message: 'Portal endpoint is unreachable.',
      targetSsid,
      lastCheckedAt: Date.now(),
      lastError: probe.message,
    });
    if (store.isAuthenticated) {
      await store.setAuthenticated(false);
    }
    return;
  }

  store.updateAuthAgent({
    status: 'authenticating',
    message: 'Authenticating on captive portal.',
    targetSsid,
    lastCheckedAt: checkedAt,
    lastAttemptAt: checkedAt,
    lastError: undefined,
  });
  await appendActivityLog('info', 'Auto-login attempt', { reason, ssid: targetSsid ?? '' });

  const result = await performFirewallLogin({
    baseUrl: store.settings.firewallEndpoint,
    userId: savedCredentials.userId,
    password: savedCredentials.password,
    initiator: 'auto',
  });

  if (result.ok) {
    const ts = await store.markStoredCredentialLogin(savedCredentials.userId, savedCredentials.password);
    await store.setAuthenticated(true, ts);
    store.updateAuthAgent({
      status: 'authenticated',
      message: 'Authenticated automatically.',
      targetSsid,
      lastCheckedAt: Date.now(),
      lastAttemptAt: checkedAt,
      lastError: undefined,
    });
    await appendActivityLog('success', 'Auto-login success', { ssid: targetSsid ?? '' });
    return;
  }

  if (result.reason === 'deferred') {
    store.updateAuthAgent({
      status: 'ready',
      message: 'Manual sign-in in progress — auto-login will run again when you finish.',
      targetSsid,
      lastCheckedAt: Date.now(),
      lastAttemptAt: checkedAt,
      lastError: undefined,
    });
    return;
  }

  if (result.reason === 'cancelled') {
    store.updateAuthAgent({
      status: 'ready',
      message: 'Automatic login paused — a manual login started or a new attempt replaced this one.',
      targetSsid,
      lastCheckedAt: Date.now(),
      lastAttemptAt: checkedAt,
      lastError: undefined,
    });
    return;
  }

  await store.setAuthenticated(false);
  const message = describeFirewallLoginFailure(result);
  const needsPortal = result.reason === 'unexpected_response' || result.reason === 'parse_error';
  store.updateAuthAgent({
    status: needsPortal ? 'needs_portal' : 'error',
    message: needsPortal ? 'Portal requires browser-assisted login.' : message,
    targetSsid,
    lastCheckedAt: Date.now(),
    lastAttemptAt: checkedAt,
    lastError: message,
  });
  await appendActivityLog(needsPortal ? 'warn' : 'error', needsPortal ? 'Portal fallback required' : 'Auto-login failed', {
    reason: result.reason ?? 'unknown',
    ssid: targetSsid ?? '',
  });
}

export function AuthAgentBootstrap() {
  const hydrated = useAppStore((s) => s.hydrated);
  const scheduleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const runningRef = useRef(false);
  const queuedRef = useRef<string | null>(null);
  const lastNetworkKeyRef = useRef<string | null>(null);
  const initialSyncReportedRef = useRef(false);

  useEffect(() => {
    if (!hydrated) return;

    const run = async (reason: string) => {
      if (runningRef.current) {
        queuedRef.current = reason;
        return;
      }

      runningRef.current = true;
      try {
        const snapshot = await getNetworkSnapshot();
        const networkKey = snapshot.isConnected
          ? `${snapshot.type ?? 'unknown'}:${snapshot.ssid ?? ''}:${snapshot.gatewayIp ?? ''}`
          : null;
        if (
          useAppStore.getState().autoLoginPausedUntilDisconnect &&
          lastNetworkKeyRef.current &&
          networkKey &&
          networkKey !== lastNetworkKeyRef.current
        ) {
          useAppStore.getState().setAutoLoginPausedUntilDisconnect(false);
        }
        if (!networkKey && useAppStore.getState().autoLoginPausedUntilDisconnect) {
          useAppStore.getState().setAutoLoginPausedUntilDisconnect(false);
        }
        lastNetworkKeyRef.current = networkKey;
        await syncAuthAgent(reason);
      } finally {
        if (!initialSyncReportedRef.current) {
          initialSyncReportedRef.current = true;
          useAppStore.getState().setAuthBootstrapComplete(true);
        }
        runningRef.current = false;
        if (queuedRef.current) {
          const nextReason = queuedRef.current;
          queuedRef.current = null;
          void run(nextReason);
        }
      }
    };

    const schedule = (reason: string, delay = 250) => {
      if (scheduleTimerRef.current) {
        clearTimeout(scheduleTimerRef.current);
      }
      scheduleTimerRef.current = setTimeout(() => {
        scheduleTimerRef.current = null;
        void run(reason);
      }, delay);
    };

    const unsubscribeNetInfo = NetInfo.addEventListener(() => {
      schedule('network-change');
    });

    const appStateSub = AppState.addEventListener('change', (nextState: AppStateStatus) => {
      if (nextState === 'active') {
        schedule('foreground', 0);
      }
    });

    schedule('startup', 0);

    return () => {
      unsubscribeNetInfo();
      appStateSub.remove();
      if (scheduleTimerRef.current) {
        clearTimeout(scheduleTimerRef.current);
      }
    };
  }, [hydrated]);

  return null;
}
