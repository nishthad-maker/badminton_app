import { Tabs } from 'expo-router';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { View, StyleSheet, ColorValue } from 'react-native';
import { Text } from '@/components/Text';
import { useEffect, useState } from 'react';
import { Theme } from '@/constants/theme';
import { supabase } from '../../lib/supabase';
import { registerForPushNotifications } from '../../lib/notifications';

function BadgeIcon({ name, color, size, count }: { name: any; color: string | ColorValue; size: number; count: number }) {
  return (
    <View>
      <MaterialCommunityIcons name={name} size={size} color={color} />
      {count > 0 && (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{count > 9 ? '9+' : count}</Text>
        </View>
      )}
    </View>
  );
}

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
          title: 'Players',
          tabBarIcon: ({ color }) => (
            <BadgeIcon name="account-multiple-outline" color={color} size={26} count={alertCount} />
          ),
        }}
      />
      <Tabs.Screen
        name="schedule"
        options={{
          title: 'Schedule',
          tabBarIcon: ({ color }) => (
            <MaterialCommunityIcons name="calendar-month-outline" size={26} color={color} />
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
    </Tabs>
  );
}

const styles = StyleSheet.create({
  badge: {
    position: 'absolute', top: -4, right: -6,
    minWidth: 16, height: 16, borderRadius: 8,
    backgroundColor: '#FF3B30', alignItems: 'center',
    justifyContent: 'center', paddingHorizontal: 3,
    borderWidth: 1.5, borderColor: Theme.background as string,
  },
  badgeText: { color: '#fff', fontSize: 9, fontWeight: 'bold' },
});
