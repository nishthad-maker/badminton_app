import { View, StyleSheet, TouchableOpacity, TextInput, Alert, ScrollView } from 'react-native';
import { Text } from '@/components/Text';
import { router } from 'expo-router';
import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Theme, Fonts } from '@/constants/theme';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';

const showAlert = (title: string, message: string) => {
  if (typeof window !== 'undefined') window.alert(`${title}\n\n${message}`);
  else Alert.alert(title, message);
};

export default function EditCoachProfileScreen() {
  const [fullName, setFullName] = useState('');
  const [club, setClub] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => { loadProfile(); }, []);

  const loadProfile = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) return;

    const { data: profile } = await supabase
      .from('profiles').select('*').eq('id', session.user.id).single();

    if (profile) {
      setFullName(profile.full_name ?? session.user.user_metadata?.full_name ?? '');
      setClub(profile.club ?? '');
    }
  };

  const handleSave = async () => {
    if (!fullName.trim()) { showAlert('Missing name', 'Please enter your name.'); return; }

    setLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) { setLoading(false); return; }

    const { error } = await supabase
      .from('profiles')
      .update({
        full_name: fullName.trim(),
        club: club.trim() || null,
      })
      .eq('id', session.user.id);

    await supabase.auth.updateUser({ data: { full_name: fullName.trim() } });

    setLoading(false);

    if (error) { showAlert('Error', 'Could not save your profile. Please try again.'); return; }

    showAlert('Saved!', 'Your profile has been updated.');
    if (typeof window !== 'undefined') window.history.back();
    else router.back();
  };

  const goBack = () => {
    if (typeof window !== 'undefined') window.history.back();
    else router.back();
  };

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>

        <View style={styles.titleRow}>
          <TouchableOpacity onPress={goBack}>
            <MaterialCommunityIcons name="arrow-left" size={24} color={Theme.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.title}>Edit Profile</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.label}>Full Name</Text>
          <TextInput
            style={styles.input}
            placeholder="Your full name"
            placeholderTextColor={Theme.textSecondary}
            value={fullName}
            onChangeText={setFullName}
            autoCapitalize="words"
          />

          <Text style={styles.label}>Club</Text>
          <TextInput
            style={styles.input}
            placeholder="Which club do you coach at?"
            placeholderTextColor={Theme.textSecondary}
            value={club}
            onChangeText={setClub}
            autoCapitalize="words"
          />

          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleSave}
            disabled={loading}
          >
            <Text style={styles.buttonText}>{loading ? 'Saving...' : 'Save Changes'}</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Theme.background },
  scroll: { flexGrow: 1, padding: 24, paddingTop: 60, paddingBottom: 60 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 24 },
  title: { fontFamily: Fonts.serifMedium, fontSize: 24, color: Theme.textPrimary },
  card: { backgroundColor: Theme.cardWhite, borderRadius: 16, padding: 24 },
  label: { fontSize: 13, color: Theme.textSecondary, marginBottom: 8, fontWeight: '600' },
  input: {
    backgroundColor: Theme.background, borderRadius: 10, padding: 14,
    color: Theme.textPrimary, fontSize: 15, marginBottom: 16,
    borderWidth: 1, borderColor: Theme.divider,
  },
  button: { backgroundColor: Theme.limeAccent, borderRadius: 30, paddingVertical: 14, alignItems: 'center', marginTop: 8 },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: Theme.limeAccentDark, fontWeight: 'bold', fontSize: 15 },
});
