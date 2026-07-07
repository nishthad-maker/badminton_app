import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Alert, Image, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { useState, useEffect, useRef } from 'react';
import { LinearGradient } from 'expo-linear-gradient';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useVideoPlayer, VideoView } from 'expo-video';
import { Audio } from 'expo-av';
import { supabase } from '../lib/supabase';
import { Colors } from '@/constants/theme';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';

type VoiceNote = {
  id: string;
  cloudinary_url: string;
  duration_seconds: number;
  created_at: string;
};

const FEELING_LABELS = ['😞 Bad', '😐 OK', '😄 Great'];
const CLOUDINARY_CLOUD = 'pyqqwrax';
const CLOUDINARY_PRESET = 'hustler_videos';

const showAlert = (title: string, message: string) => {
  if (typeof window !== 'undefined') window.alert(`${title}\n\n${message}`);
  else Alert.alert(title, message);
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
  if (logType === 'plank') return level === 'intermediate' ? '3 sets • 45 sec each' : '2 sets • 20 sec each';
  if (logType === 'reps-sets') return level === 'intermediate' ? '3 sets • 12 reps' : '2 sets • 8 reps';
  if (logType === 'footwork') return level === 'intermediate' ? '3 sets' : '2 sets';
  if (logType === 'skipping') return level === 'intermediate' ? '5 sets • 50 reps • 45 sec' : '3 sets • 25 reps • 20 sec';
  if (logType === 'sets-duration') return level === 'intermediate' ? '3 sets • 20 min' : '2 sets • 15 min';
  if (logType === 'duration-distance') return level === 'intermediate' ? '25 min' : '15 min';
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

  const [activeTab, setActiveTab] = useState<'howto' | 'notes' | 'timer'>('howto');
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

  // Timer state
  const [timerRunning, setTimerRunning] = useState(false);
  const [timerSeconds, setTimerSeconds] = useState(0);
  const [countdownInput, setCountdownInput] = useState('');
  const [isCountdown, setIsCountdown] = useState(false);
  const [timerSoundPlaying, setTimerSoundPlaying] = useState(false);
  const timerRef = useRef<any>(null);
  const timerSoundRef = useRef<Audio.Sound | null>(null);

  // Voice notes state
  const [notesSubTab, setNotesSubTab] = useState<'text' | 'voice'>('text');
  const [voiceNotes, setVoiceNotes] = useState<VoiceNote[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [playbackProgress, setPlaybackProgress] = useState(0);
  const recordingRef = useRef<Audio.Recording | null>(null);
  const recordingTimerRef = useRef<any>(null);
  const soundRef = useRef<Audio.Sound | null>(null);
  const playbackIntervalRef = useRef<any>(null);

  const noteKey = `note_${name}`;

  useEffect(() => {
    loadData();
    return () => {
      clearInterval(timerRef.current);
      clearInterval(recordingTimerRef.current);
      clearInterval(playbackIntervalRef.current);
      if (soundRef.current) soundRef.current.unloadAsync();
      stopTimerSound();
    };
  }, []);

  // ── Timer sound ──

  const stopTimerSound = async () => {
    if (timerSoundRef.current) {
      try {
        await timerSoundRef.current.stopAsync();
        await timerSoundRef.current.unloadAsync();
      } catch (e) {}
      timerSoundRef.current = null;
    }
    setTimerSoundPlaying(false);
  };

  const playTimerSound = async () => {
    try {
      await stopTimerSound();
      await Audio.setAudioModeAsync({ playsInSilentModeIOS: true });
      const { sound } = await Audio.Sound.createAsync(
        require('../../assets/sounds/timer-end.mp3'),
        { shouldPlay: true, isLooping: true }
      );
      timerSoundRef.current = sound;
      setTimerSoundPlaying(true);
    } catch (e) {
      // Sound file missing or error — fail silently
      console.log('Timer sound error:', e);
    }
  };

  // ── Timer ──

  const startTimer = () => {
    if (timerRunning) return;
    setTimerRunning(true);
    if (isCountdown && countdownInput) {
      const target = parseInt(countdownInput);
      if (timerSeconds === 0) setTimerSeconds(target);
      timerRef.current = setInterval(() => {
        setTimerSeconds(prev => {
          if (prev <= 1) {
            clearInterval(timerRef.current);
            setTimerRunning(false);
            playTimerSound();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } else {
      timerRef.current = setInterval(() => {
        setTimerSeconds(prev => prev + 1);
      }, 1000);
    }
  };

  const pauseTimer = () => {
    clearInterval(timerRef.current);
    setTimerRunning(false);
  };

  const resetTimer = () => {
    clearInterval(timerRef.current);
    setTimerRunning(false);
    stopTimerSound();
    setTimerSeconds(isCountdown && countdownInput ? parseInt(countdownInput) : 0);
  };

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60).toString().padStart(2, '0');
    const s = (secs % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  // ── Voice Notes ──

  const startRecording = async () => {
    try {
      const permission = await Audio.requestPermissionsAsync();
      if (!permission.granted) {
        showAlert('Permission needed', 'Please allow microphone access to record voice notes.');
        return;
      }
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      const { recording } = await Audio.Recording.createAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      recordingRef.current = recording;
      setIsRecording(true);
      setRecordingDuration(0);
      recordingTimerRef.current = setInterval(() => {
        setRecordingDuration(prev => prev + 1);
      }, 1000);
    } catch (err) {
      showAlert('Error', 'Could not start recording. Please try again.');
    }
  };

  const stopRecording = async () => {
    if (!recordingRef.current) return;
    clearInterval(recordingTimerRef.current);
    setIsRecording(false);
    try {
      await recordingRef.current.stopAndUnloadAsync();
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false });
      const uri = recordingRef.current.getURI();
      recordingRef.current = null;
      if (!uri) { showAlert('Error', 'Recording failed — no audio captured.'); return; }
      const finalDuration = recordingDuration;
      setRecordingDuration(0);
      await uploadVoiceNote(uri, finalDuration);
    } catch (err) {
      showAlert('Error', 'Could not save recording.');
    }
  };

  const cancelRecording = async () => {
    if (!recordingRef.current) return;
    clearInterval(recordingTimerRef.current);
    setIsRecording(false);
    setRecordingDuration(0);
    try {
      await recordingRef.current.stopAndUnloadAsync();
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false });
      recordingRef.current = null;
    } catch (err) {}
  };

  const uploadVoiceNote = async (uri: string, durationSecs: number) => {
    if (!user) return;
    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', { uri, type: 'audio/m4a', name: 'voice_note.m4a' } as any);
      formData.append('upload_preset', CLOUDINARY_PRESET);
      formData.append('resource_type', 'video');
      formData.append('folder', 'hustler_voice_notes');
      const response = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD}/video/upload`, { method: 'POST', body: formData });
      const data = await response.json();
      if (!data.secure_url) throw new Error('Upload failed');
      const { data: inserted, error } = await supabase
        .from('voice_notes')
        .insert({ user_id: user.id, exercise_name: name as string, cloudinary_url: data.secure_url, duration_seconds: durationSecs })
        .select();
      if (error) throw error;
      if (inserted && inserted[0]) {
        const updated = [inserted[0] as VoiceNote, ...voiceNotes];
        if (updated.length > 10) {
          const toDelete = updated.slice(10);
          for (const old of toDelete) await supabase.from('voice_notes').delete().eq('id', old.id);
          setVoiceNotes(updated.slice(0, 10));
        } else {
          setVoiceNotes(updated);
        }
      }
      showAlert('Saved!', 'Voice note recorded successfully.');
    } catch (err) {
      showAlert('Upload failed', 'Could not upload voice note. Please try again.');
    } finally {
      setIsUploading(false);
    }
  };

  const playVoiceNote = async (note: VoiceNote) => {
    try {
      if (soundRef.current) {
        await soundRef.current.stopAsync();
        await soundRef.current.unloadAsync();
        clearInterval(playbackIntervalRef.current);
        soundRef.current = null;
      }
      if (playingId === note.id) { setPlayingId(null); setPlaybackProgress(0); return; }
      const { sound } = await Audio.Sound.createAsync({ uri: note.cloudinary_url }, { shouldPlay: true });
      soundRef.current = sound;
      setPlayingId(note.id);
      setPlaybackProgress(0);
      playbackIntervalRef.current = setInterval(async () => {
        if (soundRef.current) {
          const status = await soundRef.current.getStatusAsync();
          if (status.isLoaded) {
            if (status.didJustFinish) {
              clearInterval(playbackIntervalRef.current);
              setPlayingId(null);
              setPlaybackProgress(0);
              await soundRef.current.unloadAsync();
              soundRef.current = null;
            } else if (status.durationMillis) {
              setPlaybackProgress(status.positionMillis / status.durationMillis);
            }
          }
        }
      }, 200);
      sound.setOnPlaybackStatusUpdate((status) => {
        if (status.isLoaded && status.didJustFinish) {
          clearInterval(playbackIntervalRef.current);
          setPlayingId(null);
          setPlaybackProgress(0);
          sound.unloadAsync();
          soundRef.current = null;
        }
      });
    } catch (err) {
      showAlert('Error', 'Could not play voice note.');
    }
  };

  const deleteVoiceNote = (note: VoiceNote) => {
    showConfirm('Delete Voice Note', 'Are you sure you want to delete this recording?', async () => {
      if (playingId === note.id && soundRef.current) {
        await soundRef.current.stopAsync();
        await soundRef.current.unloadAsync();
        clearInterval(playbackIntervalRef.current);
        soundRef.current = null;
        setPlayingId(null);
        setPlaybackProgress(0);
      }
      await supabase.from('voice_notes').delete().eq('id', note.id);
      setVoiceNotes(voiceNotes.filter(v => v.id !== note.id));
    });
  };

  const formatVoiceDate = (dateStr: string) =>
    new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

  // ── Data loading ──

  const loadData = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const currentUser = session?.user ?? null;
      setUser(currentUser);
      if (currentUser) {
        const { data: profileData } = await supabase.from('profiles').select('skill_level, age').eq('id', currentUser.id).single();
        if (profileData) setProfile(profileData);
        const { data } = await supabase.from('session_logs').select('*').eq('user_id', currentUser.id).eq('exercise_name', name as string).order('created_at', { ascending: false });
        if (data) { setSessions(data.map((row: any) => row.log_data)); setSessionIds(data.map((row: any) => row.id)); }
        const { data: vnData } = await supabase.from('voice_notes').select('*').eq('user_id', currentUser.id).eq('exercise_name', name as string).order('created_at', { ascending: false }).limit(10);
        if (vnData) setVoiceNotes(vnData as VoiceNote[]);
        if (logType === 'strength') {
          const { data: settings } = await supabase.from('exercise_settings').select('starting_weight').eq('user_id', currentUser.id).eq('exercise_name', name as string).single();
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
    } catch (e) {}
  };

  const buildWeightRecommendation = (sw: number, sessionData: any[], skillLevel: string) => {
    const level = skillLevel?.toLowerCase() ?? 'beginner';
    if (sessionData.length === 0) {
      if (level === 'advanced') { setRecommendation("Log your first session and we'll track your progress! 💪"); return; }
      setRecommendation(level === 'intermediate' ? `Start with ${sw}kg • 3 sets • 10 reps` : `Start with ${sw}kg • 3 sets • 8 reps`);
      return;
    }
    const last3 = sessionData.slice(0, 3);
    const lastSession = last3[0] as any;
    const lastWeight = parseFloat(lastSession.weight) || sw;
    const lastSets = parseInt(lastSession.sets) || 3;
    const lastReps = parseInt(lastSession.reps) || 8;
    if (last3.length >= 3) {
      const weights = last3.map((s: any) => parseFloat(s.weight) || 0);
      const isConsistent = weights[0] >= weights[1] && weights[1] >= weights[2];
      const allSame = last3.every((s: any) => parseFloat(s.weight) === lastWeight);
      if (allSame && isConsistent) { setRecommendation(`💪 Ready to progress! Try ${lastWeight + 2.5}kg • ${lastSets} sets • ${lastReps} reps`); return; }
      if (!isConsistent) { setRecommendation(`Let's rebuild consistency: ${lastWeight}kg • ${lastSets} sets • ${lastReps} reps`); return; }
    }
    setRecommendation(`Keep going! ${lastWeight}kg • ${lastSets} sets • ${lastReps} reps`);
  };

  const buildNonWeightRecommendation = (lt: string, sessionData: any[], skillLevel: string, baseRec: string) => {
    const level = skillLevel?.toLowerCase() ?? 'beginner';
    if (sessionData.length === 0) {
      if (level === 'advanced') { setRecommendation("Log your first session and we'll track your progress! 💪"); return; }
      setRecommendation(`🎯 Target: ${baseRec}`); return;
    }
    if (sessionData.length < 3) {
      if (baseRec) { setRecommendation(`🎯 Target: ${baseRec}`); } else {
        const last = sessionData[0] as any;
        if (lt === 'plank') setRecommendation(`Keep going! ${last.sets} sets • ${last.time} sec each`);
        else if (lt === 'reps-sets') setRecommendation(`Keep going! ${last.sets} sets • ${last.reps} reps`);
        else if (lt === 'footwork' || lt === 'sets-duration') setRecommendation(`Keep going! ${last.sets} sets`);
        else if (lt === 'skipping') setRecommendation(`Keep going! ${last.sets} sets • ${last.reps} reps`);
        else if (lt === 'duration-distance') setRecommendation(`Keep going! ${last.duration} min`);
      }
      return;
    }
    const last3 = sessionData.slice(0, 3);
    const getMetric = (s: any) => {
      if (lt === 'plank') return parseInt(s.time) || 0;
      if (lt === 'reps-sets' || lt === 'skipping') return parseInt(s.reps) || 0;
      if (lt === 'footwork' || lt === 'sets-duration') return parseInt(s.sets) || 0;
      if (lt === 'duration-distance') return parseInt(s.duration) || 0;
      return 0;
    };
    const metrics = last3.map(getMetric);
    const isConsistent = metrics[0] >= metrics[1] && metrics[1] >= metrics[2];
    const last = sessionData[0] as any;
    if (!isConsistent) {
      if (lt === 'plank') setRecommendation(`Let's rebuild consistency: ${last.sets} sets • ${last.time} sec each`);
      else if (lt === 'reps-sets') setRecommendation(`Let's rebuild consistency: ${last.sets} sets • ${last.reps} reps`);
      else if (lt === 'footwork' || lt === 'sets-duration') setRecommendation(`Let's rebuild consistency: ${last.sets} sets`);
      else if (lt === 'skipping') setRecommendation(`Let's rebuild consistency: ${last.sets} sets • ${last.reps} reps`);
      else if (lt === 'duration-distance') setRecommendation(`Let's rebuild consistency: ${last.duration} min`);
      return;
    }
    if (lt === 'plank') setRecommendation(`💪 Progress! Try ${last.sets} sets • ${parseInt(last.time) + 10} sec each`);
    else if (lt === 'reps-sets') setRecommendation(`💪 Progress! Try ${last.sets} sets • ${parseInt(last.reps) + 2} reps`);
    else if (lt === 'footwork') setRecommendation(`💪 Progress! Try ${parseInt(last.sets) + 1} sets`);
    else if (lt === 'skipping') setRecommendation(`💪 Progress! Try ${parseInt(last.sets) + 1} sets • ${parseInt(last.reps) + 10} reps`);
    else if (lt === 'sets-duration') setRecommendation(`💪 Progress! Try ${parseInt(last.sets) + 1} sets`);
    else if (lt === 'duration-distance') setRecommendation(`💪 Progress! Try ${parseInt(last.duration) + 5} min`);
  };

  const saveStartingWeight = async () => {
    if (!startingWeightInput || !user) return;
    const w = parseFloat(startingWeightInput);
    await supabase.from('exercise_settings').upsert({ user_id: user.id, exercise_name: name as string, starting_weight: w });
    setStartingWeight(w);
    setShowWeightPrompt(false);
    buildWeightRecommendation(w, sessions, profile?.skill_level);
  };

  const saveSession = async () => {
    const date = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    let newSession: any;
    if (category === 'strength') {
      if (logType === 'plank') newSession = { date, sets, time: reps };
      else if (logType === 'reps-sets') newSession = { date, sets, reps };
      else newSession = { date, weight, sets, reps };
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
    const hasAnyValue = Object.entries(newSession).some(([key, v]) => key !== 'date' && v !== '' && v !== undefined && v !== -1);
    if (!hasAnyValue) { showAlert('Nothing to save', 'Please log at least one value before saving.'); return; }
    if (user) {
      const { data: inserted } = await supabase.from('session_logs').insert({ user_id: user.id, exercise_name: name as string, category: category as string, log_data: newSession }).select();
      const updatedSessions = [newSession, ...sessions];
      const updatedIds = inserted && inserted[0] ? [inserted[0].id, ...sessionIds] : sessionIds;
      setSessions(updatedSessions);
      setSessionIds(updatedIds);
      if (logType === 'strength' && startingWeight) buildWeightRecommendation(startingWeight, updatedSessions, profile?.skill_level);
      else if (logType !== 'recovery' && logType) { const rec = getSkillRecommendation(logType as string, profile?.skill_level); buildNonWeightRecommendation(logType as string, updatedSessions, profile?.skill_level, rec ?? ''); }
    } else {
      showAlert('Not signed in', 'Sign in to save your progress across devices.');
    }
  };

  const deleteSession = async (index: number) => {
    showConfirm('Delete Session', 'Are you sure you want to delete this session?', async () => {
      const idToDelete = sessionIds[index];
      if (idToDelete) await supabase.from('session_logs').delete().eq('id', idToDelete);
      const updatedSessions = sessions.filter((_, i) => i !== index);
      const updatedIds = sessionIds.filter((_, i) => i !== index);
      setSessions(updatedSessions);
      setSessionIds(updatedIds);
      if (logType === 'strength' && startingWeight) buildWeightRecommendation(startingWeight, updatedSessions, profile?.skill_level);
      else if (logType !== 'recovery' && logType) { const rec = getSkillRecommendation(logType as string, profile?.skill_level); buildNonWeightRecommendation(logType as string, updatedSessions, profile?.skill_level, rec ?? ''); }
    });
  };

  const saveNote = async (text: string) => { setGeneralNote(text); await AsyncStorage.setItem(noteKey, text); };

  const renderInput = (placeholder: string, value: string, setValue: (v: string) => void, keyboardType: any = 'default') => (
    <TextInput
      style={styles.input}
      placeholder={placeholder}
      placeholderTextColor={Colors.textSecondary}
      value={value}
      onChangeText={(text) => setValue(keyboardType === 'numeric' ? text.replace(/[^0-9.]/g, '') : text)}
      keyboardType={keyboardType}
    />
  );

  const renderFeeling = () => (
    <View>
      <Text style={styles.fieldLabel}>Feeling</Text>
      <View style={styles.feelingRow}>
        {FEELING_LABELS.map((label, i) => (
          <TouchableOpacity key={i} style={[styles.feelingBtn, feeling === i && styles.feelingBtnActive]} onPress={() => setFeeling(i)}>
            <Text style={[styles.feelingText, feeling === i && styles.feelingTextActive]}>{label}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );

  const renderSessionHistory = () => {
    if (sessions.length === 0) return <Text style={styles.emptyText}>No sessions logged yet.</Text>;
    return sessions.map((session: any, i) => (
      <View key={i} style={styles.historyRow}>
        <View style={styles.historyTop}>
          <Text style={styles.historyDate}>{session.date}</Text>
          <TouchableOpacity onPress={() => deleteSession(i)}>
            <MaterialCommunityIcons name="trash-can-outline" size={18} color="#FF6B6B" />
          </TouchableOpacity>
        </View>
        <View style={styles.historyFields}>
          {category === 'strength' && logType === 'plank' && (
            <>{session.sets ? <Text style={styles.historyField}>🔁 {session.sets} sets</Text> : null}{session.time ? <Text style={styles.historyField}>⏱ {session.time} sec</Text> : null}</>
          )}
          {category === 'strength' && logType === 'reps-sets' && (
            <>{session.sets ? <Text style={styles.historyField}>🔁 {session.sets} sets</Text> : null}{session.reps ? <Text style={styles.historyField}>💪 {session.reps} reps</Text> : null}</>
          )}
          {category === 'strength' && logType !== 'plank' && logType !== 'reps-sets' && (
            <>{session.weight ? <Text style={styles.historyField}>⚖️ {session.weight}kg</Text> : null}{session.sets ? <Text style={styles.historyField}>🔁 {session.sets} sets</Text> : null}{session.reps ? <Text style={styles.historyField}>💪 {session.reps} reps</Text> : null}</>
          )}
          {category === 'footwork' && (
            <>{session.sets ? <Text style={styles.historyField}>🔁 {session.sets} sets</Text> : null}{session.duration ? <Text style={styles.historyField}>⏱ {session.duration} min</Text> : null}</>
          )}
          {category === 'endurance' && logType === 'skipping' && (
            <>{session.sets ? <Text style={styles.historyField}>🔁 {session.sets} sets</Text> : null}{session.reps ? <Text style={styles.historyField}>💪 {session.reps} reps</Text> : null}{session.time ? <Text style={styles.historyField}>⏱ {session.time} sec</Text> : null}</>
          )}
          {category === 'endurance' && logType === 'sets-duration' && (
            <>{session.sets ? <Text style={styles.historyField}>🔁 {session.sets} sets</Text> : null}{session.duration ? <Text style={styles.historyField}>⏱ {session.duration} min</Text> : null}</>
          )}
          {category === 'endurance' && logType === 'duration-distance' && (
            <>{session.duration ? <Text style={styles.historyField}>⏱ {session.duration} min</Text> : null}{session.distance ? <Text style={styles.historyField}>📍 {session.distance}km</Text> : null}</>
          )}
          {category === 'recovery' && (
            <>{session.duration ? <Text style={styles.historyField}>⏱ {session.duration} min</Text> : null}{session.feeling >= 0 ? <Text style={styles.historyField}>{FEELING_LABELS[session.feeling]}</Text> : null}</>
          )}
        </View>
      </View>
    ));
  };

  const renderMedia = () => {
    if (hasVideo) return <VideoView player={player} style={styles.video} contentFit="contain" />;
    if (imageUrl && imageUrl !== '') {
      const localImage = getLocalImage(imageUrl as string);
      if (localImage) return <Image source={localImage} style={styles.image} resizeMode="cover" />;
    }
    return null;
  };

  const renderVoiceNotesSection = () => {
    if (!user) return (
      <View style={styles.voiceEmptyState}>
        <MaterialCommunityIcons name="microphone-off" size={32} color={Colors.textSecondary} />
        <Text style={styles.emptyText}>Sign in to record voice notes.</Text>
      </View>
    );
    return (
      <View>
        {isUploading ? (
          <View style={styles.recordingCard}>
            <ActivityIndicator size="large" color={Colors.accent} />
            <Text style={styles.uploadingText}>Saving voice note...</Text>
          </View>
        ) : isRecording ? (
          <View style={styles.recordingCard}>
            <View style={styles.recordingPulse}>
              <MaterialCommunityIcons name="microphone" size={28} color="#FFFFFF" />
            </View>
            <Text style={styles.recordingTime}>{formatTime(recordingDuration)}</Text>
            <Text style={styles.recordingLabel}>Recording...</Text>
            <View style={styles.recordingActions}>
              <TouchableOpacity style={styles.cancelRecordBtn} onPress={cancelRecording}>
                <MaterialCommunityIcons name="close" size={20} color="#FF6B6B" />
                <Text style={styles.cancelRecordText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.stopRecordBtn} onPress={stopRecording}>
                <MaterialCommunityIcons name="stop" size={20} color="#FFFFFF" />
                <Text style={styles.stopRecordText}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <TouchableOpacity style={styles.startRecordBtn} onPress={startRecording}>
            <MaterialCommunityIcons name="microphone" size={22} color="#FFFFFF" />
            <Text style={styles.startRecordText}>Record Voice Note</Text>
          </TouchableOpacity>
        )}
        {voiceNotes.length === 0 ? (
          <Text style={[styles.emptyText, { marginTop: 16 }]}>No voice notes yet. Tap the button above to record one.</Text>
        ) : (
          <View style={{ marginTop: 16 }}>
            {voiceNotes.map((note) => (
              <View key={note.id} style={styles.voiceNoteRow}>
                <TouchableOpacity style={styles.playBtn} onPress={() => playVoiceNote(note)}>
                  <MaterialCommunityIcons name={playingId === note.id ? 'pause' : 'play'} size={20} color="#FFFFFF" />
                </TouchableOpacity>
                <View style={styles.voiceNoteInfo}>
                  <Text style={styles.voiceNoteDate}>{formatVoiceDate(note.created_at)}</Text>
                  {playingId === note.id ? (
                    <View style={styles.progressBarBg}>
                      <View style={[styles.progressBarFill, { width: `${playbackProgress * 100}%` }]} />
                    </View>
                  ) : (
                    <Text style={styles.voiceNoteDuration}>{formatTime(note.duration_seconds)}</Text>
                  )}
                </View>
                <TouchableOpacity onPress={() => deleteVoiceNote(note)}>
                  <MaterialCommunityIcons name="trash-can-outline" size={18} color="#FF6B6B" />
                </TouchableOpacity>
              </View>
            ))}
            <Text style={styles.voiceNoteCount}>{voiceNotes.length}/10 voice notes</Text>
          </View>
        )}
      </View>
    );
  };

  return (
    <LinearGradient colors={[Colors.backgroundTop, Colors.backgroundBottom]} style={styles.container}>
      <TouchableOpacity style={styles.backBtn} onPress={() => {
        if (typeof window !== 'undefined') window.history.back();
        else router.back();
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
        {(['howto', 'notes', 'timer'] as const).map(tab => (
          <TouchableOpacity key={tab} style={[styles.tab, activeTab === tab && styles.tabActive]} onPress={() => setActiveTab(tab)}>
            <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>
              {tab === 'howto' ? 'How To' : tab === 'notes' ? 'Notes' : 'Timer'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">

        {/* HOW TO TAB */}
        {activeTab === 'howto' && (
          <View>
            {renderMedia()}
            <Text style={styles.description}>{description}</Text>
            <View style={styles.stepsCard}>
              {stepList.map((step, i) => (
                <View key={i} style={styles.stepRow}>
                  <View style={styles.stepNumber}><Text style={styles.stepNumberText}>{i + 1}</Text></View>
                  <Text style={styles.stepText}>{step}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* NOTES TAB */}
        {activeTab === 'notes' && (
          <View>
            {user && showWeightPrompt && logType === 'strength' && (
              <View style={styles.weightPromptCard}>
                <Text style={styles.weightPromptTitle}>🏋️ {startingWeight ? 'Update' : 'Set'} Your Starting Weight</Text>
                <Text style={styles.weightPromptDesc}>Enter the weight you can comfortably lift. We'll use this to build personalized recommendations.</Text>
                <View style={styles.weightPromptRow}>
                  <TextInput style={styles.weightPromptInput} placeholder="e.g. 20" placeholderTextColor={Colors.textSecondary} value={startingWeightInput} onChangeText={(t) => setStartingWeightInput(t.replace(/[^0-9.]/g, ''))} keyboardType="numeric" />
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
                  <TouchableOpacity onPress={() => { if (typeof window !== 'undefined') window.location.href = '/onboarding'; else router.push('/onboarding' as any); }}>
                    <Text style={styles.onboardingHint}>Complete your profile for personalized recommendations →</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}
            {!user ? (
              <View style={styles.sessionCard}>
                <Text style={styles.sectionLabel}>SESSION LOG</Text>
                <Text style={styles.emptyText}>Sign in to save and track your progress.</Text>
                <TouchableOpacity style={styles.addButton} onPress={() => router.push('/login' as any)}>
                  <Text style={styles.addButtonText}>Sign In</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.sessionCard}>
                <Text style={styles.sectionLabel}>LOG SESSION</Text>
                {category === 'strength' && logType !== 'plank' && logType !== 'reps-sets' && (
                  <View><View style={styles.inputRow}>{renderInput('Weight (kg)', weight, setWeight, 'numeric')}{renderInput('Sets', sets, setSets, 'numeric')}</View><View style={styles.inputRow}>{renderInput('Reps', reps, setReps, 'numeric')}</View></View>
                )}
                {category === 'strength' && logType === 'plank' && (
                  <View style={styles.inputRow}>{renderInput('Sets', sets, setSets, 'numeric')}{renderInput('Time (sec)', reps, setReps, 'numeric')}</View>
                )}
                {category === 'strength' && logType === 'reps-sets' && (
                  <View style={styles.inputRow}>{renderInput('Sets', sets, setSets, 'numeric')}{renderInput('Reps', reps, setReps, 'numeric')}</View>
                )}
                {category === 'footwork' && (
                  <View style={styles.inputRow}>{renderInput('Sets', fwSets, setFwSets, 'numeric')}{renderInput('Duration', fwDuration, setFwDuration, 'numeric')}</View>
                )}
                {category === 'endurance' && logType === 'skipping' && (
                  <View><View style={styles.inputRow}>{renderInput('Sets', fwSets, setFwSets, 'numeric')}{renderInput('Reps', reps, setReps, 'numeric')}</View><View style={styles.inputRow}>{renderInput('Time (sec)', duration, setDuration, 'numeric')}</View></View>
                )}
                {category === 'endurance' && logType === 'sets-duration' && (
                  <View style={styles.inputRow}>{renderInput('Sets', fwSets, setFwSets, 'numeric')}{renderInput('Duration', fwDuration, setFwDuration, 'numeric')}</View>
                )}
                {category === 'endurance' && logType === 'duration-distance' && (
                  <View style={styles.inputRow}>{renderInput('Duration', duration, setDuration, 'numeric')}{renderInput('Distance', distance, setDistance, 'numeric')}</View>
                )}
                {category === 'recovery' && (
                  <View><View style={styles.inputRow}>{renderInput('Duration (min)', recoveryDuration, setRecoveryDuration, 'numeric')}</View>{renderFeeling()}</View>
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
              <View style={styles.subTabRow}>
                <TouchableOpacity style={[styles.subTab, notesSubTab === 'text' && styles.subTabActive]} onPress={() => setNotesSubTab('text')}>
                  <MaterialCommunityIcons name="pencil-outline" size={14} color={notesSubTab === 'text' ? '#FFFFFF' : Colors.textSecondary} />
                  <Text style={[styles.subTabText, notesSubTab === 'text' && styles.subTabTextActive]}>Text</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.subTab, notesSubTab === 'voice' && styles.subTabActive]} onPress={() => setNotesSubTab('voice')}>
                  <MaterialCommunityIcons name="microphone-outline" size={14} color={notesSubTab === 'voice' ? '#FFFFFF' : Colors.textSecondary} />
                  <Text style={[styles.subTabText, notesSubTab === 'voice' && styles.subTabTextActive]}>Voice</Text>
                </TouchableOpacity>
              </View>
              {notesSubTab === 'text' ? (
                <View style={styles.notesContainer}>
                  <TextInput style={styles.notesInput} placeholder="Add any extra things to remember..." placeholderTextColor={Colors.textSecondary} value={generalNote} onChangeText={saveNote} multiline numberOfLines={4} />
                </View>
              ) : renderVoiceNotesSection()}
            </View>
          </View>
        )}

        {/* TIMER TAB */}
        {activeTab === 'timer' && (
          <View style={styles.timerCard}>
            <Text style={styles.timerDisplay}>{formatTime(timerSeconds)}</Text>

            <View style={styles.timerBtnRow}>
              <TouchableOpacity style={[styles.timerBtn, timerRunning && styles.timerBtnPause]} onPress={timerRunning ? pauseTimer : startTimer}>
                <MaterialCommunityIcons name={timerRunning ? 'pause' : 'play'} size={20} color="#FFFFFF" />
                <Text style={styles.timerBtnText}>{timerRunning ? 'Pause' : 'Start'}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.timerResetBtn} onPress={resetTimer}>
                <MaterialCommunityIcons name="refresh" size={20} color={Colors.textSecondary} />
                <Text style={styles.timerResetText}>Reset</Text>
              </TouchableOpacity>
            </View>

            {/* Stop sound button — only shows when timer sound is playing */}
            {timerSoundPlaying && (
              <TouchableOpacity style={styles.stopSoundBtn} onPress={stopTimerSound}>
                <MaterialCommunityIcons name="volume-off" size={18} color="#fff" />
                <Text style={styles.stopSoundText}>Stop Sound</Text>
              </TouchableOpacity>
            )}

            <View style={styles.timerModeRow}>
              <TouchableOpacity style={[styles.modePill, !isCountdown && styles.modePillActive]} onPress={() => { setIsCountdown(false); resetTimer(); }}>
                <Text style={[styles.modePillText, !isCountdown && styles.modePillTextActive]}>Stopwatch</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modePill, isCountdown && styles.modePillActive]} onPress={() => { setIsCountdown(true); resetTimer(); }}>
                <Text style={[styles.modePillText, isCountdown && styles.modePillTextActive]}>Countdown</Text>
              </TouchableOpacity>
            </View>

            {isCountdown && (
              <View style={styles.countdownInputRow}>
                <TextInput
                  style={styles.countdownInput}
                  placeholder="Set seconds (e.g. 45)"
                  placeholderTextColor={Colors.textSecondary}
                  value={countdownInput}
                  onChangeText={(t) => { setCountdownInput(t.replace(/[^0-9]/g, '')); if (!timerRunning) setTimerSeconds(parseInt(t) || 0); }}
                  keyboardType="numeric"
                />
                <Text style={styles.countdownLabel}>sec</Text>
              </View>
            )}
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
  tab: { paddingHorizontal: 20, paddingVertical: 10, borderRadius: 20, backgroundColor: Colors.backgroundCard },
  tabActive: { backgroundColor: Colors.accent },
  tabText: { color: Colors.textSecondary, fontWeight: '600', fontSize: 13 },
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
  weightPromptCard: { backgroundColor: Colors.backgroundCard, borderRadius: 12, padding: 16, marginBottom: 16, borderLeftWidth: 3, borderLeftColor: Colors.accent },
  weightPromptTitle: { fontSize: 15, fontWeight: 'bold', color: Colors.textPrimary, marginBottom: 6 },
  weightPromptDesc: { fontSize: 12, color: Colors.textSecondary, lineHeight: 18, marginBottom: 12 },
  weightPromptRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  weightPromptInput: { flex: 1, backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 8, padding: 10, color: Colors.textPrimary, fontSize: 16, textAlign: 'center', borderWidth: 1, borderColor: Colors.accent },
  weightPromptKg: { fontSize: 14, color: Colors.textPrimary, fontWeight: '600' },
  weightPromptBtn: { backgroundColor: Colors.accent, borderRadius: 8, paddingVertical: 10, paddingHorizontal: 16 },
  weightPromptBtnText: { color: '#FFFFFF', fontWeight: 'bold', fontSize: 14 },
  recommendationCard: { backgroundColor: '#1a3a2a', borderRadius: 12, padding: 14, marginBottom: 16, borderLeftWidth: 3, borderLeftColor: Colors.accent },
  recommendationHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  recommendationLabel: { fontSize: 10, fontWeight: 'bold', color: Colors.accent, letterSpacing: 1 },
  editLink: { fontSize: 11, color: Colors.accent, fontWeight: '600', textDecorationLine: 'underline' },
  recommendationText: { fontSize: 16, fontWeight: 'bold', color: '#FFFFFF' },
  onboardingHint: { fontSize: 11, color: Colors.accent, marginTop: 8, fontWeight: '600' },
  timerCard: { backgroundColor: Colors.backgroundCard, borderRadius: 16, padding: 32, alignItems: 'center', justifyContent: 'center', minHeight: 320, marginBottom: 16 },
  timerDisplay: { fontSize: 72, fontWeight: 'bold', color: Colors.textPrimary, marginVertical: 24, letterSpacing: 4 },
  timerBtnRow: { flexDirection: 'row', gap: 12, marginBottom: 16 },
  timerBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: Colors.accent, borderRadius: 28, paddingHorizontal: 28, paddingVertical: 14 },
  timerBtnPause: { backgroundColor: '#E67E22' },
  timerBtnText: { color: '#FFFFFF', fontWeight: 'bold', fontSize: 16 },
  timerResetBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: Colors.backgroundTop, borderRadius: 28, paddingHorizontal: 24, paddingVertical: 14, borderWidth: 1, borderColor: Colors.border },
  timerResetText: { color: Colors.textSecondary, fontWeight: '600', fontSize: 16 },
  stopSoundBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#E74C3C', borderRadius: 20, paddingHorizontal: 20, paddingVertical: 10, marginBottom: 16 },
  stopSoundText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  timerModeRow: { flexDirection: 'row', gap: 8, marginBottom: 20 },
  modePill: { paddingHorizontal: 20, paddingVertical: 8, borderRadius: 20, backgroundColor: Colors.backgroundTop, borderWidth: 1, borderColor: Colors.border },
  modePillActive: { backgroundColor: Colors.accent, borderColor: Colors.accent },
  modePillText: { fontSize: 13, color: Colors.textSecondary, fontWeight: '600' },
  modePillTextActive: { color: '#FFFFFF' },
  countdownInputRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  countdownInput: { backgroundColor: Colors.backgroundTop, borderRadius: 10, padding: 12, color: Colors.textPrimary, fontSize: 16, borderWidth: 1, borderColor: Colors.border, width: 180, textAlign: 'center' },
  countdownLabel: { fontSize: 14, color: Colors.textSecondary, fontWeight: '600' },
  sessionCard: { backgroundColor: Colors.backgroundCard, borderRadius: 12, padding: 16, marginBottom: 16 },
  sectionLabel: { color: Colors.accent, fontWeight: 'bold', fontSize: 12, letterSpacing: 1, marginBottom: 14 },
  inputRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  input: { flex: 1, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 8, paddingVertical: 10, paddingHorizontal: 12, color: Colors.textPrimary, fontSize: 12, textAlign: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)' },
  fieldLabel: { color: Colors.textSecondary, fontSize: 13, marginBottom: 8 },
  feelingRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  feelingBtn: { flex: 1, paddingVertical: 8, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.08)', alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  feelingBtnActive: { backgroundColor: Colors.accent, borderColor: Colors.accent },
  feelingText: { color: Colors.textSecondary, fontSize: 12 },
  feelingTextActive: { color: '#FFFFFF', fontWeight: 'bold' },
  addButton: { backgroundColor: Colors.accent, borderRadius: 10, paddingVertical: 12, alignItems: 'center', marginTop: 4 },
  addButtonText: { color: '#FFFFFF', fontWeight: 'bold', fontSize: 14 },
  historyRow: { borderBottomWidth: 1, borderBottomColor: Colors.border, paddingVertical: 10 },
  historyTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  historyDate: { color: Colors.textSecondary, fontSize: 12 },
  historyFields: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  historyField: { color: Colors.textPrimary, fontSize: 13, backgroundColor: 'rgba(255,255,255,0.08)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  emptyText: { color: Colors.textSecondary, fontSize: 13, fontStyle: 'italic', marginBottom: 12 },
  notesContainer: { backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 8, padding: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  notesInput: { color: Colors.textPrimary, fontSize: 13, lineHeight: 22, minHeight: 80, textAlignVertical: 'top' },
  subTabRow: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  subTab: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.08)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  subTabActive: { backgroundColor: Colors.accent, borderColor: Colors.accent },
  subTabText: { fontSize: 12, fontWeight: '600', color: Colors.textSecondary },
  subTabTextActive: { color: '#FFFFFF' },
  voiceEmptyState: { alignItems: 'center', paddingVertical: 24, gap: 8 },
  recordingCard: { alignItems: 'center', paddingVertical: 24, gap: 12 },
  recordingPulse: { width: 64, height: 64, borderRadius: 32, backgroundColor: '#E74C3C', alignItems: 'center', justifyContent: 'center' },
  recordingTime: { fontSize: 32, fontWeight: 'bold', color: Colors.textPrimary, letterSpacing: 2 },
  recordingLabel: { fontSize: 13, color: '#E74C3C', fontWeight: '600' },
  recordingActions: { flexDirection: 'row', gap: 16, marginTop: 8 },
  cancelRecordBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 20, backgroundColor: 'rgba(255,107,107,0.15)', borderWidth: 1, borderColor: 'rgba(255,107,107,0.3)' },
  cancelRecordText: { color: '#FF6B6B', fontWeight: '600', fontSize: 13 },
  stopRecordBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 20, backgroundColor: Colors.accent },
  stopRecordText: { color: '#FFFFFF', fontWeight: '600', fontSize: 13 },
  uploadingText: { color: Colors.textSecondary, fontSize: 13, marginTop: 8 },
  startRecordBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: Colors.accent, borderRadius: 12, paddingVertical: 14 },
  startRecordText: { color: '#FFFFFF', fontWeight: 'bold', fontSize: 14 },
  voiceNoteRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Colors.border },
  playBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.accent, alignItems: 'center', justifyContent: 'center' },
  voiceNoteInfo: { flex: 1, gap: 4 },
  voiceNoteDate: { color: Colors.textSecondary, fontSize: 11 },
  voiceNoteDuration: { color: Colors.textPrimary, fontSize: 13, fontWeight: '600' },
  progressBarBg: { height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.15)', overflow: 'hidden' },
  progressBarFill: { height: '100%', borderRadius: 2, backgroundColor: Colors.accent },
  voiceNoteCount: { color: Colors.textSecondary, fontSize: 11, textAlign: 'right', marginTop: 8 },
});