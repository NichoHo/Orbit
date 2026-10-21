import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { Platform, useColorScheme } from 'react-native';

const ACTIVE = '#2563eb';
const INACTIVE = '#a3a3a3';

function tabIcon(active: keyof typeof Ionicons.glyphMap, inactive: keyof typeof Ionicons.glyphMap) {
  function TabIcon({ focused }: { focused: boolean }) {
    return (
      <Ionicons name={focused ? active : inactive} size={26} color={focused ? ACTIVE : INACTIVE} />
    );
  }
  return TabIcon;
}

export default function TabLayout() {
  const dark = useColorScheme() === 'dark';

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: ACTIVE,
        tabBarInactiveTintColor: INACTIVE,
        tabBarStyle: {
          // Matches every screen's own bg-white dark:bg-neutral-950, with a
          // border that actually shows up against neutral-950 instead of
          // disappearing into it.
          backgroundColor: dark ? '#0a0a0a' : '#ffffff',
          borderTopColor: dark ? '#171717' : '#f5f5f5',
          // Web's default 49px bar clips the label under a 26px icon. A tab needs ~52px, so
          // 64 - 2*6 fits it with equal space above the icon and below the label.
          ...(Platform.OS === 'web' && { height: 64, paddingTop: 6, paddingBottom: 6 }),
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Tasks',
          tabBarIcon: tabIcon('checkmark-circle', 'checkmark-circle-outline'),
        }}
      />
      <Tabs.Screen
        name="habits"
        options={{
          title: 'Habits',
          tabBarIcon: tabIcon('flame', 'flame-outline'),
        }}
      />
      <Tabs.Screen
        name="stats"
        options={{
          title: 'Stats',
          tabBarIcon: tabIcon('bar-chart', 'bar-chart-outline'),
        }}
      />
      <Tabs.Screen
        name="agenda"
        options={{
          title: 'Agenda',
          tabBarIcon: tabIcon('calendar', 'calendar-outline'),
        }}
      />
    </Tabs>
  );
}
