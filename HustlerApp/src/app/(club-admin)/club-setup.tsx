import { View, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { TextInput } from '@/components/TextInput';
import { Text } from '@/components/Text';
import { Icon } from '@/components/icons/Icon';
import { router } from 'expo-router';
import { useState } from 'react';
import { Theme, Fonts } from '@/constants/theme';
import { supabase } from '../../lib/supabase';
import { showAlert } from '../../lib/ui';
import { getMyClub } from '../../lib/club';

export default function ClubSetupScreen() {
  const [name, setName] = useState('');
  const [location, setLocation] = useState('');
  const [courtCount, setCourtCount] = useState('');
  const [loading, setLoading] = useState(false);

  const createClub = async () => {
    if (!name.trim()) {
      showAlert('Missing name', 'Please enter your club name.');
      return;
    }

    // A club-admin coming back here (e.g. deep link) may already have a club —
    // don't let them create a second one.
    const existing = await getMyClub();
    if (existing) {
      router.replace('/(club-admin)/dashboard' as any);
      return;
    }

    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) { router.replace('/login' as any); return; }

    // Only a 'club' role account can spin up a new club — a staff coach
    // landing here (they shouldn't, since they'd already have a club_coaches
    // row) must never be able to create one of their own.
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', session.user.id).single();
    if (profile?.role !== 'club') {
      showAlert('Not available', 'Only a Club account can set up a new club.');
      router.replace('/(coach-tabs)/players' as any);
      return;
    }

    setLoading(true);

    const { data: club, error: clubError } = await supabase
      .from('clubs')
      .insert({ owner_id: session.user.id, name: name.trim(), location: location.trim() || null })
      .select()
      .single();

    if (clubError || !club) {
      setLoading(false);
      showAlert('Error', 'Could not create your club. Please try again.');
      return;
    }

    // Order matters: club_coaches must exist before club_settings can be
    // written, since club_settings' RLS policy checks is_club_staff(club_id).
    const { error: coachError } = await supabase
      .from('club_coaches')
      .insert({ club_id: club.id, coach_id: session.user.id, role: 'owner' });

    if (coachError) {
      setLoading(false);
      showAlert('Error', 'Could not finish setting up your club. Please try again.');
      return;
    }

    await supabase.from('club_settings').insert({ club_id: club.id });

    const numCourts = Math.max(0, Math.min(50, parseInt(courtCount, 10) || 0));
    if (numCourts > 0) {
      const courts = Array.from({ length: numCourts }, (_, i) => ({ club_id: club.id, name: `Court ${i + 1}` }));
      await supabase.from('courts').insert(courts);
    }

    setLoading(false);
    router.replace('/(club-admin)/dashboard' as any);
  };

  const skip = () => router.replace('/(club-admin)/dashboard' as any);

  return (
    <View style={styles.container}>
      <TouchableOpacity style={styles.skipBtn} onPress={skip} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
        <Icon name="close-circle-outline" size={30} color={Theme.textSecondary} />
      </TouchableOpacity>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>Set up your club</Text>
        <Text style={styles.subtitle} maxFontSizeMultiplier={1.3}>This creates your club's admin space — you can edit these details later, or skip for now and look around first.</Text>

        <Text style={styles.label} maxFontSizeMultiplier={1.3}>Club name</Text>
        <TextInput
          style={styles.input}
          placeholder="e.g. Ace Badminton Club"
          placeholderTextColor={Theme.textSecondary}
          value={name}
          onChangeText={setName}
          autoCapitalize="words"
        />

        <Text style={styles.label} maxFontSizeMultiplier={1.3}>Location (optional)</Text>
        <TextInput
          style={styles.input}
          placeholder="e.g. Toronto, ON"
          placeholderTextColor={Theme.textSecondary}
          value={location}
          onChangeText={setLocation}
          autoCapitalize="words"
        />

        <Text style={styles.label} maxFontSizeMultiplier={1.3}>How many courts? (optional)</Text>
        <TextInput
          style={styles.input}
          placeholder="e.g. 4"
          placeholderTextColor={Theme.textSecondary}
          value={courtCount}
          onChangeText={setCourtCount}
          keyboardType="number-pad"
        />

        <TouchableOpacity
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={createClub}
          disabled={loading}
        >
          <Text style={styles.buttonText}>{loading ? 'Creating...' : 'Create Club'}</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Theme.background },
  skipBtn: { position: 'absolute', top: 56, right: 20, zIndex: 1 },
  scroll: { flexGrow: 1, padding: 24, paddingTop: 80, justifyContent: 'center' },
  title: { fontFamily: Fonts.serifMedium, fontSize: 30, color: Theme.textPrimary, marginBottom: 10 },
  subtitle: { fontFamily: Fonts.sansRegular, fontSize: 16, color: Theme.textSecondary, marginBottom: 26, lineHeight: 22 },
  label: { fontFamily: Fonts.sansSemiBold, fontSize: 15, color: Theme.textSecondary, marginBottom: 8 },
  input: {
    backgroundColor: Theme.cardWhite,
    borderRadius: 10,
    padding: 16,
    color: Theme.textPrimary,
    fontFamily: Fonts.sansRegular,
    fontSize: 16,
    marginBottom: 22,
    borderWidth: 1,
    borderColor: Theme.divider,
  },
  button: { backgroundColor: Theme.limeAccent, borderRadius: 30, paddingVertical: 16, alignItems: 'center' },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { fontFamily: Fonts.sansBold, color: Theme.limeAccentDark, fontSize: 16 },
});
