import { Tabs } from 'expo-router';
import { Globe, LayoutGrid, Logs, Settings, ShieldCheck, Wifi } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { theme } from '@/constants/theme';

function TabIcon({
  color,
  size,
  focused,
  Icon,
}: {
  color: string;
  size: number;
  focused: boolean;
  Icon: typeof LayoutGrid;
}) {
  return <Icon color={color} size={size} strokeWidth={focused ? 2.6 : 2.1} />;
}

export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  const safeBottom = Math.max(insets.bottom, 8);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.colors.white,
        tabBarInactiveTintColor: theme.colors.textSoft,
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '700',
          marginBottom: 0,
        },
        tabBarStyle: {
          position: 'absolute',
          left: 16,
          right: 16,
          bottom: 4,
          height: 68 + safeBottom,
          borderRadius: 28,
          backgroundColor: 'rgba(9, 20, 35, 0.94)',
          borderTopWidth: 0,
          paddingTop: 6,
          paddingBottom: safeBottom + 4,
          shadowColor: '#02101d',
          shadowOffset: { width: 0, height: 10 },
          shadowOpacity: 0.34,
          shadowRadius: 20,
          elevation: 18,
        },
        tabBarItemStyle: {
          borderRadius: 20,
          marginHorizontal: 4,
        },
      }}>
      <Tabs.Screen
        name="home"
        options={{
          title: 'Home',
          tabBarIcon: ({ color, size, focused }) => <TabIcon color={color} size={size} focused={focused} Icon={LayoutGrid} />,
        }}
      />
      <Tabs.Screen
        name="wifi"
        options={{
          title: 'WiFi',
          tabBarIcon: ({ color, size, focused }) => <TabIcon color={color} size={size} focused={focused} Icon={Wifi} />,
        }}
      />
      <Tabs.Screen
        name="session"
        options={{
          title: 'Login',
          tabBarIcon: ({ color, size, focused }) => <TabIcon color={color} size={size} focused={focused} Icon={ShieldCheck} />,
        }}
      />
      <Tabs.Screen
        name="logs"
        options={{
          title: 'Logs',
          tabBarIcon: ({ color, size, focused }) => <TabIcon color={color} size={size} focused={focused} Icon={Logs} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarIcon: ({ color, size, focused }) => <TabIcon color={color} size={size} focused={focused} Icon={Settings} />,
        }}
      />
      <Tabs.Screen
        name="browser"
        options={{
          href: null,
          title: 'Browser',
          tabBarIcon: ({ color, size, focused }) => <TabIcon color={color} size={size} focused={focused} Icon={Globe} />,
        }}
      />
    </Tabs>
  );
}
