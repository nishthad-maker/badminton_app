import { Tabs, router } from 'expo-router';
import { Icon } from '@/components/icons/Icon';
import { View, ActivityIndicator } from 'react-native';
import { useEffect, useState } from 'react';
import { Theme } from '@/constants/theme';
import { supabase } from '../../lib/supabase';
import { registerForPushNotifications } from '../../lib/notifications';
import { resolveMyRole, ROLE_HOME_ROUTE } from '../../lib/roleRouting';
import { setPreferredViewMode } from '../../lib/viewMode';
import { SwitchBackBanner } from '@/components/SwitchBackBanner';

export default function CoachTabLayout() {
  const [alertCount, setAlertCount] = useState(0);
  const [ready, setReady] = useState(false);
  // Only an owner who has also flipped on "I also coach lessons here" (see
  // club-settings.tsx) has a club account to switch back to — a plain
  // staff coach with no club of their own gets nothing here.
  const [ownsClub, setOwnsClub] = useState(false);

  useEffect(() => {
    loadAlerts();
    registerForPushNotifications();
    resolveMyRole().then((role) => {
      if (role === null) { router.replace('/login' as any); return; }
      if (role !== 'coach') { router.replace(ROLE_HOME_ROUTE[role] as any); return; }
      setReady(true);
    });
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session?.user) return;
      const { data: profile } = await supabase.from('profiles').select('role').eq('id', session.user.id).maybeSingle();
      setOwnsClub(profile?.role === 'club');
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      loadAlerts();
      registerForPushNotifications();
    });

    return () => subscription.unsubscribe();
  }, []);

  const backToClubAdmin = async () => {
    await setPreferredViewMode('club');
    router.replace('/(club-admin)/dashboard' as any);
  };

  const loadAlerts = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) { setAlertCount(0); return; }
    const me = session.user.id;

    const { data: pendingRequests } = await supabase
      .from('coach_connections').select('id').eq('coach_id', me).eq('status', 'pending');

    const { data: unreadNotifs } = await supabase
      .from('notifications').select('id').eq('user_id', me).eq('seen', false);

    setAlertCount((pendingRequests ?? []).length + (unreadNotifs ?? []).length);
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
      {ownsClub && <SwitchBackBanner label="Back to Club Admin" onPress={backToClubAdmin} />}
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
          name="players"
          options={{
            title: 'Dashboard',
            tabBarIcon: ({ color }) => <Icon name="view-dashboard" size={29} color={color} />,
            tabBarBadge: alertCount > 0 ? (alertCount > 9 ? '9+' : alertCount) : undefined,
            tabBarBadgeStyle: { backgroundColor: '#FF3B30' },
          }}
        />
        <Tabs.Screen
          name="schedule"
          options={{
            title: 'Schedule',
            tabBarIcon: ({ color }) => (
              <Icon name="calendar-month" size={29} color={color} />
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
      </Tabs>
    </View>
  );
}
