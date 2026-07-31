import { View, StyleSheet, TouchableOpacity, Alert, ScrollView } from 'react-native';
import { TextInput } from '@/components/TextInput';
import { Text } from '@/components/Text';
import { Icon } from '@/components/icons/Icon';
import { router } from 'expo-router';
import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { Theme, Fonts } from '@/constants/theme';

const SKILL_LEVELS = ['Beginner', 'Intermediate', 'Advanced'];
const EVENTS = ['Singles', 'Doubles', 'Mixed Doubles', 'All Events'];
const GENDERS = ['Male', 'Female', 'Prefer not to say'];

export default function OnboardingScreen() {
  const [age, setAge] = useState('');
  const [skillLevel, setSkillLevel] = useState('');
  const [event, setEvent] = useState('');
  const [gender, setGender] = useState('');
  const [loading, setLoading] = useState(false);

  const handleComplete = async () => {
    if (!age || !skillLevel || !event || !gender) {
      Alert.alert('Missing fields', 'Please fill in all fields to continue.');
      return;
    }

    setLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) {
      setLoading(false);
      router.replace('/login' as any);
      return;
    }

    const { error } = await supabase
      .from('profiles')
      .update({
        age: parseInt(age),
        skill_level: skillLevel,
        event: event,
        gender: gender,
      })
      .eq('id', session.user.id);

    setLoading(false);

    if (error) {
      Alert.alert('Error', 'Could not save your profile. Please try again.');
      return;
    }

    router.replace('/(tabs)' as any);
  };

  const renderSelector = (
    label: string,
    options: string[],
    selected: string,
    onSelect: (v: string) => void
  ) => (
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

  const skip = () => router.replace('/(tabs)' as any);

  return (
    <View style={styles.container}>
      <TouchableOpacity style={styles.skipBtn} onPress={skip} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
        <Icon name="close-circle-outline" size={30} color={Theme.textSecondary} />
      </TouchableOpacity>
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.card}>
          <Text style={styles.eyebrow}>WELCOME</Text>
          <Text style={styles.title}>Let's get to know you</Text>
          <Text style={styles.subtitle}>
            This helps us personalize your training plan and recommendations, or skip for now and explore the app first.
          </Text>

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
            onPress={handleComplete}
            disabled={loading}
          >
            <Text style={styles.buttonText}>
              {loading ? 'Saving...' : 'Complete Setup'}
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Theme.background },
  skipBtn: { position: 'absolute', top: 56, right: 20, zIndex: 1 },
  scroll: { flexGrow: 1, padding: 24, alignItems: 'center', justifyContent: 'center', paddingTop: 60, paddingBottom: 60 },
  card: { backgroundColor: Theme.cardWhite, borderRadius: 16, padding: 24, width: '100%' },
  eyebrow: { fontSize: 11, fontWeight: '500', color: Theme.eyebrowGreen, letterSpacing: 1, marginBottom: 4 },
  title: { fontFamily: Fonts.serifMedium, fontSize: 22, color: Theme.textPrimary, marginBottom: 8 },
  subtitle: { fontSize: 15, color: Theme.textSecondary, marginBottom: 24, lineHeight: 20 },
  label: { fontSize: 13, color: Theme.textSecondary, marginBottom: 8 },
  input: {
    backgroundColor: Theme.background,
    borderRadius: 10,
    padding: 14,
    color: Theme.textPrimary,
    fontSize: 15,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: Theme.divider,
  },
  selectorGroup: { marginBottom: 16 },
  optionsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  optionBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: Theme.background,
    borderWidth: 1,
    borderColor: Theme.divider,
  },
  optionBtnActive: { backgroundColor: Theme.eyebrowGreen, borderColor: Theme.eyebrowGreen },
  optionBtnText: { fontSize: 13, color: Theme.textSecondary, fontWeight: '600' },
  optionBtnTextActive: { color: '#FFFFFF' },
  button: {
    backgroundColor: Theme.limeAccent,
    borderRadius: 30,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: Theme.limeAccentDark, fontWeight: 'bold', fontSize: 15 },
});
