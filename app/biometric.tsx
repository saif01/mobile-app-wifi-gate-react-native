import { useEffect, useState } from 'react';
import { StyleSheet, Switch, View } from 'react-native';

import { Screen } from '@/components/ui/Screen';
import { Body, Caption, Title } from '@/components/ui/Typography';
import { appendActivityLog } from '@/services/activityLog';
import { isBiometricAvailable } from '@/services/biometricService';
import { useAppStore } from '@/store/appStore';

export default function BiometricScreen() {
  const biometricEnabled = useAppStore((s) => s.biometricEnabled);
  const manualLoginDone = useAppStore((s) => s.manualLoginDone);
  const setBiometric = useAppStore((s) => s.setBiometric);

  const [hardware, setHardware] = useState(false);

  useEffect(() => {
    void (async () => {
      setHardware(await isBiometricAvailable());
    })();
  }, []);

  return (
    <Screen scroll>
      <Title>Biometric login</Title>
      <Body style={styles.desc}>
        After a successful manual login with “Remember credentials” enabled, you can unlock saved
        credentials with fingerprint or face.
      </Body>

      {!hardware ? (
        <Caption style={styles.warn}>Biometric hardware is not available or not enrolled.</Caption>
      ) : null}

      {!manualLoginDone ? (
        <Caption style={styles.warn}>Complete a manual login once before enabling biometrics.</Caption>
      ) : null}

      <View style={styles.switchRow}>
        <Body>Enable biometric login</Body>
        <Switch
          value={biometricEnabled}
          disabled={!hardware || !manualLoginDone}
          onValueChange={async (v) => {
            await setBiometric(v);
            await appendActivityLog('info', 'Biometric toggled', { enabled: v });
          }}
        />
      </View>

      <Caption style={styles.meta}>
        On failure you can always use ID and password on the login screen.
      </Caption>
    </Screen>
  );
}

const styles = StyleSheet.create({
  desc: { marginTop: 8, marginBottom: 12 },
  warn: { color: '#ffc7a6', marginBottom: 12 },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#111a24',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#1f2a36',
  },
  meta: { marginTop: 16 },
});
