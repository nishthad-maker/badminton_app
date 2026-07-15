import { Tabs, usePathname } from 'expo-router';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { View } from 'react-native';
import { useEffect } from 'react';
import { Theme } from '@/constants/theme';
import { registerForPushNotifications } from '../../lib/notifications';
import { JournalFAB } from '@/components/JournalFAB';

export default function TabLayout() {
  const pathname = usePathname();

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
              <MaterialCommunityIcons name="home" size={26} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="workouts"
          options={{
            title: 'Train',
            tabBarIcon: ({ color }) => (
              <MaterialCommunityIcons name="run" size={26} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="matches"
          options={{
            title: 'Matches',
            tabBarIcon: ({ color }) => (
              <MaterialCommunityIcons name="clipboard-text" size={26} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="community"
          options={{
            title: 'Community',
            tabBarIcon: ({ color }) => (
              <MaterialCommunityIcons name="account-group" size={26} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="profile"
          options={{
            title: 'Profile',
            tabBarIcon: ({ color }) => (
              <MaterialCommunityIcons name="account-circle" size={26} color={color} />
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
      {pathname !== '/profile' && <JournalFAB />}
    </View>
  );
}
