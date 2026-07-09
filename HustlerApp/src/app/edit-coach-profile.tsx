import { View, Text, StyleSheet, TouchableOpacity, TextInput, Alert, ScrollView } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Colors } from '@/constants/theme';
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
    <LinearGradient colors={[Colors.backgroundTop, Colors.backgroundBottom]} style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>

        <View style={styles.titleRow}>
          <TouchableOpacity onPress={goBack}>
            <MaterialCommunityIcons name="arrow-left" size={24} color={Colors.accent} />
          </TouchableOpacity>
          <Text style={styles.title}>Edit Profile</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.label}>Full Name</Text>
          <TextInput
            style={styles.input}
            placeholder="Your full name"
            placeholderTextColor={Colors.textSecondary}
            value={fullName}
            onChangeText={setFullName}
            autoCapitalize="words"
          />

          <Text style={styles.label}>Club</Text>
          <TextInput
            style={styles.input}
            placeholder="Which club do you coach at?"
            placeholderTextColor={Colors.textSecondary}
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
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { flexGrow: 1, padding: 24, paddingTop: 60, paddingBottom: 60 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 24 },
  title: { fontSize: 24, fontWeight: 'bold', color: Colors.textPrimary },
  card: { backgroundColor: Colors.backgroundCard, borderRadius: 16, padding: 24 },
  label: { fontSize: 13, color: Colors.textSecondary, marginBottom: 8, fontWeight: '600' },
  input: {
    backgroundColor: Colors.backgroundTop, borderRadius: 10, padding: 14,
    color: Colors.textPrimary, fontSize: 14, marginBottom: 16,
    borderWidth: 1, borderColor: Colors.border,
  },
  button: { backgroundColor: Colors.accent, borderRadius: 30, paddingVertical: 14, alignItems: 'center', marginTop: 8 },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#FFFFFF', fontWeight: 'bold', fontSize: 15 },
});
