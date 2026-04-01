import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';

import { Screen } from '@/components/ui/Screen';
import { Caption } from '@/components/ui/Typography';
import { useAppStore } from '@/store/appStore';

export default function WebViewLoginScreen() {
  const endpoint = useAppStore((s) => s.settings.firewallEndpoint);

  const uri = useMemo(() => endpoint, [endpoint]);

  return (
    <Screen>
      <View style={styles.wrap}>
        <Caption style={styles.hint}>
          Use this if direct HTTP login fails (cookies, hidden fields, or JavaScript). Complete login in
          the browser view; WiFiGate still enforces allowed-network checks on its own flows.
        </Caption>
        <WebView source={{ uri }} style={styles.web} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  hint: { paddingHorizontal: 20, marginBottom: 8, color: '#9aa7b8' },
  web: { flex: 1, backgroundColor: '#0f1419' },
});
