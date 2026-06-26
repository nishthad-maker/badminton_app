import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Alert } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { useState, useEffect } from 'react';
import { LinearGradient } from 'expo-linear-gradient';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../lib/supabase';
import { Colors } from '@/constants/theme';

type StrengthSession = {
  date: string;
  weight: string;
  sets: string;
  reps: string;
};

type FootworkSession = {
  date: string;
  sets: string;
  duration: string;
  feeling: number;
};

type EnduranceSession = {
  date: string;
  duration: string;
  distance: string;
  feeling: number;
};

type Session = StrengthSession | FootworkSession | EnduranceSession;

const FEELING_LABELS = ['😞 Bad', '😐 OK', '😄 Great'];

export default function ExerciseScreen() {
  const { name, description, steps, muscles, category } = useLocalSearchParams();
  const stepList: string[] = JSON.parse(steps as string || '[]');
  const muscleList: string[] = JSON.parse(muscles as string || '[]');
  const [activeTab, setActiveTab] = useState<'howto' | 'notes'>('howto');
  const [sessions, setSessions] = useState<Session[]>([]);
  const [generalNote, setGeneralNote] = useState('');
  const [user, setUser] = useState<any>(null);

  // Strength fields
  const [weight, setWeight] = useState('');
  const [sets, setSets] = useState('');
  const [reps, setReps] = useState('');

  // Footwork fields
  const [fwSets, setFwSets] = useState('');
  const [fwDuration, setFwDuration] = useState('');

  // Endurance fields
  const [duration, setDuration] = useState('');
  const [distance, setDistance] = useState('');

  // Shared
  const [feeling, setFeeling] = useState(-1);

  const noteKey = `note_${name}`;

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const currentUser = session?.user ?? null;
      setUser(currentUser);

      if (currentUser) {
        const { data } = await supabase
          .from('session_logs')
          .select('*')
          .eq('user_id', currentUser.id)
          .eq('exercise_name', name as string)
          .order('created_at', { ascending: false });

        if (data) setSessions(data.map((row: any) => row.log_data));
      }

      const note = await AsyncStorage.getItem(noteKey);
      if (note) setGeneralNote(note);
    } catch (e) {
      console.log('Load error', e);
    }
  };

  const saveSession = async () => {
    const date = new Date().toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric'
    });

    let newSession: Session;

    if (category === 'strength') {
      if (!weight || !sets || !reps) {
        Alert.alert('Missing fields', 'Please fill in weight, sets, and reps.');
        return;
      }
      newSession = { date, weight, sets, reps } as StrengthSession;
      setWeight(''); setSets(''); setReps('');
    } else if (category === 'footwork') {
      if (!fwSets || !fwDuration || feeling === -1) {
        Alert.alert('Missing fields', 'Please fill in sets, duration, and feeling.');
        return;
      }
      newSession = { date, sets: fwSets, duration: fwDuration, feeling } as FootworkSession;
      setFwSets(''); setFwDuration(''); setFeeling(-1);
    } else {
      if (!duration || feeling === -1) {
        Alert.alert('Missing fields', 'Please fill in duration and feeling.');
        return;
      }
      newSession = { date, duration, distance, feeling } as EnduranceSession;
      setDuration(''); setDistance(''); setFeeling(-1);
    }

    if (user) {
      await supabase.from('session_logs').insert({
        user_id: user.id,
        exercise_name: name as string,
        category: category as string,
        log_data: newSession,
      });
      const updated = [newSession, ...sessions];
      setSessions(updated);
    } else {
      Alert.alert(
        'Not signed in',
        'Sign in to save your progress across devices.',
        [
          { text: 'Sign In', onPress: () => router.push('/login' as any) },
          { text: 'Cancel', style: 'cancel' }
        ]
      );
    }
  };

  const saveNote = async (text: string) => {
    setGeneralNote(text);
    await AsyncStorage.setItem(noteKey, text);
  };

  const renderInput = (placeholder: string, value: string, setValue: (v: string) => void, keyboardType: any = 'default') => (
    <TextInput
      style={styles.input}
      placeholder={placeholder}
      placeholderTextColor={Colors.textSecondary}
      value={value}
      onChangeText={(text) => {
        if (keyboardType === 'numeric') {
          const cleaned = text.replace(/[^0-9.]/g, '');
          setValue(cleaned);
        } else {
          setValue(text);
        }
      }}
      keyboardType={keyboardType}
    />
  );

  const renderFeeling = () => (
    <View>
      <Text style={styles.fieldLabel}>Feeling</Text>
      <View style={styles.feelingRow}>
        {FEELING_LABELS.map((label, i) => (
          <TouchableOpacity
            key={i}
            style={[styles.feelingBtn, feeling === i && styles.feelingBtnActive]}
            onPress={() => setFeeling(i)}
          >
            <Text style={[styles.feelingText, feeling === i && styles.feelingTextActive]}>
              {label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );

  const renderSessionHistory = () => {
    if (sessions.length === 0) {
      return <Text style={styles.emptyText}>No sessions logged yet.</Text>;
    }

    return sessions.map((session, i) => (
      <View key={i} style={styles.historyRow}>
        <Text style={styles.historyDate}>{session.date}</Text>
        {category === 'strength' && (
          <View style={styles.historyFields}>
            <Text style={styles.historyField}>⚖️ {(session as StrengthSession).weight}kg</Text>
            <Text style={styles.historyField}>🔁 {(session as StrengthSession).sets} sets</Text>
            <Text style={styles.historyField}>💪 {(session as StrengthSession).reps} reps</Text>
          </View>
        )}
        {category === 'footwork' && (
          <View style={styles.historyFields}>
            <Text style={styles.historyField}>🔁 {(session as FootworkSession).sets} sets</Text>
            <Text style={styles.historyField}>⏱ {(session as FootworkSession).duration} min</Text>
            <Text style={styles.historyField}>{FEELING_LABELS[(session as FootworkSession).feeling]}</Text>
          </View>
        )}
        {category === 'endurance' && (
          <View style={styles.historyFields}>
            <Text style={styles.historyField}>⏱ {(session as EnduranceSession).duration} min</Text>
            {(session as EnduranceSession).distance ? (
              <Text style={styles.historyField}>📍 {(session as EnduranceSession).distance}km</Text>
            ) : null}
            <Text style={styles.historyField}>{FEELING_LABELS[(session as EnduranceSession).feeling]}</Text>
          </View>
        )}
      </View>
    ));
  };

  return (
    <LinearGradient
      colors={[Colors.backgroundTop, Colors.backgroundBottom]}
      style={styles.container}
    >
      <Text style={styles.title}>{name}</Text>

      <View style={styles.tagRow}>
        {muscleList.map((muscle, i) => (
          <View key={i} style={styles.tag}>
            <Text style={styles.tagText}>{muscle}</Text>
          </View>
        ))}
      </View>

      <View style={styles.tabRow}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'howto' && styles.tabActive]}
          onPress={() => setActiveTab('howto')}
        >
          <Text style={[styles.tabText, activeTab === 'howto' && styles.tabTextActive]}>How To</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'notes' && styles.tabActive]}
          onPress={() => setActiveTab('notes')}
        >
          <Text style={[styles.tabText, activeTab === 'notes' && styles.tabTextActive]}>Notes</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        {activeTab === 'howto' && (
          <View>
            <Text style={styles.description}>{description}</Text>
            <View style={styles.stepsCard}>
              {stepList.map((step, i) => (
                <View key={i} style={styles.stepRow}>
                  <View style={styles.stepNumber}>
                    <Text style={styles.stepNumberText}>{i + 1}</Text>
                  </View>
                  <Text style={styles.stepText}>{step}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {activeTab === 'notes' && (
          <View>
            {!user ? (
              <View style={styles.sessionCard}>
                <Text style={styles.sectionLabel}>SESSION LOG</Text>
                <Text style={styles.emptyText}>Sign in to save and track your progress.</Text>
                <TouchableOpacity
                  style={styles.addButton}
                  onPress={() => router.push('/login' as any)}
                >
                  <Text style={styles.addButtonText}>Sign In</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.sessionCard}>
                <Text style={styles.sectionLabel}>LOG SESSION</Text>

                {category === 'strength' && (
                  <View style={styles.inputRow}>
                    {renderInput('Weight (kg)', weight, setWeight, 'numeric')}
                    {renderInput('Sets', sets, setSets, 'numeric')}
                    {renderInput('Reps', reps, setReps, 'numeric')}
                  </View>
                )}

                {category === 'footwork' && (
                  <View>
                    <View style={styles.inputRow}>
                      {renderInput('Sets', fwSets, setFwSets, 'numeric')}
                      {renderInput('Duration (min)', fwDuration, setFwDuration, 'numeric')}
                    </View>
                    {renderFeeling()}
                  </View>
                )}

                {category === 'endurance' && (
                  <View>
                    <View style={styles.inputRow}>
                      {renderInput('Duration (min)', duration, setDuration, 'numeric')}
                      {renderInput('Distance (km)', distance, setDistance, 'numeric')}
                    </View>
                    {renderFeeling()}
                  </View>
                )}

                <TouchableOpacity style={styles.addButton} onPress={saveSession}>
                  <Text style={styles.addButtonText}>+ Save Session</Text>
                </TouchableOpacity>
              </View>
            )}

            <View style={styles.sessionCard}>
              <Text style={styles.sectionLabel}>SESSION HISTORY</Text>
              {renderSessionHistory()}
            </View>

            <View style={styles.sessionCard}>
              <Text style={styles.sectionLabel}>GENERAL NOTES</Text>
              <TextInput
                style={styles.notesInput}
                placeholder="Add any extra things to remember..."
                placeholderTextColor={Colors.textSecondary}
                value={generalNote}
                onChangeText={saveNote}
                multiline
                numberOfLines={4}
              />
            </View>
          </View>
        )}
      </ScrollView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 24,
    paddingTop: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: Colors.textPrimary,
    marginBottom: 12,
  },
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 20,
  },
  tag: {
    backgroundColor: Colors.accentMuted,
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  tagText: {
    color: Colors.accent,
    fontSize: 11,
    fontWeight: '600',
  },
  tabRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 20,
  },
  tab: {
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: Colors.backgroundCard,
  },
  tabActive: {
    backgroundColor: Colors.accent,
  },
  tabText: {
    color: Colors.textSecondary,
    fontWeight: '600',
    fontSize: 14,
  },
  tabTextActive: {
    color: '#FFFFFF',
  },
  content: {
    paddingBottom: 40,
  },
  description: {
    fontSize: 14,
    color: Colors.textSecondary,
    lineHeight: 22,
    marginBottom: 20,
  },
  stepsCard: {
    backgroundColor: Colors.backgroundCard,
    borderRadius: 12,
    padding: 16,
    gap: 14,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  stepNumber: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepNumberText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 13,
  },
  stepText: {
    flex: 1,
    color: Colors.textPrimary,
    fontSize: 14,
    lineHeight: 22,
  },
  sessionCard: {
    backgroundColor: Colors.backgroundCard,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  sectionLabel: {
    color: Colors.accent,
    fontWeight: 'bold',
    fontSize: 12,
    letterSpacing: 1,
    marginBottom: 14,
  },
  inputRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  input: {
    flex: 1,
    backgroundColor: Colors.accentMuted,
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    color: Colors.textPrimary,
    fontSize: 14,
    textAlign: 'center',
  },
  fieldLabel: {
    color: Colors.textSecondary,
    fontSize: 13,
    marginBottom: 8,
  },
  feelingRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  feelingBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: Colors.accentMuted,
    alignItems: 'center',
  },
  feelingBtnActive: {
    backgroundColor: Colors.accent,
  },
  feelingText: {
    color: Colors.textSecondary,
    fontSize: 12,
  },
  feelingTextActive: {
    color: '#FFFFFF',
    fontWeight: 'bold',
  },
  addButton: {
    backgroundColor: Colors.accent,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 4,
  },
  addButtonText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 14,
  },
  historyRow: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    paddingVertical: 10,
  },
  historyDate: {
    color: Colors.textSecondary,
    fontSize: 12,
    marginBottom: 6,
  },
  historyFields: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  historyField: {
    color: Colors.textPrimary,
    fontSize: 13,
    backgroundColor: Colors.accentMuted,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  emptyText: {
    color: Colors.textSecondary,
    fontSize: 13,
    fontStyle: 'italic',
    marginBottom: 12,
  },
  notesInput: {
    color: Colors.textPrimary,
    fontSize: 13,
    lineHeight: 22,
    minHeight: 80,
    textAlignVertical: 'top',
  },
});