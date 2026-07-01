import { View, Text, StyleSheet, TouchableOpacity, TextInput, Alert, ScrollView } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Colors } from '@/constants/theme';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';

const SKILL_LEVELS = ['Beginner', 'Intermediate', 'Advanced'];
const EVENTS = ['Singles', 'Doubles', 'Mixed Doubles', 'All Events'];
const GOALS = ['Get Fitter', 'Get Stronger', 'Improve Speed', 'All Round'];
const GENDERS = ['Male', 'Female', 'Prefer not to say'];
const WEEKLY_GOALS = ['3', '4', '5', '6'];

const showAlert = (title: string, message: string) => {
  if (typeof window !== 'undefined') {
    window.alert(`${title}\n\n${message}`);
  } else {
    Alert.alert(title, message);
  }
};

export default function EditProfileScreen() {
  const [age, setAge] = useState('');
  const [skillLevel, setSkillLevel] = useState('');
  const [event, setEvent] = useState('');
  const [trainingGoal, setTrainingGoal] = useState('');
  const [gender, setGender] = useState('');
  const [weeklyGoal, setWeeklyGoal] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadProfile();
  }, []);

  const loadProfile = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) return;

    const { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', session.user.id)
      .single();

    if (profile) {
      setAge(profile.age ? String(profile.age) : '');
      setSkillLevel(profile.skill_level ?? '');
      setEvent(profile.event ?? '');
      setTrainingGoal(profile.training_goal ?? '');
      setGender(profile.gender ?? '');
      setWeeklyGoal(profile.weekly_goal ? String(profile.weekly_goal) : '');
    }
  };

  const handleSave = async () => {
    if (!age || !skillLevel || !event || !trainingGoal || !gender || !weeklyGoal) {
      showAlert('Missing fields', 'Please fill in all fields.');
      return;
    }

    setLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) {
      setLoading(false);
      return;
    }

    const { error } = await supabase
      .from('profiles')
      .update({
        age: parseInt(age),
        skill_level: skillLevel,
        event,
        training_goal: trainingGoal,
        gender,
        weekly_goal: parseInt(weeklyGoal),
      })
      .eq('id', session.user.id);

    setLoading(false);

    if (error) {
      showAlert('Error', 'Could not save your profile. Please try again.');
      return;
    }

    showAlert('Saved!', 'Your profile has been updated.');
    if (typeof window !== 'undefined') {
      window.history.back();
    } else {
      router.back();
    }
  };

  const goBack = () => {
    if (typeof window !== 'undefined') {
      window.history.back();
    } else {
      router.back();
    }
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

  return (
    <LinearGradient
      colors={[Colors.backgroundTop, Colors.backgroundBottom]}
      style={styles.container}
    >
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.titleRow}>
          <TouchableOpacity onPress={goBack}>
            <MaterialCommunityIcons name="arrow-left" size={24} color={Colors.accent} />
          </TouchableOpacity>
          <Text style={styles.title}>Edit Profile</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.label}>Age</Text>
          <TextInput
            style={styles.input}
            placeholder="Enter your age"
            placeholderTextColor={Colors.textSecondary}
            value={age}
            onChangeText={(t) => setAge(t.replace(/[^0-9]/g, ''))}
            keyboardType="numeric"
          />

          {renderSelector('Gender', GENDERS, gender, setGender)}
          {renderSelector('Skill Level', SKILL_LEVELS, skillLevel, setSkillLevel)}
          {renderSelector('Event', EVENTS, event, setEvent)}
          {renderSelector('Training Goal', GOALS, trainingGoal, setTrainingGoal)}
          {renderSelector('Weekly Training Goal (days)', WEEKLY_GOALS, weeklyGoal, setWeeklyGoal)}

          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleSave}
            disabled={loading}
          >
            <Text style={styles.buttonText}>
              {loading ? 'Saving...' : 'Save Changes'}
            </Text>
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
  label: { fontSize: 13, color: Colors.textSecondary, marginBottom: 8 },
  input: {
    backgroundColor: Colors.backgroundTop,
    borderRadius: 10,
    padding: 14,
    color: Colors.textPrimary,
    fontSize: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  selectorGroup: { marginBottom: 16 },
  optionsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  optionBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: Colors.backgroundTop,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  optionBtnActive: { backgroundColor: Colors.accent, borderColor: Colors.accent },
  optionBtnText: { fontSize: 13, color: Colors.textSecondary, fontWeight: '600' },
  optionBtnTextActive: { color: '#FFFFFF' },
  button: {
    backgroundColor: Colors.accent,
    borderRadius: 30,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#FFFFFF', fontWeight: 'bold', fontSize: 15 },
});