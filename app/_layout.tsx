import { DarkTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';

export { ErrorBoundary } from 'expo-router';

SplashScreen.preventAutoHideAsync();

const navTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: '#0f1419',
    card: '#0f1419',
    primary: '#3dd6c6',
    text: '#f2f5f9',
    border: '#1f2a36',
  },
};

export default function RootLayout() {
  return (
    <ThemeProvider value={navTheme}>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: '#0f1419' },
          headerTintColor: '#f2f5f9',
          headerTitleStyle: { fontWeight: '600' },
          contentStyle: { backgroundColor: '#0f1419' },
        }}>
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="login" options={{ headerShown: false, title: 'Sign in' }} />
        <Stack.Screen name="dashboard" options={{ title: 'WiFiGate' }} />
        <Stack.Screen name="logs" options={{ title: 'Activity' }} />
        <Stack.Screen name="settings" options={{ title: 'Settings' }} />
        <Stack.Screen name="endpoint" options={{ title: 'Firewall endpoint' }} />
        <Stack.Screen name="wifi" options={{ title: 'Allowed Wi‑Fi' }} />
        <Stack.Screen name="biometric" options={{ title: 'Biometric login' }} />
        <Stack.Screen name="webview-login" options={{ title: 'Browser login' }} />
      </Stack>
    </ThemeProvider>
  );
}
