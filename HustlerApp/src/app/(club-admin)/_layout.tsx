import { Tabs, router } from 'expo-router';
import { View, ActivityIndicator } from 'react-native';
import { useEffect, useState, useCallback } from 'react';
import { useFocusEffect } from 'expo-router';
import { Icon } from '@/components/icons/Icon';
import { Theme } from '@/constants/theme';
import { supabase } from '../../lib/supabase';
import { getMyClub } from '../../lib/club';

export default function ClubAdminTabLayout() {
  const [checked, setChecked] = useState(false);
  const [isOwner, setIsOwner] = useState(false);

  const checkClub = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) {
      router.replace('/login' as any);
      return;
    }
    const club = await getMyClub();
    // No club yet: only a not-yet-set-up 'club' account reaches this screen
    // (a staff coach only gets here via the "My Club" link, which already
    // requires getMyClub() to resolve) — treat them as a would-be owner so
    // every tab (including Club, to finish setup) stays reachable.
    setIsOwner(club ? club.role === 'owner' : true);
    setChecked(true);
  }, []);

  useEffect(() => { checkClub(); }, [checkClub]);
  useFocusEffect(useCallback(() => { checkClub(); }, [checkClub]));

  if (!checked) {
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
        tabBarLabelStyle: { fontSize: 13, fontWeight: '600', marginTop: 2 },
      }}
    >
      <Tabs.Screen
        name="dashboard"
        options={{ title: 'Dashboard', tabBarIcon: ({ color }) => <Icon name="view-dashboard" size={29} color={color} /> }}
      />
      <Tabs.Screen
        name="tiers"
        options={{ title: 'Lessons', tabBarIcon: ({ color }) => <Icon name="whistle-outline" size={29} color={color} /> }}
      />
      <Tabs.Screen
        name="club-calendar"
        options={{ title: 'Calendar', tabBarIcon: ({ color }) => <Icon name="calendar-week" size={29} color={color} /> }}
      />
      <Tabs.Screen
        name="club-settings"
        options={{ title: 'Settings', href: isOwner ? undefined : null, tabBarIcon: ({ color }) => <Icon name="account-badge" size={29} color={color} /> }}
      />
      {/* Payments is reached from a link inside Settings now, not its own
          tab — the spec's Phase 1 club nav is exactly 4 tabs (Dashboard,
          Lessons, Calendar, Settings). */}
      <Tabs.Screen name="payments" options={{ href: null }} />
      <Tabs.Screen name="club-setup" options={{ href: null }} />
      <Tabs.Screen name="club-onboarding" options={{ href: null }} />
    </Tabs>
  );
}
