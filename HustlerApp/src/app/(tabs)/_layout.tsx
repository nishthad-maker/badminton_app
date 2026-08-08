import { Tabs, usePathname, useGlobalSearchParams, router } from 'expo-router';
import { Icon } from '@/components/icons/Icon';
import { View, ActivityIndicator } from 'react-native';
import { useEffect, useState } from 'react';
import { Theme } from '@/constants/theme';
import { registerForPushNotifications } from '../../lib/notifications';
import { JournalFAB } from '@/components/JournalFAB';
import { SwitchBackBanner } from '@/components/SwitchBackBanner';
import { resolveMyRole, ROLE_HOME_ROUTE } from '../../lib/roleRouting';
import { hasSavedParentSession, restoreParentSession } from '../../lib/managedAccounts';

export default function TabLayout() {
  const pathname = usePathname();
  // Set by the post-lesson journal nudge push: (tabs)?openJournal=lesson
  const { openJournal } = useGlobalSearchParams<{ openJournal?: string }>();
  const autoOpenType = openJournal === 'lesson' || openJournal === 'personal' ? openJournal : null;
  const [ready, setReady] = useState(false);
  // Set when a parent used "Use this phone as [child]" from their own
  // Profile tab (see lib/managedAccounts.ts) — this device is temporarily
  // signed into the managed child's real account instead of the parent's.
  const [showReturnToParent, setShowReturnToParent] = useState(false);

  useEffect(() => {
    registerForPushNotifications();
    hasSavedParentSession().then(setShowReturnToParent);
    resolveMyRole().then((role) => {
      if (role === null) { router.replace('/login' as any); return; }
      if (role !== 'player') { router.replace(ROLE_HOME_ROUTE[role] as any); return; }
      setReady(true);
    });
  }, []);

  const returnToParent = async () => {
    const ok = await restoreParentSession();
    if (ok) router.replace('/(parent-tabs)/home' as any);
  };

  if (!ready) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: Theme.background }}>
        <ActivityIndicator color={Theme.eyebrowGreen} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      {showReturnToParent && <SwitchBackBanner label="Back to my account" onPress={returnToParent} />}
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
