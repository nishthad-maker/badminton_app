import { Tabs } from 'expo-router';
import { Icon } from '@/components/icons/Icon';
import { Theme } from '@/constants/theme';

export default function ParentTabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: Theme.background,
          borderTopColor: Theme.divider,
          borderTopWidth: 1,
          height: 96,
          paddingBottom: 20,
          paddingTop: 12,
        },
        tabBarActiveTintColor: Theme.todayBlue,
        tabBarInactiveTintColor: Theme.textMuted,
        tabBarLabelStyle: { fontSize: 12, fontWeight: '600', marginTop: 2 },
      }}
    >
      <Tabs.Screen
        name="home"
        options={{ title: 'Home', tabBarIcon: ({ color }) => <Icon name="home" size={29} color={color} /> }}
      />
      <Tabs.Screen
        name="schedule"
        options={{ title: 'Schedule', tabBarIcon: ({ color }) => <Icon name="calendar-week" size={29} color={color} /> }}
      />
      <Tabs.Screen
        name="tournaments"
        options={{ title: 'Tournaments', tabBarIcon: ({ color }) => <Icon name="trophy-outline" size={29} color={color} /> }}
      />
      <Tabs.Screen
        name="journal"
        options={{ title: 'Journal', tabBarIcon: ({ color }) => <Icon name="notebook-outline" size={29} color={color} /> }}
      />
    </Tabs>
  );
}
