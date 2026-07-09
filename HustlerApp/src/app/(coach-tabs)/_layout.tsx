import { Tabs } from 'expo-router';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { View, Text, StyleSheet, ColorValue } from 'react-native';
import { useEffect, useState } from 'react';
import { Colors } from '@/constants/theme';
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
          backgroundColor: Colors.backgroundTop,
          borderTopColor: 'rgba(255,255,255,0.08)',
          borderTopWidth: 1,
          height: 80,
          paddingBottom: 16,
          paddingTop: 8,
        },
        tabBarActiveTintColor: Colors.accent,
        tabBarInactiveTintColor: Colors.textSecondary,
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
      }}
    >
      <Tabs.Screen
        name="players"
        options={{
          title: 'Players',
          tabBarIcon: ({ color, size }) => (
            <BadgeIcon name="account-group" color={color} size={size} count={alertCount} />
          ),
        }}
      />
      <Tabs.Screen
        name="schedule"
        options={{
          title: 'Schedule',
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="calendar-month-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="community"
        options={{
          title: 'Community',
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="forum-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="account-circle" size={size} color={color} />
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
    borderWidth: 1.5, borderColor: Colors.backgroundTop as string,
  },
  badgeText: { color: '#fff', fontSize: 9, fontWeight: 'bold' },
});
