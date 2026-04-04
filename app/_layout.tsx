import { DarkTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';

import { theme } from '@/constants/theme';
import { AuthAgentBootstrap } from '@/services/authAgent';

export { ErrorBoundary } from 'expo-router';

SplashScreen.preventAutoHideAsync();

const navTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: theme.colors.bg,
    card: theme.colors.bg,
    primary: theme.colors.primary,
    text: theme.colors.text,
    border: theme.colors.border,
  },
};

export default function RootLayout() {
  return (
    <ThemeProvider value={navTheme}>
      <AuthAgentBootstrap />
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: theme.colors.bg },
          headerTintColor: theme.colors.text,
          headerTitleStyle: { fontWeight: '700' },
          contentStyle: { backgroundColor: theme.colors.bg },
        }}>
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="login" options={{ headerShown: false }} />
        <Stack.Screen name="dashboard" options={{ headerShown: false }} />
        <Stack.Screen name="logs" options={{ headerShown: false }} />
        <Stack.Screen name="settings" options={{ headerShown: false }} />
        <Stack.Screen name="endpoint" options={{ title: 'Firewall Endpoint' }} />
        <Stack.Screen name="about" options={{ title: 'About' }} />
        <Stack.Screen name="wifi" options={{ headerShown: false }} />
        <Stack.Screen name="biometric" options={{ title: 'Biometric Login' }} />
        <Stack.Screen name="webview-login" options={{ title: 'Browser Login', presentation: 'modal' }} />
      </Stack>
    </ThemeProvider>
  );
}
