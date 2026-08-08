import { Stack, router } from 'expo-router';
import { View, ActivityIndicator } from 'react-native';
import { useEffect, useState, useCallback } from 'react';
import { useFocusEffect } from 'expo-router';
import { Theme } from '@/constants/theme';
import { supabase } from '../../lib/supabase';
import { getMyClub } from '../../lib/club';
import { resolveMyRole, ROLE_HOME_ROUTE } from '../../lib/roleRouting';
import { setPreferredViewMode } from '../../lib/viewMode';
import { SwitchBackBanner } from '@/components/SwitchBackBanner';
import { ClubAdminSideMenu } from '@/components/ClubAdminSideMenu';

export default function ClubAdminLayout() {
  const [checked, setChecked] = useState(false);
  const [isOwner, setIsOwner] = useState(false);
  // Only set once this owner has also flipped on "I also coach lessons
  // here" in club-settings.tsx — a plain owner with no coach side has
  // nothing to switch back to.
  const [isAlsoCoach, setIsAlsoCoach] = useState(false);

  const checkClub = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) {
      router.replace('/login' as any);
      return;
    }
    // A staff coach legitimately reaches these screens too (via the "My
    // Club" link), not just a role='club' owner account — only a player or
    // parent account has no business here at all.
    const role = await resolveMyRole();
    if (role === 'player' || role === 'parent') {
      router.replace(ROLE_HOME_ROUTE[role] as any);
      return;
    }
    const club = await getMyClub();
    // No club yet: only a not-yet-set-up 'club' account reaches this screen
    // (a staff coach only gets here via the "My Club" link, which already
    // requires getMyClub() to resolve) — treat them as a would-be owner so
    // every nav item (including Settings, to finish setup) stays reachable.
    setIsOwner(club ? club.role === 'owner' : true);
    const { data: profile } = await supabase.from('profiles').select('is_coach').eq('id', session.user.id).maybeSingle();
    setIsAlsoCoach(!!profile?.is_coach);
    setChecked(true);
  }, []);

  useEffect(() => { checkClub(); }, [checkClub]);
  useFocusEffect(useCallback(() => { checkClub(); }, [checkClub]));

  const backToCoach = async () => {
    await setPreferredViewMode('coach');
    router.replace('/(coach-tabs)/players' as any);
  };

  if (!checked) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: Theme.background }}>
        <ActivityIndicator color={Theme.eyebrowGreen} />
      </View>
    );
  }

  // A hamburger + slide-out side menu in place of the old bottom Tabs bar
  // (same 4 destinations, Settings still owner-gated) — see
  // ClubAdminSideMenu.tsx for why this is a floating overlay rather than a
  // persistent header: it needs zero changes to any of the screens below.
  // Stack (not Tabs) drives routing now, so there's no tab bar to hide
  // hidden routes (payments/club-setup/club-onboarding/enroll-private)
  // from — every file in this directory is just a plain stack screen.
  return (
    <View style={{ flex: 1 }}>
      {isAlsoCoach && <SwitchBackBanner label="Back to Coach" onPress={backToCoach} />}
      <Stack initialRouteName="dashboard" screenOptions={{ headerShown: false }} />
      <ClubAdminSideMenu showSettings={isOwner} />
    </View>
  );
}
