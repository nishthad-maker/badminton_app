import { Tabs, router } from 'expo-router';
import { View, ActivityIndicator } from 'react-native';
import { useEffect, useState } from 'react';
import { Icon } from '@/components/icons/Icon';
import { Theme } from '@/constants/theme';
import { resolveMyRole, ROLE_HOME_ROUTE } from '../../lib/roleRouting';

export default function ParentTabLayout() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    resolveMyRole().then((role) => {
      if (role === null) { router.replace('/login' as any); return; }
      if (role !== 'parent') { router.replace(ROLE_HOME_ROUTE[role] as any); return; }
      setReady(true);
    });
  }, []);

  if (!ready) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: Theme.background }}>
        <ActivityIndicator color={Theme.eyebrowGreen} />
      </View>
    );
  }

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
        options={{ title: 'Calendar', tabBarIcon: ({ color }) => <Icon name="calendar-week" size={29} color={color} /> }}
      />
      <Tabs.Screen
        name="tournaments"
        options={{ title: 'Matches', tabBarIcon: ({ color }) => <Icon name="clipboard-text" size={29} color={color} /> }}
      />
      <Tabs.Screen
        name="journal"
        options={{ title: 'Journal', tabBarIcon: ({ color }) => <Icon name="notebook-outline" size={29} color={color} /> }}
      />
      <Tabs.Screen
        name="profile"
        options={{ title: 'Profile', tabBarIcon: ({ color }) => <Icon name="account-circle" size={29} color={color} /> }}
      />
    </Tabs>
  );
}
