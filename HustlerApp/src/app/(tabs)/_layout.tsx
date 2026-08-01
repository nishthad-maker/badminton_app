import { Tabs, usePathname, useGlobalSearchParams } from 'expo-router';
import { Icon } from '@/components/icons/Icon';
import { View } from 'react-native';
import { useEffect } from 'react';
import { Theme } from '@/constants/theme';
import { registerForPushNotifications } from '../../lib/notifications';
import { JournalFAB } from '@/components/JournalFAB';

export default function TabLayout() {
  const pathname = usePathname();
  // Set by the post-lesson journal nudge push: (tabs)?openJournal=lesson
  const { openJournal } = useGlobalSearchParams<{ openJournal?: string }>();
  const autoOpenType = openJournal === 'lesson' || openJournal === 'personal' ? openJournal : null;

  useEffect(() => {
    registerForPushNotifications();
  }, []);

  return (
    <View style={{ flex: 1 }}>
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
          name="index"
          options={{
            title: 'Home',
            tabBarIcon: ({ color }) => (
              <Icon name="home" size={29} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="workouts"
          options={{
            title: 'Train',
            tabBarIcon: ({ color }) => (
              <Icon name="run" size={29} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="matches"
          options={{
            title: 'Matches',
            tabBarIcon: ({ color }) => (
              <Icon name="clipboard-text" size={29} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="community"
          options={{
            title: 'Community',
            tabBarIcon: ({ color }) => (
              <Icon name="account-group" size={29} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="profile"
          options={{
            title: 'Profile',
            tabBarIcon: ({ color }) => (
              <Icon name="account-circle" size={29} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="calendar"
          options={{
            href: null,
          }}
        />
        <Tabs.Screen
          name="routines"
          options={{
            href: null,
          }}
        />
        <Tabs.Screen
          name="custom-workouts"
          options={{
            href: null,
          }}
        />
        <Tabs.Screen
          name="coach-section"
          options={{
            href: null,
          }}
        />
      </Tabs>
      {pathname !== '/profile' && <JournalFAB autoOpenType={autoOpenType} />}
    </View>
  );
}
