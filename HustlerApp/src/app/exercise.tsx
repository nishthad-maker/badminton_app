import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Alert, Image } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { useState, useEffect } from 'react';
import { LinearGradient } from 'expo-linear-gradient';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useVideoPlayer, VideoView } from 'expo-video';
import { supabase } from '../lib/supabase';
import { Colors } from '@/constants/theme';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';

type StrengthSession = { date: string; weight: string; sets: string; reps: string; };
type FootworkSession = { date: string; sets: string; duration: string; };
type EnduranceSession = { date: string; duration: string; distance: string; };
type SetsDurationSession = { date: string; sets: string; duration: string; };
type SkippingSession = { date: string; sets: string; reps: string; time: string; };
type RecoverySession = { date: string; duration: string; feeling: number; };
type Session = StrengthSession | FootworkSession | EnduranceSession | SetsDurationSession | SkippingSession | RecoverySession;

const FEELING_LABELS = ['😞 Bad', '😐 OK', '😄 Great'];

const showAlert = (title: string, message: string) => {
  if (typeof window !== 'undefined') {
    window.alert(`${title}\n\n${message}`);
  } else {
    Alert.alert(title, message);
  }
};

const showConfirm = (title: string, message: string, onConfirm: () => void) => {
  if (typeof window !== 'undefined') {
    if (window.confirm(`${title}\n\n${message}`)) onConfirm();
  } else {
    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: onConfirm },
    ]);
  }
};

const getLocalImage = (key: string) => {
  switch (key) {
    case 'local': return require('../../assets/images/plank.jpg');
    case 'icebath': return require('../../assets/images/icebath.png');
    case 'foam': return require('../../assets/images/foam.png');
    case 'upperstretch': return require('../../assets/images/upperstretch.png');
    case 'lowerstretch': return require('../../assets/images/lowerstretch.png');
    case 'breath': return require('../../assets/images/breath.png');
    default: return null;
  }
};

const getSkillRecommendation = (logType: string, skillLevel: string) => {
  const level = skillLevel?.toLowerCase() ?? 'beginner';

  if (level === 'advanced') return null;

  if (logType === 'plank') {
    if (level === 'intermediate') return '3 sets • 45 sec each';
    return '2 sets • 20 sec each';
  }
  if (logType === 'reps-sets') {
    if (level === 'intermediate') return '3 sets • 12 reps';
    return '2 sets • 8 reps';
  }
  if (logType === 'footwork') {
    if (level === 'intermediate') return '3 sets';
    return '2 sets';
  }
  if (logType === 'skipping') {
    if (level === 'intermediate') return '5 sets • 50 reps • 45 sec';
    return '3 sets • 25 reps • 20 sec';
  }
  if (logType === 'sets-duration') {
    if (level === 'intermediate') return '3 sets • 20 min';
    return '2 sets • 15 min';
  }
  if (logType === 'duration-distance') {
    if (level === 'intermediate') return '25 min';
    return '15 min';
  }
  return null;
};

export default function ExerciseScreen() {
  const { name, description, steps, muscles, category, videoUrl, imageUrl, logType } = useLocalSearchParams();
  const stepList: string[] = JSON.parse(steps as string || '[]');
  const muscleList: string[] = JSON.parse(muscles as string || '[]');

  const hasVideo = !!(videoUrl && videoUrl !== '');

  const player = useVideoPlayer(hasVideo ? (videoUrl as string) : null, (p) => {
    p.loop = true;
    p.muted = true;
    p.play();
  });

  const [activeTab, setActiveTab] = useState<'howto' | 'notes'>('howto');
  const [sessions, setSessions] = useState<any[]>([]);
  const [sessionIds, setSessionIds] = useState<string[]>([]);
  const [generalNote, setGeneralNote] = useState('');
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [startingWeight, setStartingWeight] = useState<number | null>(null);
  const [startingWeightInput, setStartingWeightInput] = useState('');
  const [showWeightPrompt, setShowWeightPrompt] = useState(false);
  const [recommendation, setRecommendation] = useState('');

  const [weight, setWeight] = useState('');
  const [sets, setSets] = useState('');
  const [reps, setReps] = useState('');
  const [fwSets, setFwSets] = useState('');
  const [fwDuration, setFwDuration] = useState('');
  const [duration, setDuration] = useState('');
  const [distance, setDistance] = useState('');
  const [recoveryDuration, setRecoveryDuration] = useState('');
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
        const { data: profileData } = await supabase
          .from('profiles')
          .select('skill_level, age')
          .eq('id', currentUser.id)
          .single();
        if (profileData) setProfile(profileData);

        const { data } = await supabase
          .from('session_logs')
          .select('*')
          .eq('user_id', currentUser.id)
          .eq('exercise_name', name as string)
          .order('created_at', { ascending: false });

        if (data) {
          setSessions(data.map((row: any) => row.log_data));
          setSessionIds(data.map((row: any) => row.id));
        }

        if (logType === 'strength') {
          const { data: settings } = await supabase
            .from('exercise_settings')
            .select('starting_weight')
            .eq('user_id', currentUser.id)
            .eq('exercise_name', name as string)
            .single();

          if (settings?.starting_weight) {
            setStartingWeight(settings.starting_weight);
            setStartingWeightInput(String(settings.starting_weight));
            buildWeightRecommendation(settings.starting_weight, data ?? [], profileData?.skill_level);
          } else {
            setShowWeightPrompt(true);
          }
        } else if (logType !== 'recovery') {
          const rec = getSkillRecommendation(logType as string, profileData?.skill_level);
          buildNonWeightRecommendation(logType as string, data ?? [], profileData?.skill_level, rec ?? '');
        }
      }

      const note = await AsyncStorage.getItem(noteKey);
      if (note) setGeneralNote(note);
    } catch (e) {
      console.log('Load error', e);
    }
  };

  const buildWeightRecommendation = (sw: number, sessionData: any[], skillLevel: string) => {
    const level = skillLevel?.toLowerCase() ?? 'beginner';

    if (sessionData.length === 0) {
      if (level === 'advanced') {
        setRecommendation("Log your first session and we'll track your progress! 💪");
        return;
      }
      if (level === 'intermediate') {
        setRecommendation(`Start with ${sw}kg • 3 sets • 10 reps`);
      } else {
        setRecommendation(`Start with ${sw}kg • 3 sets • 8 reps`);
      }
      return;
    }

    const last3 = sessionData.slice(0, 3);
    const lastSession = last3[0] as any;
    const lastWeight = parseFloat(lastSession.weight) || sw;
    const lastSets = parseInt(lastSession.sets) || 3;
    const lastReps = parseInt(lastSession.reps) || 8;

    if (last3.length >= 3) {
      const weights = last3.map((s: any) => parseFloat(s.weight) || 0);
      // weights[0] is most recent, weights[2] is oldest of the 3
      const isConsistentOrIncreasing = weights[0] >= weights[1] && weights[1] >= weights[2];
      const allSameWeight = last3.every((s: any) => parseFloat(s.weight) === lastWeight);

      if (allSameWeight && isConsistentOrIncreasing) {
        const newWeight = lastWeight + 2.5;
        setRecommendation(`💪 Ready to progress! Try ${newWeight}kg • ${lastSets} sets • ${lastReps} reps`);
        return;
      }
      if (!isConsistentOrIncreasing) {
        setRecommendation(`Let's rebuild consistency: ${lastWeight}kg • ${lastSets} sets • ${lastReps} reps`);
        return;
      }
    }
    setRecommendation(`Keep going! ${lastWeight}kg • ${lastSets} sets • ${lastReps} reps`);
  };

  const buildNonWeightRecommendation = (lt: string, sessionData: any[], skillLevel: string, baseRec: string) => {
    const level = skillLevel?.toLowerCase() ?? 'beginner';

    if (sessionData.length === 0) {
      if (level === 'advanced') {
        setRecommendation("Log your first session and we'll track your progress! 💪");
        return;
      }
      setRecommendation(`🎯 Target: ${baseRec}`);
      return;
    }

    if (sessionData.length < 3) {
      if (baseRec) {
        setRecommendation(`🎯 Target: ${baseRec}`);
      } else {
        const last = sessionData[0] as any;
        if (lt === 'plank') {
          setRecommendation(`Keep going! ${last.sets} sets • ${last.time} sec each`);
        } else if (lt === 'reps-sets') {
          setRecommendation(`Keep going! ${last.sets} sets • ${last.reps} reps`);
        } else if (lt === 'footwork' || lt === 'sets-duration') {
          setRecommendation(`Keep going! ${last.sets} sets`);
        } else if (lt === 'skipping') {
          setRecommendation(`Keep going! ${last.sets} sets • ${last.reps} reps`);
        } else if (lt === 'duration-distance') {
          setRecommendation(`Keep going! ${last.duration} min`);
        }
      }
      return;
    }

    // Check consistency over last 3 sessions
    const last3 = sessionData.slice(0, 3);
    const getMetric = (s: any) => {
      if (lt === 'plank') return parseInt(s.time) || 0;
      if (lt === 'reps-sets' || lt === 'skipping') return parseInt(s.reps) || 0;
      if (lt === 'footwork' || lt === 'sets-duration') return parseInt(s.sets) || 0;
      if (lt === 'duration-distance') return parseInt(s.duration) || 0;
      return 0;
    };
    const metrics = last3.map(getMetric);
    const isConsistentOrIncreasing = metrics[0] >= metrics[1] && metrics[1] >= metrics[2];

    if (!isConsistentOrIncreasing) {
      const last = sessionData[0] as any;
      if (lt === 'plank') {
        setRecommendation(`Let's rebuild consistency: ${last.sets} sets • ${last.time} sec each`);
      } else if (lt === 'reps-sets') {
        setRecommendation(`Let's rebuild consistency: ${last.sets} sets • ${last.reps} reps`);
      } else if (lt === 'footwork' || lt === 'sets-duration') {
        setRecommendation(`Let's rebuild consistency: ${last.sets} sets`);
      } else if (lt === 'skipping') {
        setRecommendation(`Let's rebuild consistency: ${last.sets} sets • ${last.reps} reps`);
      } else if (lt === 'duration-distance') {
        setRecommendation(`Let's rebuild consistency: ${last.duration} min`);
      }
      return;
    }

    // Progress!
    if (lt === 'plank') {
      const last = sessionData[0] as any;
      const lastTime = parseInt(last.time) || 20;
      setRecommendation(`💪 Progress! Try ${last.sets} sets • ${lastTime + 10} sec each`);
    } else if (lt === 'reps-sets') {
      const last = sessionData[0] as any;
      const lastReps = parseInt(last.reps) || 8;
      setRecommendation(`💪 Progress! Try ${last.sets} sets • ${lastReps + 2} reps`);
    } else if (lt === 'footwork') {
      const last = sessionData[0] as any;
      const lastSets = parseInt(last.sets) || 2;
      setRecommendation(`💪 Progress! Try ${lastSets + 1} sets`);
    } else if (lt === 'skipping') {
      const last = sessionData[0] as any;
      const lastSets = parseInt(last.sets) || 3;
      const lastReps = parseInt(last.reps) || 25;
      setRecommendation(`💪 Progress! Try ${lastSets + 1} sets • ${lastReps + 10} reps`);
    } else if (lt === 'sets-duration') {
      const last = sessionData[0] as any;
      const lastSets = parseInt(last.sets) || 2;
      setRecommendation(`💪 Progress! Try ${lastSets + 1} sets`);
    } else if (lt === 'duration-distance') {
      const last = sessionData[0] as any;
      const lastDuration = parseInt(last.duration) || 15;
      setRecommendation(`💪 Progress! Try ${lastDuration + 5} min`);
    }
  };

  const saveStartingWeight = async () => {
    if (!startingWeightInput || !user) return;
    const w = parseFloat(startingWeightInput);
    await supabase.from('exercise_settings').upsert({
      user_id: user.id,
      exercise_name: name as string,
      starting_weight: w,
    });
    setStartingWeight(w);
    setShowWeightPrompt(false);
    buildWeightRecommendation(w, sessions, profile?.skill_level);
  };

  const saveSession = async () => {
  const date = new Date().toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric'
  });

  let newSession: any;

  if (category === 'strength') {
    if (logType === 'plank') {
      newSession = { date, sets, time: reps };
    } else if (logType === 'reps-sets') {
      newSession = { date, sets, reps };
    } else {
      newSession = { date, weight, sets, reps };
    }
    setWeight(''); setSets(''); setReps('');
  } else if (category === 'footwork') {
    newSession = { date, sets: fwSets, duration: fwDuration };
    setFwSets(''); setFwDuration('');
  } else if (category === 'recovery') {
    newSession = { date, duration: recoveryDuration, feeling };
    setRecoveryDuration(''); setFeeling(-1);
  } else if (logType === 'skipping') {
    newSession = { date, sets: fwSets, reps, time: duration };
    setFwSets(''); setReps(''); setDuration('');
  } else if (logType === 'sets-duration') {
    newSession = { date, sets: fwSets, duration: fwDuration };
    setFwSets(''); setFwDuration('');
  } else {
    newSession = { date, duration, distance };
    setDuration(''); setDistance('');
  }

  const hasAnyValue = Object.entries(newSession).some(([key, v]) =>
    key !== 'date' && v !== '' && v !== undefined && v !== -1
  );
  if (!hasAnyValue) {
    showAlert('Nothing to save', 'Please log at least one value before saving.');
    return;
  }

  if (user) {
    const { data: inserted } = await supabase.from('session_logs').insert({
      user_id: user.id,
      exercise_name: name as string,
      category: category as string,
      log_data: newSession,
    }).select();

    const updatedSessions = [newSession, ...sessions];
    const updatedIds = inserted && inserted[0] ? [inserted[0].id, ...sessionIds] : sessionIds;
    setSessions(updatedSessions);
    setSessionIds(updatedIds);

    if (logType === 'strength' && startingWeight) {
      buildWeightRecommendation(startingWeight, updatedSessions, profile?.skill_level);
    } else if (logType !== 'recovery' && logType) {
      const rec = getSkillRecommendation(logType as string, profile?.skill_level);
      buildNonWeightRecommendation(logType as string, updatedSessions, profile?.skill_level, rec ?? '');
    }
  } else {
    showAlert('Not signed in', 'Sign in to save your progress across devices.');
  }
};

  const deleteSession = async (index: number) => {
    showConfirm('Delete Session', 'Are you sure you want to delete this session?', async () => {
      const idToDelete = sessionIds[index];
      if (idToDelete) {
        await supabase.from('session_logs').delete().eq('id', idToDelete);
      }
      const updatedSessions = sessions.filter((_, i) => i !== index);
      const updatedIds = sessionIds.filter((_, i) => i !== index);
      setSessions(updatedSessions);
      setSessionIds(updatedIds);

      if (logType === 'strength' && startingWeight) {
        buildWeightRecommendation(startingWeight, updatedSessions, profile?.skill_level);
      } else if (logType !== 'recovery' && logType) {
        const rec = getSkillRecommendation(logType as string, profile?.skill_level);
        buildNonWeightRecommendation(logType as string, updatedSessions, profile?.skill_level, rec ?? '');
      }
    });
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
    return sessions.map((session: any, i) => (
      <View key={i} style={styles.historyRow}>
        <View style={styles.historyTop}>
          <Text style={styles.historyDate}>{session.date}</Text>
          <TouchableOpacity onPress={() => deleteSession(i)}>
            <MaterialCommunityIcons name="trash-can-outline" size={18} color="#FF6B6B" />
          </TouchableOpacity>
        </View>

        {category === 'strength' && (
          <View style={styles.historyFields}>
            {logType === 'plank' ? (
              <>
                {session.sets ? <Text style={styles.historyField}>🔁 {session.sets} sets</Text> : null}
                {session.time ? <Text style={styles.historyField}>⏱ {session.time} sec</Text> : null}
              </>
            ) : logType === 'reps-sets' ? (
              <>
                {session.sets ? <Text style={styles.historyField}>🔁 {session.sets} sets</Text> : null}
                {session.reps ? <Text style={styles.historyField}>💪 {session.reps} reps</Text> : null}
              </>
            ) : (
              <>
                {session.weight ? <Text style={styles.historyField}>⚖️ {session.weight}kg</Text> : null}
                {session.sets ? <Text style={styles.historyField}>🔁 {session.sets} sets</Text> : null}
                {session.reps ? <Text style={styles.historyField}>💪 {session.reps} reps</Text> : null}
              </>
            )}
          </View>
        )}

        {category === 'footwork' && (
          <View style={styles.historyFields}>
            {session.sets ? <Text style={styles.historyField}>🔁 {session.sets} sets</Text> : null}
            {session.duration ? <Text style={styles.historyField}>⏱ {session.duration} min</Text> : null}
          </View>
        )}

        {category === 'endurance' && logType === 'skipping' && (
          <View style={styles.historyFields}>
            {session.sets ? <Text style={styles.historyField}>🔁 {session.sets} sets</Text> : null}
            {session.reps ? <Text style={styles.historyField}>💪 {session.reps} reps</Text> : null}
            {session.time ? <Text style={styles.historyField}>⏱ {session.time} sec</Text> : null}
          </View>
        )}

        {category === 'endurance' && logType === 'sets-duration' && (
          <View style={styles.historyFields}>
            {session.sets ? <Text style={styles.historyField}>🔁 {session.sets} sets</Text> : null}
            {session.duration ? <Text style={styles.historyField}>⏱ {session.duration} min</Text> : null}
          </View>
        )}

        {category === 'endurance' && logType === 'duration-distance' && (
          <View style={styles.historyFields}>
            {session.duration ? <Text style={styles.historyField}>⏱ {session.duration} min</Text> : null}
            {session.distance ? <Text style={styles.historyField}>📍 {session.distance}km</Text> : null}
          </View>
        )}

        {category === 'recovery' && (
          <View style={styles.historyFields}>
            {session.duration ? <Text style={styles.historyField}>⏱ {session.duration} min</Text> : null}
            {session.feeling >= 0 ? <Text style={styles.historyField}>{FEELING_LABELS[session.feeling]}</Text> : null}
          </View>
        )}
      </View>
    ));
  };

  const renderMedia = () => {
    if (hasVideo) {
      return (
        <VideoView
          player={player}
          style={styles.video}
          contentFit="contain"
        />
      );
    }
    if (imageUrl && imageUrl !== '') {
      const localImage = getLocalImage(imageUrl as string);
      if (localImage) {
        return <Image source={localImage} style={styles.image} resizeMode="cover" />;
      }
    }
    return null;
  };

  return (
    <LinearGradient
      colors={[Colors.backgroundTop, Colors.backgroundBottom]}
      style={styles.container}
    >
      <TouchableOpacity style={styles.backBtn} onPress={() => {
        if (typeof window !== 'undefined') {
          window.history.back();
        } else {
          router.back();
        }
      }}>
        <MaterialCommunityIcons name="arrow-left" size={24} color={Colors.accent} />
      </TouchableOpacity>

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
            {renderMedia()}
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
            {user && showWeightPrompt && logType === 'strength' && (
              <View style={styles.weightPromptCard}>
                <Text style={styles.weightPromptTitle}>🏋️ {startingWeight ? 'Update' : 'Set'} Your Starting Weight</Text>
                <Text style={styles.weightPromptDesc}>
                  Enter the weight you can comfortably lift for this exercise. We'll use this to build your personalized recommendations.
                </Text>
                <View style={styles.weightPromptRow}>
                  <TextInput
                    style={styles.weightPromptInput}
                    placeholder="e.g. 20"
                    placeholderTextColor={Colors.textSecondary}
                    value={startingWeightInput}
                    onChangeText={(t) => setStartingWeightInput(t.replace(/[^0-9.]/g, ''))}
                    keyboardType="numeric"
                  />
                  <Text style={styles.weightPromptKg}>kg</Text>
                  <TouchableOpacity style={styles.weightPromptBtn} onPress={saveStartingWeight}>
                    <Text style={styles.weightPromptBtnText}>Save</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {user && recommendation !== '' && category !== 'recovery' && (
              <View style={styles.recommendationCard}>
                <View style={styles.recommendationHeader}>
                  <Text style={styles.recommendationLabel}>💡 TODAY'S TARGET</Text>
                  {logType === 'strength' && startingWeight && !showWeightPrompt && (
                    <TouchableOpacity onPress={() => setShowWeightPrompt(true)}>
                      <Text style={styles.editLink}>Edit weight</Text>
                    </TouchableOpacity>
                  )}
                </View>
                <Text style={styles.recommendationText}>{recommendation}</Text>
                {!profile?.age && (
                  <TouchableOpacity onPress={() => {
                    if (typeof window !== 'undefined') {
                      window.location.href = '/onboarding';
                    } else {
                      router.push('/onboarding' as any);
                    }
                  }}>
                    <Text style={styles.onboardingHint}>
                      Complete your profile for personalized recommendations →
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            )}

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

                {category === 'strength' && logType !== 'plank' && logType !== 'reps-sets' && (
                  <View>
                    <View style={styles.inputRow}>
                      {renderInput('Weight (kg)', weight, setWeight, 'numeric')}
                      {renderInput('Sets', sets, setSets, 'numeric')}
                    </View>
                    <View style={styles.inputRow}>
                      {renderInput('Reps', reps, setReps, 'numeric')}
                    </View>
                  </View>
                )}

                {category === 'strength' && logType === 'plank' && (
                  <View style={styles.inputRow}>
                    {renderInput('Sets', sets, setSets, 'numeric')}
                    {renderInput('Time (sec)', reps, setReps, 'numeric')}
                  </View>
                )}

                {category === 'strength' && logType === 'reps-sets' && (
                  <View style={styles.inputRow}>
                    {renderInput('Sets', sets, setSets, 'numeric')}
                    {renderInput('Reps', reps, setReps, 'numeric')}
                  </View>
                )}

                {category === 'footwork' && (
                  <View style={styles.inputRow}>
                    {renderInput('Sets', fwSets, setFwSets, 'numeric')}
                    {renderInput('Duration', fwDuration, setFwDuration, 'numeric')}
                  </View>
                )}

                {category === 'endurance' && logType === 'skipping' && (
                  <View>
                    <View style={styles.inputRow}>
                      {renderInput('Sets', fwSets, setFwSets, 'numeric')}
                      {renderInput('Reps', reps, setReps, 'numeric')}
                    </View>
                    <View style={styles.inputRow}>
                      {renderInput('Time (sec)', duration, setDuration, 'numeric')}
                    </View>
                  </View>
                )}

                {category === 'endurance' && logType === 'sets-duration' && (
                  <View style={styles.inputRow}>
                    {renderInput('Sets', fwSets, setFwSets, 'numeric')}
                    {renderInput('Duration', fwDuration, setFwDuration, 'numeric')}
                  </View>
                )}

                {category === 'endurance' && logType === 'duration-distance' && (
                  <View style={styles.inputRow}>
                    {renderInput('Duration', duration, setDuration, 'numeric')}
                    {renderInput('Distance', distance, setDistance, 'numeric')}
                  </View>
                )}

                {category === 'recovery' && (
                  <View>
                    <View style={styles.inputRow}>
                      {renderInput('Duration (min)', recoveryDuration, setRecoveryDuration, 'numeric')}
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
              <View style={styles.notesContainer}>
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
          </View>
        )}
      </ScrollView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, paddingTop: 16 },
  backBtn: { marginBottom: 8, alignSelf: 'flex-start' },
  title: { fontSize: 24, fontWeight: 'bold', color: Colors.textPrimary, marginBottom: 12 },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 20 },
  tag: { backgroundColor: Colors.accentMuted, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 },
  tagText: { color: Colors.accent, fontSize: 11, fontWeight: '600' },
  tabRow: { flexDirection: 'row', gap: 10, marginBottom: 20 },
  tab: { paddingHorizontal: 24, paddingVertical: 10, borderRadius: 20, backgroundColor: Colors.backgroundCard },
  tabActive: { backgroundColor: Colors.accent },
  tabText: { color: Colors.textSecondary, fontWeight: '600', fontSize: 14 },
  tabTextActive: { color: '#FFFFFF' },
  content: { paddingBottom: 40 },
  video: { width: '100%', height: 300, borderRadius: 12, marginBottom: 16, backgroundColor: Colors.backgroundCard },
  image: { width: '100%', height: 320, borderRadius: 12, marginBottom: 16 },
  description: { fontSize: 14, color: Colors.textSecondary, lineHeight: 22, marginBottom: 20 },
  stepsCard: { backgroundColor: Colors.backgroundCard, borderRadius: 12, padding: 16, gap: 14 },
  stepRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  stepNumber: { width: 28, height: 28, borderRadius: 14, backgroundColor: Colors.accent, alignItems: 'center', justifyContent: 'center' },
  stepNumberText: { color: '#FFFFFF', fontWeight: 'bold', fontSize: 13 },
  stepText: { flex: 1, color: Colors.textPrimary, fontSize: 14, lineHeight: 22 },
  weightPromptCard: {
    backgroundColor: Colors.backgroundCard,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderLeftWidth: 3,
    borderLeftColor: Colors.accent,
  },
  weightPromptTitle: { fontSize: 15, fontWeight: 'bold', color: Colors.textPrimary, marginBottom: 6 },
  weightPromptDesc: { fontSize: 12, color: Colors.textSecondary, lineHeight: 18, marginBottom: 12 },
  weightPromptRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  weightPromptInput: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 8,
    padding: 10,
    color: Colors.textPrimary,
    fontSize: 16,
    textAlign: 'center',
    borderWidth: 1,
    borderColor: Colors.accent,
  },
  weightPromptKg: { fontSize: 14, color: Colors.textPrimary, fontWeight: '600' },
  weightPromptBtn: {
    backgroundColor: Colors.accent,
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  weightPromptBtnText: { color: '#FFFFFF', fontWeight: 'bold', fontSize: 14 },
  recommendationCard: {
    backgroundColor: '#1a3a2a',
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
    borderLeftWidth: 3,
    borderLeftColor: Colors.accent,
  },
  recommendationHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  recommendationLabel: { fontSize: 10, fontWeight: 'bold', color: Colors.accent, letterSpacing: 1 },
  editLink: { fontSize: 11, color: Colors.accent, fontWeight: '600', textDecorationLine: 'underline' },
  recommendationText: { fontSize: 16, fontWeight: 'bold', color: '#FFFFFF' },
  onboardingHint: {
    fontSize: 11,
    color: Colors.accent,
    marginTop: 8,
    fontWeight: '600',
  },
  sessionCard: { backgroundColor: Colors.backgroundCard, borderRadius: 12, padding: 16, marginBottom: 16 },
  sectionLabel: { color: Colors.accent, fontWeight: 'bold', fontSize: 12, letterSpacing: 1, marginBottom: 14 },
  inputRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  input: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    color: Colors.textPrimary,
    fontSize: 12,
    textAlign: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  fieldLabel: { color: Colors.textSecondary, fontSize: 13, marginBottom: 8 },
  feelingRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  feelingBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  feelingBtnActive: { backgroundColor: Colors.accent, borderColor: Colors.accent },
  feelingText: { color: Colors.textSecondary, fontSize: 12 },
  feelingTextActive: { color: '#FFFFFF', fontWeight: 'bold' },
  addButton: { backgroundColor: Colors.accent, borderRadius: 10, paddingVertical: 12, alignItems: 'center', marginTop: 4 },
  addButtonText: { color: '#FFFFFF', fontWeight: 'bold', fontSize: 14 },
  historyRow: { borderBottomWidth: 1, borderBottomColor: Colors.border, paddingVertical: 10 },
  historyTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  historyDate: { color: Colors.textSecondary, fontSize: 12 },
  historyFields: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  historyField: {
    color: Colors.textPrimary,
    fontSize: 13,
    backgroundColor: 'rgba(255,255,255,0.08)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  emptyText: { color: Colors.textSecondary, fontSize: 13, fontStyle: 'italic', marginBottom: 12 },
  notesContainer: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  notesInput: {
    color: Colors.textPrimary,
    fontSize: 13,
    lineHeight: 22,
    minHeight: 80,
    textAlignVertical: 'top',
  },
});