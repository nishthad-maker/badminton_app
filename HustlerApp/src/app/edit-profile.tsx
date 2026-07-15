import { View, StyleSheet, TouchableOpacity, TextInput, Alert, ScrollView } from 'react-native';
import { Text } from '@/components/Text';
import { router } from 'expo-router';
import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Theme, Fonts } from '@/constants/theme';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { getOrCreateUsername, containsBlockedWords } from '../lib/community';

const SKILL_LEVELS = ['Beginner', 'Intermediate', 'Advanced'];
const EVENTS = ['Singles', 'Doubles', 'Mixed Doubles', 'All Events'];
const GENDERS = ['Male', 'Female', 'Prefer not to say'];

const showAlert = (title: string, message: string) => {
  if (typeof window !== 'undefined') window.alert(`${title}\n\n${message}`);
  else Alert.alert(title, message);
};

export default function EditProfileScreen() {
  const [fullName, setFullName] = useState('');
  const [username, setUsername] = useState('');
  const [originalUsername, setOriginalUsername] = useState('');
  const [email, setEmail] = useState('');
  const [originalEmail, setOriginalEmail] = useState('');
  const [age, setAge] = useState('');
  const [skillLevel, setSkillLevel] = useState('');
  const [event, setEvent] = useState('');
  const [gender, setGender] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => { loadProfile(); }, []);

  const loadProfile = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) return;

    const { data: profile } = await supabase
      .from('profiles').select('*').eq('id', session.user.id).single();

    if (profile) {
      setFullName(profile.full_name ?? session.user.user_metadata?.full_name ?? '');
      setAge(profile.age ? String(profile.age) : '');
      setSkillLevel(profile.skill_level ?? '');
      setEvent(profile.event ?? '');
      setGender(profile.gender ?? '');
    }

    const currentUsername = await getOrCreateUsername(session.user.id);
    setUsername(currentUsername);
    setOriginalUsername(currentUsername);

    setEmail(session.user.email ?? '');
    setOriginalEmail(session.user.email ?? '');
  };

  const handleSave = async () => {
    if (!age || !skillLevel || !event || !gender) {
      showAlert('Missing fields', 'Please fill in all fields.');
      return;
    }

    const parsedAge = parseInt(age);
    if (isNaN(parsedAge) || parsedAge < 5 || parsedAge > 100) {
      showAlert('Invalid age', 'Please enter a valid age.');
      return;
    }

    const trimmedUsername = username.trim();
    if (!trimmedUsername || trimmedUsername.length < 3 || trimmedUsername.length > 20) {
      showAlert('Invalid username', 'Username must be between 3 and 20 characters.');
      return;
    }
    if (!/^[a-zA-Z0-9_]+$/.test(trimmedUsername)) {
      showAlert('Invalid username', 'Username can only contain letters, numbers, and underscores.');
      return;
    }
    if (containsBlockedWords(trimmedUsername)) {
      showAlert('Invalid username', 'Please choose a different username.');
      return;
    }

    const trimmedEmail = email.trim();
    if (!trimmedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      showAlert('Invalid email', 'Please enter a valid email address.');
      return;
    }

    setLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) { setLoading(false); return; }

    if (trimmedUsername !== originalUsername) {
      const { data: taken } = await supabase
        .from('usernames').select('user_id').eq('username', trimmedUsername).neq('user_id', session.user.id).single();
      if (taken) { setLoading(false); showAlert('Username taken', 'Please choose a different username.'); return; }
      const { error: usernameError } = await supabase
        .from('usernames').update({ username: trimmedUsername }).eq('user_id', session.user.id);
      if (usernameError) { setLoading(false); showAlert('Error', 'Could not update your username. Please try again.'); return; }
    }

    const { error } = await supabase
      .from('profiles')
      .update({
        age: parsedAge,
        skill_level: skillLevel,
        event,
        gender,
      })
      .eq('id', session.user.id);

    let emailChangeRequested = false;
    if (trimmedEmail !== originalEmail) {
      const { error: emailError } = await supabase.auth.updateUser({ email: trimmedEmail });
      if (emailError) { setLoading(false); showAlert('Error', 'Could not update your email. Please try again.'); return; }
      emailChangeRequested = true;
    }

    setLoading(false);

    if (error) { showAlert('Error', 'Could not save your profile. Please try again.'); return; }

    showAlert('Saved!', emailChangeRequested
      ? 'Your profile has been updated. Check your new email for a confirmation link to finish changing it.'
      : 'Your profile has been updated.');
    if (typeof window !== 'undefined') window.history.back();
    else router.back();
  };

  const goBack = () => {
    if (typeof window !== 'undefined') window.history.back();
    else router.back();
  };

  const renderSelector = (label: string, options: string[], selected: string, onSelect: (v: string) => void) => (
    <View style={styles.selectorGroup}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.optionsRow}>
        {options.map((option) => (
          <TouchableOpacity
            key={option}
            style={[styles.optionBtn, selected === option && styles.optionBtnActive]}
            onPress={() => onSelect(option)}
          >
            <Text style={[styles.optionBtnText, selected === option && styles.optionBtnTextActive]}>
              {option}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );

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

          {/* Full name — locked, contact support to change */}
          <Text style={styles.label}>Full Name</Text>
          <View style={styles.readOnlyField}>
            <Text style={styles.readOnlyText}>{fullName}</Text>
            <MaterialCommunityIcons name="lock-outline" size={16} color={Theme.textSecondary} />
          </View>

          {/* Username */}
          <Text style={styles.label}>Username</Text>
          <TextInput
            style={styles.input}
            placeholder="Your username"
            placeholderTextColor={Theme.textSecondary}
            value={username}
            onChangeText={(t) => setUsername(t.replace(/\s/g, ''))}
            autoCapitalize="none"
            autoCorrect={false}
          />

          {/* Email */}
          <Text style={styles.label}>Email</Text>
          <TextInput
            style={styles.input}
            placeholder="Your email"
            placeholderTextColor={Theme.textSecondary}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
          />

          {/* Age */}
          <Text style={styles.label}>Age</Text>
          <TextInput
            style={styles.input}
            placeholder="Enter your age"
            placeholderTextColor={Theme.textSecondary}
            value={age}
            onChangeText={(t) => setAge(t.replace(/[^0-9]/g, ''))}
            keyboardType="numeric"
          />

          {renderSelector('Gender', GENDERS, gender, setGender)}
          {renderSelector('Skill Level', SKILL_LEVELS, skillLevel, setSkillLevel)}
          {renderSelector('Event', EVENTS, event, setEvent)}

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
  readOnlyField: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: Theme.background, borderRadius: 10, padding: 14, marginBottom: 16,
    borderWidth: 1, borderColor: Theme.divider,
  },
  readOnlyText: { color: Theme.textSecondary, fontSize: 15 },
  selectorGroup: { marginBottom: 16 },
  optionsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  optionBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: Theme.background, borderWidth: 1, borderColor: Theme.divider },
  optionBtnActive: { backgroundColor: Theme.eyebrowGreen, borderColor: Theme.eyebrowGreen },
  optionBtnText: { fontSize: 13, color: Theme.textSecondary, fontWeight: '600' },
  optionBtnTextActive: { color: '#FFFFFF' },
  button: { backgroundColor: Theme.limeAccent, borderRadius: 30, paddingVertical: 14, alignItems: 'center', marginTop: 8 },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: Theme.limeAccentDark, fontWeight: 'bold', fontSize: 15 },
});
