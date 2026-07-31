import { Tabs } from 'expo-router';
import { Icon } from '@/components/icons/Icon';
import { useEffect, useState } from 'react';
import { Theme } from '@/constants/theme';
import { supabase } from '../../lib/supabase';
import { registerForPushNotifications } from '../../lib/notifications';

export default function CoachTabLayout() {
  const [alertCount, setAlertCount] = useState(0);

  useEffect(() => {
    loadAlerts();
    registerForPushNotifications();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      loadAlerts();
      registerForPushNotifications();
    });

    return () => subscription.unsubscribe();
  }, []);

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
  );
}
