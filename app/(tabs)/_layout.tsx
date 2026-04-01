import { Tabs } from 'expo-router';
import { Globe, LayoutGrid, Logs, Settings, ShieldCheck, Wifi } from 'lucide-react-native';

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
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.colors.white,
        tabBarInactiveTintColor: theme.colors.textSoft,
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '700',
          marginBottom: 4,
        },
        tabBarStyle: {
          position: 'absolute',
          left: 16,
          right: 16,
          bottom: 16,
          height: 72,
          borderRadius: 28,
          backgroundColor: 'rgba(9, 20, 35, 0.94)',
          borderTopWidth: 0,
          paddingTop: 8,
          paddingBottom: 8,
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
          title: 'Session',
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
