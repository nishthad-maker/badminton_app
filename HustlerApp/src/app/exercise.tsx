import { View, StyleSheet, ScrollView, TouchableOpacity, Pressable, Alert, Image, ActivityIndicator, Platform } from 'react-native';
import { TextInput } from '@/components/TextInput';
import { Text } from '@/components/Text';
import { useLocalSearchParams, router } from 'expo-router';
import { useState, useEffect, useRef } from 'react';
import { useVideoPlayer, VideoView } from 'expo-video';
import { Audio } from 'expo-av';
import { supabase } from '../lib/supabase';
import { notifyWorkoutCompleted } from '../lib/notifications';
import { Theme, CategoryTheme, Fonts } from '@/constants/theme';
import { LOG_TYPE_FIELDS } from '@/constants/logTypes';
import { Icon } from '@/components/icons/Icon';

type VoiceNote = {
  id: string;
  cloudinary_url: string;
  duration_seconds: number;
  created_at: string;
};

const FEELING_LABELS = ['Bad', 'OK', 'Great'];
const LANDING_LABELS = ['Clean', 'Shaky', 'Missed'];
const CLOUDINARY_CLOUD = 'pyqqwrax';
const CLOUDINARY_PRESET = 'hustler_videos';

// Plyometric height progresses far more conservatively than weight/reps —
// jumping higher before landings are consistently clean is how ankles/knees get hurt.
const PLYO_HEIGHT_INCREMENT_IN = 2;
const PLYO_MAX_HEIGHT_IN = 30;
const PLYO_CLEAN_STREAK_FOR_HEIGHT_BUMP = 3;
const PLYO_MIN_DAYS_BETWEEN_HEIGHT_BUMPS = 7;

const daysSince = (isoDate?: string): number | null => {
  if (!isoDate) return null;
  const ms = Date.now() - new Date(isoDate).getTime();
  return Number.isNaN(ms) ? null : ms / (1000 * 60 * 60 * 24);
};

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
    case 'wallsit': return require('../../assets/images/wall-sit.jpg');
    case 'icebath': return require('../../assets/images/icebath.png');
    case 'foam': return require('../../assets/images/foam.png');
    case 'upperstretch': return require('../../assets/images/upperstretch.png');
    case 'lowerstretch': return require('../../assets/images/lowerstretch.png');
    case 'breath': return require('../../assets/images/breath.png');
    default: return null;
  }
};

const getSkillRecommendation = (logType: string, skillLevel: string, exerciseName?: string) => {
  const level = skillLevel?.toLowerCase() ?? 'beginner';
  if (level === 'advanced') return null;
  // HIIT-style cardio machines get real interval dosing (work sets of
  // seconds, not one long "set" measured in minutes) — sourced from
  // standard air-bike HIIT guidance (e.g. 15-45 splits), not the generic
  // sets-duration default below, which never made sense for interval work.
  if (exerciseName === 'Air Bike') return level === 'intermediate' ? '15 sets • 20 sec' : '10 sets • 15 sec';
  if (logType === 'plank') return level === 'intermediate' ? '3 sets • 45 sec each' : '2 sets • 20 sec each';
  if (logType === 'reps-sets') return level === 'intermediate' ? '3 sets • 12 reps' : '2 sets • 8 reps';
  if (logType === 'plyometric') return level === 'intermediate' ? '3 sets • 8 reps @ 12in' : '2 sets • 6 reps @ 8in';
  if (logType === 'footwork') return level === 'intermediate' ? '3 sets' : '2 sets';
  if (logType === 'skipping') return level === 'intermediate' ? '5 sets • 50 reps • 45 sec' : '3 sets • 25 reps • 20 sec';
  // sets-duration's own field config (constants/logTypes.ts) collects duration
  // in seconds, not minutes — this generic fallback previously said "min",
  // mismatched against the field it's recommending a target for.
  if (logType === 'sets-duration') return level === 'intermediate' ? '3 sets • 30 sec' : '2 sets • 20 sec';
  if (logType === 'duration-distance') return level === 'intermediate' ? '25 min' : '15 min';
  return null;
};

export default function ExerciseScreen() {
  const { name, description, steps, muscles, category, videoUrl, imageUrl, logType } = useLocalSearchParams();
  const stepList: string[] = JSON.parse(steps as string || '[]');
  const muscleList: string[] = JSON.parse(muscles as string || '[]');
  const hasVideo = !!(videoUrl && videoUrl !== '');
  const catTheme = CategoryTheme[category as keyof typeof CategoryTheme] ?? { bg: Theme.cardTinted, fg: Theme.eyebrowGreen };

  const player = useVideoPlayer(hasVideo ? (videoUrl as string) : null, (p) => {
    p.loop = true;
    p.muted = true;
    p.play();
  });

  const [activeTab, setActiveTab] = useState<'howto' | 'notes' | 'timer'>('howto');
  const [hoveredTab, setHoveredTab] = useState<string | null>(null);
  const [hoveredFeeling, setHoveredFeeling] = useState<number | null>(null);
  const [hoveredLanding, setHoveredLanding] = useState<number | null>(null);
  const [sessions, setSessions] = useState<any[]>([]);
  const [sessionIds, setSessionIds] = useState<string[]>([]);
  const [sessionCreatedAt, setSessionCreatedAt] = useState<string[]>([]);
  const [generalNote, setGeneralNote] = useState('');
  const [savingNote, setSavingNote] = useState(false);
  const noteTimeout = useRef<any>(null);
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [startingWeight, setStartingWeight] = useState<number | null>(null);
  const [startingWeightInput, setStartingWeightInput] = useState('');
  const [showWeightPrompt, setShowWeightPrompt] = useState(false);
  const [recommendation, setRecommendation] = useState('');
  const [recommendationIcon, setRecommendationIcon] = useState<'target' | 'trending-up' | 'trending-down' | 'restore'>('target');

  const [weight, setWeight] = useState('');
  const [sets, setSets] = useState('');
  const [reps, setReps] = useState('');
  const [height, setHeight] = useState('');
  const [fwSets, setFwSets] = useState('');
  const [fwDuration, setFwDuration] = useState('');
  const [duration, setDuration] = useState('');
  const [distance, setDistance] = useState('');
  const [recoveryDuration, setRecoveryDuration] = useState('');
  const [feeling, setFeeling] = useState(-1);
  const [landingQuality, setLandingQuality] = useState(-1);

  // Timer state
  const [timerRunning, setTimerRunning] = useState(false);
  const [timerSeconds, setTimerSeconds] = useState(0);
  const [countdownMin, setCountdownMin] = useState('');
  const [countdownSec, setCountdownSec] = useState('');
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

  const getCountdownTotal = () => (parseInt(countdownMin) || 0) * 60 + (parseInt(countdownSec) || 0);

  const startTimer = () => {
    if (timerRunning) return;
    if (isCountdown && getCountdownTotal() === 0) return;
    setTimerRunning(true);
    if (isCountdown) {
      const target = getCountdownTotal();
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

  const resetTimer = (countdownOverride?: boolean) => {
    clearInterval(timerRef.current);
    setTimerRunning(false);
    stopTimerSound();
    const cd = countdownOverride !== undefined ? countdownOverride : isCountdown;
    setTimerSeconds(cd ? getCountdownTotal() : 0);
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
      if (Platform.OS === 'web') {
        const resp = await fetch(uri);
        const blob = await resp.blob();
        formData.append('file', blob, 'voice_note.m4a');
      } else {
        formData.append('file', { uri, type: 'audio/m4a', name: 'voice_note.m4a' } as any);
      }
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
        const { data: allNotes } = await supabase
          .from('voice_notes')
          .select('id')
          .eq('user_id', user.id)
          .eq('exercise_name', name as string)
          .order('created_at', { ascending: false });
        const toDelete = (allNotes ?? []).slice(5);
        if (toDelete.length > 0) {
          await supabase.from('voice_notes').delete().in('id', toDelete.map((n: any) => n.id));
        }
        setVoiceNotes([inserted[0] as VoiceNote, ...voiceNotes].slice(0, 5));
      }
      showAlert('Saved!', 'Voice note recorded successfully.');
    } catch (err: any) {
      console.error('Voice note upload failed:', err);
      showAlert('Upload failed', err?.message ? String(err.message) : 'Could not upload voice note. Please try again.');
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

  const clearAllVoiceNotes = () => {
    if (voiceNotes.length === 0 || !user) return;
    showConfirm('Clear all voice notes?', 'This will delete every recording for this exercise.', async () => {
      if (soundRef.current) {
        await soundRef.current.stopAsync();
        await soundRef.current.unloadAsync();
        clearInterval(playbackIntervalRef.current);
        soundRef.current = null;
        setPlayingId(null);
        setPlaybackProgress(0);
      }
      await supabase.from('voice_notes').delete().eq('user_id', user.id).eq('exercise_name', name as string);
      setVoiceNotes([]);
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
        const sessionLogData = (data ?? []).map((row: any) => row.log_data);
        const sessionCreated = (data ?? []).map((row: any) => row.created_at);
        if (data) { setSessions(sessionLogData); setSessionIds(data.map((row: any) => row.id)); setSessionCreatedAt(sessionCreated); }
        const { data: vnData } = await supabase.from('voice_notes').select('*').eq('user_id', currentUser.id).eq('exercise_name', name as string).order('created_at', { ascending: false }).limit(5);
        if (vnData) setVoiceNotes(vnData as VoiceNote[]);
        const { data: noteData } = await supabase.from('exercise_notes').select('note').eq('user_id', currentUser.id).eq('exercise_name', name as string).single();
        if (noteData?.note) setGeneralNote(noteData.note);
        if (logType === 'strength') {
          const { data: settings } = await supabase.from('exercise_settings').select('starting_weight').eq('user_id', currentUser.id).eq('exercise_name', name as string).single();
          if (settings?.starting_weight) {
            setStartingWeight(settings.starting_weight);
            setStartingWeightInput(String(settings.starting_weight));
            buildWeightRecommendation(settings.starting_weight, sessionLogData, profileData?.skill_level);
          } else {
            setShowWeightPrompt(true);
          }
        } else if (logType === 'plyometric') {
          buildPlyoRecommendation(sessionLogData, sessionCreated, profileData?.skill_level);
        } else if (logType === 'strength-time') {
          buildStrengthTimeRecommendation(sessionLogData, profileData?.skill_level);
        } else if (logType !== 'recovery') {
          const rec = getSkillRecommendation(logType as string, profileData?.skill_level, name as string);
          buildNonWeightRecommendation(logType as string, sessionLogData, profileData?.skill_level, rec ?? '');
        }
      }
    } catch (e) {}
  };

  const setRec = (text: string, icon: 'target' | 'trending-up' | 'trending-down' | 'restore' = 'target') => {
    setRecommendation(text);
    setRecommendationIcon(icon);
  };

  const buildWeightRecommendation = (sw: number, sessionData: any[], skillLevel: string) => {
    const level = skillLevel?.toLowerCase() ?? 'beginner';
    if (sessionData.length === 0) {
      if (level === 'advanced') { setRec("Log your first session and we'll track your progress!", 'trending-up'); return; }
      setRec(level === 'intermediate' ? `Start with ${sw}kg • 3 sets • 10 reps` : `Start with ${sw}kg • 3 sets • 8 reps`);
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
      if (allSame && isConsistent) { setRec(`Ready to progress! Try ${lastWeight + 2.5}kg • ${lastSets} sets • ${lastReps} reps`, 'trending-up'); return; }
      if (!isConsistent) { setRec(`Let's rebuild consistency: ${lastWeight}kg • ${lastSets} sets • ${lastReps} reps`, 'restore'); return; }
    }
    setRec(`Keep going! ${lastWeight}kg • ${lastSets} sets • ${lastReps} reps`);
  };

  // Battle-ropes-style moves: build up sets and time first — resistance only
  // becomes the lever worth pulling once they're solid at a real working volume.
  const READY_FOR_WEIGHT_SETS = 4;
  const READY_FOR_WEIGHT_TIME = 45;

  const buildStrengthTimeRecommendation = (sessionData: any[], skillLevel: string) => {
    const level = skillLevel?.toLowerCase() ?? 'beginner';
    if (sessionData.length === 0) {
      if (level === 'advanced') { setRec("Log your first session and we'll track your progress!", 'trending-up'); return; }
      setRec(level === 'intermediate' ? 'Start with 3 sets • 30 sec each' : 'Start with 2 sets • 20 sec each');
      return;
    }

    const last = sessionData[0] as any;
    const lastSets = parseInt(last.sets) || 0;
    const lastTime = parseInt(last.time) || 0;
    const lastWeight = parseFloat(last.weight) || 0;

    if (sessionData.length < 3) {
      setRec(`Keep going! ${lastSets} sets • ${lastTime} sec each`);
      return;
    }

    const last3 = sessionData.slice(0, 3);
    const times = last3.map((s: any) => parseInt(s.time) || 0);
    const isConsistent = times[0] >= times[1] && times[1] >= times[2];
    if (!isConsistent) {
      setRec(`Let's rebuild consistency: ${lastSets} sets • ${lastTime} sec each`, 'restore');
      return;
    }

    const readyForWeight = lastSets >= READY_FOR_WEIGHT_SETS && lastTime >= READY_FOR_WEIGHT_TIME;
    if (!readyForWeight) {
      setRec(`Progress! Try ${lastSets} sets • ${lastTime + 10} sec each`, 'trending-up');
      return;
    }
    setRec(`Great control at ${lastSets} sets • ${lastTime} sec — try adding ${lastWeight ? `${lastWeight + 2.5}kg` : 'light resistance'}`, 'trending-up');
  };

  const buildNonWeightRecommendation = (lt: string, sessionData: any[], skillLevel: string, baseRec: string) => {
    const level = skillLevel?.toLowerCase() ?? 'beginner';
    if (sessionData.length === 0) {
      if (level === 'advanced') { setRec("Log your first session and we'll track your progress!", 'trending-up'); return; }
      setRec(`Target: ${baseRec}`); return;
    }
    if (sessionData.length < 3) {
      if (baseRec) { setRec(`Target: ${baseRec}`); } else {
        const last = sessionData[0] as any;
        if (lt === 'plank') setRec(`Keep going! ${last.sets} sets • ${last.time} sec each`);
        else if (lt === 'reps-sets') setRec(`Keep going! ${last.sets} sets • ${last.reps} reps`);
        else if (lt === 'footwork' || lt === 'sets-duration') setRec(`Keep going! ${last.sets} sets`);
        else if (lt === 'skipping') setRec(`Keep going! ${last.sets} sets • ${last.reps} reps`);
        else if (lt === 'duration-distance') setRec(`Keep going! ${last.duration} min`);
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
      if (lt === 'plank') setRec(`Let's rebuild consistency: ${last.sets} sets • ${last.time} sec each`, 'restore');
      else if (lt === 'reps-sets') setRec(`Let's rebuild consistency: ${last.sets} sets • ${last.reps} reps`, 'restore');
      else if (lt === 'footwork' || lt === 'sets-duration') setRec(`Let's rebuild consistency: ${last.sets} sets`, 'restore');
      else if (lt === 'skipping') setRec(`Let's rebuild consistency: ${last.sets} sets • ${last.reps} reps`, 'restore');
      else if (lt === 'duration-distance') setRec(`Let's rebuild consistency: ${last.duration} min`, 'restore');
      return;
    }
    if (lt === 'plank') setRec(`Progress! Try ${last.sets} sets • ${parseInt(last.time) + 10} sec each`, 'trending-up');
    else if (lt === 'reps-sets') setRec(`Progress! Try ${(parseInt(last.sets) || 0) + 1} sets • ${(parseInt(last.reps) || 0) + 2} reps`, 'trending-up');
    else if (lt === 'footwork') setRec(`Progress! Try ${parseInt(last.sets) + 1} sets`, 'trending-up');
    else if (lt === 'skipping') setRec(`Progress! Try ${parseInt(last.sets) + 1} sets • ${parseInt(last.reps) + 10} reps`, 'trending-up');
    else if (lt === 'sets-duration') setRec(`Progress! Try ${parseInt(last.sets) + 1} sets`, 'trending-up');
    else if (lt === 'duration-distance') setRec(`Progress! Try ${parseInt(last.duration) + 5} min`, 'trending-up');
  };

  // Plyometric height only progresses when landings have been clean and consistent —
  // reps/sets progress on their own cadence, independently of height, and never both at once.
  const buildPlyoRecommendation = (sessionData: any[], createdAtData: string[], skillLevel: string) => {
    const level = skillLevel?.toLowerCase() ?? 'beginner';
    const heightUnit = LOG_TYPE_FIELDS.plyometric.units?.height ?? 'in';
    if (sessionData.length === 0) {
      if (level === 'advanced') { setRec("Log your first session and we'll track your progress!", 'trending-up'); return; }
      setRec(`Target: ${getSkillRecommendation('plyometric', skillLevel) ?? '2 sets • 6 reps'}`);
      return;
    }

    const last = sessionData[0] as any;
    const lastHeight = parseFloat(last.height) || 0;
    const lastLanding = typeof last.landing === 'number' ? last.landing : -1;
    const lastSets = parseInt(last.sets) || 0;
    const lastReps = parseInt(last.reps) || 0;

    // A shaky or missed landing blocks any height increase, regardless of reps completed.
    if (lastLanding === 2) {
      const stepDown = Math.max(lastHeight - PLYO_HEIGHT_INCREMENT_IN, 0);
      setRec(`Step back down to ${stepDown}${heightUnit} and rebuild consistency before going higher`, 'trending-down');
      return;
    }
    if (lastLanding === 1) {
      setRec(`Hold at ${lastHeight}${heightUnit} • ${lastSets} sets • ${lastReps} reps until landings feel fully clean`);
      return;
    }

    // Clean (or unreported) landing — see how long they've held this exact height cleanly.
    // sessionData is newest-first, so sessionData[i - 1] is chronologically MORE RECENT
    // than sessionData[i] — the streak breaks if the more recent session regressed
    // (fewer reps/sets) compared to the older one it followed.
    let cleanStreak = 0;
    for (let i = 0; i < sessionData.length; i++) {
      const s = sessionData[i] as any;
      if ((parseFloat(s.height) || 0) !== lastHeight || s.landing !== 0) break;
      if (i > 0) {
        const moreRecent = sessionData[i - 1] as any;
        if ((parseInt(moreRecent.reps) || 0) < (parseInt(s.reps) || 0) || (parseInt(moreRecent.sets) || 0) < (parseInt(s.sets) || 0)) break;
      }
      cleanStreak++;
    }

    const bumpedRecently = sessionData.some((s: any, i: number) => {
      const prev = sessionData[i + 1] as any;
      if (!prev || (parseFloat(s.height) || 0) <= (parseFloat(prev.height) || 0)) return false;
      const days = daysSince(createdAtData[i]);
      return days !== null && days < PLYO_MIN_DAYS_BETWEEN_HEIGHT_BUMPS;
    });

    if (lastHeight >= PLYO_MAX_HEIGHT_IN) {
      setRec(`You've hit the recommended max height (${PLYO_MAX_HEIGHT_IN}${heightUnit}) — build reps/sets instead of jumping higher`);
      return;
    }

    if (cleanStreak >= PLYO_CLEAN_STREAK_FOR_HEIGHT_BUMP && !bumpedRecently) {
      const nextHeight = Math.min(lastHeight + PLYO_HEIGHT_INCREMENT_IN, PLYO_MAX_HEIGHT_IN);
      setRec(`Clean landings ${cleanStreak} sessions in a row at ${lastHeight}${heightUnit} — try ${nextHeight}${heightUnit} next time`, 'trending-up');
      return;
    }

    // Not due for a height bump — progress reps/sets instead, kept independent of height.
    const last3 = sessionData.slice(0, 3);
    if (last3.length >= 3) {
      const reps3 = last3.map((s: any) => parseInt(s.reps) || 0);
      const repsConsistent = reps3[0] >= reps3[1] && reps3[1] >= reps3[2];
      if (repsConsistent) { setRec(`Progress! Try ${lastSets} sets • ${lastReps + 2} reps at ${lastHeight}${heightUnit}`, 'trending-up'); return; }
      setRec(`Let's rebuild consistency: ${lastSets} sets • ${lastReps} reps at ${lastHeight}${heightUnit}`, 'restore');
      return;
    }
    setRec(bumpedRecently
      ? `Hold at ${lastHeight}${heightUnit} — already bumped height this week`
      : `Keep going! ${lastSets} sets • ${lastReps} reps at ${lastHeight}${heightUnit}`);
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
    if (logType === 'plyometric') {
      newSession = { date, sets, reps, height, landing: landingQuality };
      setSets(''); setReps(''); setHeight(''); setLandingQuality(-1);
    } else if (logType === 'reps-sets') {
      newSession = { date, sets, reps };
      setSets(''); setReps('');
    } else if (category === 'strength') {
      if (logType === 'plank') newSession = { date, sets, time: reps };
      else if (logType === 'strength-time') newSession = { date, weight, sets, time: reps };
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
      const { data: inserted, error } = await supabase.from('session_logs').insert({ user_id: user.id, exercise_name: name as string, category: category as string, log_data: newSession }).select();
      if (error || !inserted || !inserted[0]) { showAlert('Save failed', 'Could not save this session. Please try again.'); return; }
      const updatedSessions = [newSession, ...sessions];
      const updatedIds = [inserted[0].id, ...sessionIds];
      const updatedCreatedAt = [inserted[0].created_at, ...sessionCreatedAt];
      setSessions(updatedSessions);
      setSessionIds(updatedIds);
      setSessionCreatedAt(updatedCreatedAt);

      // Notify any coach whose (non-proof) assignment for this exact exercise
      // this session just completes for the first time. Proof-required
      // assignments get their own notification when proof is submitted instead.
      try {
        const { data: openAssignments } = await supabase
          .from('assignments')
          .select('id, coach_id, created_at')
          .eq('player_id', user.id)
          .eq('title', name as string)
          .eq('requires_proof', false);
        const newlyCompleted = (openAssignments ?? []).filter((a: any) =>
          new Date(a.created_at) <= new Date(inserted[0].created_at) &&
          !sessionCreatedAt.some((ts: string) => new Date(ts) >= new Date(a.created_at))
        );
        if (newlyCompleted.length) {
          const { data: myProfile } = await supabase.from('profiles').select('full_name').eq('id', user.id).single();
          const myName = myProfile?.full_name ?? 'Your player';
          for (const a of newlyCompleted) {
            await notifyWorkoutCompleted(a.coach_id, myName, name as string);
          }
        }
      } catch (e) {
        console.log('notifyWorkoutCompleted error:', e);
      }

      if (logType === 'strength' && startingWeight) buildWeightRecommendation(startingWeight, updatedSessions, profile?.skill_level);
      else if (logType === 'plyometric') buildPlyoRecommendation(updatedSessions, updatedCreatedAt, profile?.skill_level);
      else if (logType === 'strength-time') buildStrengthTimeRecommendation(updatedSessions, profile?.skill_level);
      else if (logType !== 'recovery' && logType) { const rec = getSkillRecommendation(logType as string, profile?.skill_level, name as string); buildNonWeightRecommendation(logType as string, updatedSessions, profile?.skill_level, rec ?? ''); }
    } else {
      showAlert('Not logged in', 'Log in to save your progress across devices.');
    }
  };

  const deleteSession = async (index: number) => {
    showConfirm('Delete Session', 'Are you sure you want to delete this session?', async () => {
      const idToDelete = sessionIds[index];
      if (idToDelete) await supabase.from('session_logs').delete().eq('id', idToDelete);
      const updatedSessions = sessions.filter((_, i) => i !== index);
      const updatedIds = sessionIds.filter((_, i) => i !== index);
      const updatedCreatedAt = sessionCreatedAt.filter((_, i) => i !== index);
      setSessions(updatedSessions);
      setSessionIds(updatedIds);
      setSessionCreatedAt(updatedCreatedAt);
      if (logType === 'strength' && startingWeight) buildWeightRecommendation(startingWeight, updatedSessions, profile?.skill_level);
      else if (logType === 'plyometric') buildPlyoRecommendation(updatedSessions, updatedCreatedAt, profile?.skill_level);
      else if (logType === 'strength-time') buildStrengthTimeRecommendation(updatedSessions, profile?.skill_level);
      else if (logType !== 'recovery' && logType) { const rec = getSkillRecommendation(logType as string, profile?.skill_level, name as string); buildNonWeightRecommendation(logType as string, updatedSessions, profile?.skill_level, rec ?? ''); }
    });
  };

  const saveNote = (text: string) => {
    setGeneralNote(text);
    clearTimeout(noteTimeout.current);
    noteTimeout.current = setTimeout(async () => {
      if (!user) return;
      setSavingNote(true);
      await supabase.from('exercise_notes').upsert({
        user_id: user.id,
        exercise_name: name as string,
        note: text,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id,exercise_name' });
      setSavingNote(false);
    }, 600);
  };

  const clearGeneralNote = () => {
    if (!generalNote.trim()) return;
    showConfirm('Clear this note?', 'This will erase everything written here.', () => saveNote(''));
  };

  const renderInput = (placeholder: string, value: string, setValue: (v: string) => void, keyboardType: any = 'default') => (
    <TextInput
      style={styles.input}
      placeholder={placeholder}
      placeholderTextColor={Theme.textSecondary}
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
          <Pressable
            key={i}
            style={[
              styles.feelingBtn,
              (feeling === i || hoveredFeeling === i) && { backgroundColor: catTheme.bg, borderColor: catTheme.bg },
            ]}
            onPress={() => setFeeling(i)}
            onHoverIn={() => setHoveredFeeling(i)}
            onHoverOut={() => setHoveredFeeling(null)}
          >
            <Text style={[styles.feelingText, feeling === i && { color: catTheme.fg, fontWeight: 'bold' }]}>{label}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );

  const renderLandingQuality = () => (
    <View>
      <Text style={styles.fieldLabel}>Landing Quality</Text>
      <View style={styles.feelingRow}>
        {LANDING_LABELS.map((label, i) => (
          <Pressable
            key={i}
            style={[
              styles.feelingBtn,
              (landingQuality === i || hoveredLanding === i) && { backgroundColor: catTheme.bg, borderColor: catTheme.bg },
            ]}
            onPress={() => setLandingQuality(i)}
            onHoverIn={() => setHoveredLanding(i)}
            onHoverOut={() => setHoveredLanding(null)}
          >
            <Text style={[styles.feelingText, landingQuality === i && { color: catTheme.fg, fontWeight: 'bold' }]}>{label}</Text>
          </Pressable>
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
            <Icon name="trash-can-outline" size={22} color="#FF6B6B" />
          </TouchableOpacity>
        </View>
        <View style={styles.historyFields}>
          {category === 'strength' && logType === 'plank' && (
            <>{session.sets ? <Text style={styles.historyField}>{session.sets} sets</Text> : null}{session.time ? <Text style={styles.historyField}>{session.time} sec</Text> : null}</>
          )}
          {logType === 'reps-sets' && (
            <>{session.sets ? <Text style={styles.historyField}>{session.sets} sets</Text> : null}{session.reps ? <Text style={styles.historyField}>{session.reps} reps</Text> : null}</>
          )}
          {logType === 'plyometric' && (
            <>{session.sets ? <Text style={styles.historyField}>{session.sets} sets</Text> : null}{session.reps ? <Text style={styles.historyField}>{session.reps} reps</Text> : null}{session.height ? <Text style={styles.historyField}>{session.height}{LOG_TYPE_FIELDS.plyometric.units?.height ?? 'in'}</Text> : null}{typeof session.landing === 'number' && session.landing >= 0 ? <Text style={styles.historyField}>{LANDING_LABELS[session.landing]}</Text> : null}</>
          )}
          {category === 'strength' && logType === 'strength-time' && (
            <>{session.weight ? <Text style={styles.historyField}>{session.weight}kg</Text> : null}{session.sets ? <Text style={styles.historyField}>{session.sets} sets</Text> : null}{session.time ? <Text style={styles.historyField}>{session.time} sec</Text> : null}</>
          )}
          {category === 'strength' && logType !== 'plank' && logType !== 'reps-sets' && logType !== 'plyometric' && logType !== 'strength-time' && (
            <>{session.weight ? <Text style={styles.historyField}>{session.weight}kg</Text> : null}{session.sets ? <Text style={styles.historyField}>{session.sets} sets</Text> : null}{session.reps ? <Text style={styles.historyField}>{session.reps} reps</Text> : null}</>
          )}
          {category === 'footwork' && logType !== 'plyometric' && logType !== 'reps-sets' && (
            <>{session.sets ? <Text style={styles.historyField}>{session.sets} sets</Text> : null}{session.duration ? <Text style={styles.historyField}>{session.duration} min</Text> : null}</>
          )}
          {category === 'endurance' && logType === 'skipping' && (
            <>{session.sets ? <Text style={styles.historyField}>{session.sets} sets</Text> : null}{session.reps ? <Text style={styles.historyField}>{session.reps} reps</Text> : null}{session.time ? <Text style={styles.historyField}>{session.time} sec</Text> : null}</>
          )}
          {category === 'endurance' && logType === 'sets-duration' && (
            <>{session.sets ? <Text style={styles.historyField}>{session.sets} sets</Text> : null}{session.duration ? <Text style={styles.historyField}>{session.duration} min</Text> : null}</>
          )}
          {category === 'endurance' && logType === 'duration-distance' && (
            <>{session.duration ? <Text style={styles.historyField}>{session.duration} min</Text> : null}{session.distance ? <Text style={styles.historyField}>{session.distance}km</Text> : null}</>
          )}
          {category === 'recovery' && (
            <>{session.duration ? <Text style={styles.historyField}>{session.duration} min</Text> : null}{session.feeling >= 0 ? <Text style={styles.historyField}>{FEELING_LABELS[session.feeling]}</Text> : null}</>
          )}
        </View>
      </View>
    ));
  };

  const renderMedia = () => {
    // "contain" shows the whole frame uncropped — some source videos are framed
    // wide/zoomed, and "cover" was cropping people/equipment out of view.
    // A fixed-height box made "contain" videos look tiny and letterboxed
    // against the light page background, so this sizes the box by aspect
    // ratio instead (fills the width properly) and fills the letterbox
    // bars with the exercise's own category color (e.g. footwork's dark
    // green) instead of leaving them blank, with the corners clipped on
    // the wrapper so they stay rounded regardless of the video surface.
    if (hasVideo) {
      return (
        <View style={[styles.videoWrap, { backgroundColor: catTheme.fg }]}>
          <VideoView
            player={player}
            style={styles.video}
            contentFit="contain"
            nativeControls
            fullscreenOptions={{ enable: true }}
          />
        </View>
      );
    }
    if (imageUrl && imageUrl !== '') {
      const localImage = getLocalImage(imageUrl as string);
      if (localImage) return <Image source={localImage} style={styles.image} resizeMode="cover" />;
    }
    return null;
  };

  const renderVoiceNotesSection = () => {
    if (!user) return (
      <View style={styles.voiceEmptyState}>
        <Icon name="microphone-off" size={32} color={Theme.textSecondary} />
        <Text style={styles.emptyText}>Log in to record voice notes.</Text>
      </View>
    );
    return (
      <View>
        {isUploading ? (
          <View style={styles.recordingCard}>
            <ActivityIndicator size="large" color={Theme.eyebrowGreen} />
            <Text style={styles.uploadingText}>Saving voice note...</Text>
          </View>
        ) : isRecording ? (
          <View style={styles.recordingCard}>
            <View style={styles.recordingPulse}>
              <Icon name="microphone" size={28} color="#FFFFFF" />
            </View>
            <Text style={styles.recordingTime}>{formatTime(recordingDuration)}</Text>
            <Text style={styles.recordingLabel}>Recording...</Text>
            <View style={styles.recordingActions}>
              <TouchableOpacity style={styles.cancelRecordBtn} onPress={cancelRecording}>
                <Icon name="close" size={20} color="#FF6B6B" />
                <Text style={styles.cancelRecordText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.stopRecordBtn, { backgroundColor: catTheme.fg }]} onPress={stopRecording}>
                <Icon name="stop" size={20} color="#FFFFFF" />
                <Text style={[styles.stopRecordText, { color: '#FFFFFF' }]}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <TouchableOpacity style={[styles.startRecordBtn, { backgroundColor: catTheme.fg }]} onPress={startRecording}>
            <Icon name="microphone" size={22} color="#FFFFFF" />
            <Text style={[styles.startRecordText, { color: '#FFFFFF' }]}>Record Voice Note</Text>
          </TouchableOpacity>
        )}
        {voiceNotes.length === 0 ? (
          <Text style={[styles.emptyText, { marginTop: 16 }]}>No voice notes yet. Tap the button above to record one.</Text>
        ) : (
          <View style={{ marginTop: 16 }}>
            {voiceNotes.map((note) => (
              <View key={note.id} style={styles.voiceNoteRow}>
                <TouchableOpacity style={styles.playBtn} onPress={() => playVoiceNote(note)}>
                  <Icon name={playingId === note.id ? 'pause' : 'play'} size={20} color={Theme.limeAccentDark} />
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
                  <Icon name="trash-can-outline" size={18} color="#FF6B6B" />
                </TouchableOpacity>
              </View>
            ))}
            <Text style={styles.voiceNoteCount}>{voiceNotes.length}/5 voice notes</Text>
            <TouchableOpacity
              style={styles.clearAllRow}
              onPress={clearAllVoiceNotes}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Icon name="trash-can-outline" size={15} color="#C0392B" />
              <Text style={styles.clearAllText}>Clear all</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <TouchableOpacity style={styles.backBtn} onPress={() => {
        if (typeof window !== 'undefined') window.history.back();
        else router.back();
      }}>
        <Icon name="arrow-left" size={24} color={Theme.textPrimary} />
      </TouchableOpacity>

      <Text style={styles.eyebrow}>{(category as string)?.toUpperCase()}</Text>
      <Text style={styles.title}>{name}</Text>
      <View style={styles.tagRow}>
        {muscleList.map((muscle, i) => (
          <View key={i} style={[styles.tag, { backgroundColor: catTheme.bg }]}>
            <Text style={[styles.tagText, { color: catTheme.fg }]}>{muscle}</Text>
          </View>
        ))}
      </View>

      <View style={styles.tabRow}>
        {(['howto', 'notes', 'timer'] as const).map(tab => (
          <Pressable
            key={tab}
            style={[
              styles.tab,
              activeTab === tab
                ? { backgroundColor: catTheme.fg }
                : hoveredTab === tab && { backgroundColor: catTheme.bg },
            ]}
            onPress={() => setActiveTab(tab)}
            onHoverIn={() => setHoveredTab(tab)}
            onHoverOut={() => setHoveredTab(null)}
          >
            <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>
              {tab === 'howto' ? 'How To' : tab === 'notes' ? 'Notes' : 'Timer'}
            </Text>
          </Pressable>
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
                  <View style={[styles.stepNumber, { backgroundColor: catTheme.fg }]}><Text style={styles.stepNumberText}>{i + 1}</Text></View>
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
              <View style={[styles.weightPromptCard, { borderLeftColor: catTheme.fg }]}>
                <Text style={styles.weightPromptTitle}>{startingWeight ? 'Update' : 'Set'} Your Starting Weight</Text>
                <Text style={styles.weightPromptDesc}>Enter the weight you can comfortably lift. We'll use this to build personalized recommendations.</Text>
                <View style={styles.weightPromptRow}>
                  <TextInput style={styles.weightPromptInput} placeholder="e.g. 20" placeholderTextColor={Theme.textSecondary} value={startingWeightInput} onChangeText={(t) => setStartingWeightInput(t.replace(/[^0-9.]/g, ''))} keyboardType="numeric" />
                  <Text style={styles.weightPromptKg}>kg</Text>
                  <TouchableOpacity style={styles.weightPromptBtn} onPress={saveStartingWeight}>
                    <Text style={styles.weightPromptBtnText}>Save</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
            {user && recommendation !== '' && category !== 'recovery' && (
              <View style={[styles.recommendationCard, { backgroundColor: catTheme.bg, borderLeftColor: catTheme.fg }]}>
                <View style={styles.recommendationHeader}>
                  <Text style={[styles.recommendationLabel, { color: catTheme.fg }]}>TODAY'S TARGET</Text>
                  {logType === 'strength' && startingWeight && !showWeightPrompt && (
                    <TouchableOpacity onPress={() => setShowWeightPrompt(true)}>
                      <Text style={styles.editLink}>Edit weight</Text>
                    </TouchableOpacity>
                  )}
                </View>
                <View style={styles.recommendationBody}>
                  <Icon name={recommendationIcon} size={22} color={catTheme.fg} style={styles.recommendationIcon} />
                  <Text style={styles.recommendationText}>{recommendation}</Text>
                </View>
                {!profile?.age && (
                  <TouchableOpacity style={styles.onboardingHintRow} onPress={() => { if (typeof window !== 'undefined') window.location.href = '/onboarding'; else router.push('/onboarding' as any); }}>
                    <Text style={styles.onboardingHint}>Complete your profile for personalized recommendations</Text>
                    <Icon name="chevron-right" size={19} color={Theme.eyebrowGreen} />
                  </TouchableOpacity>
                )}
              </View>
            )}
            {!user ? (
              <View style={styles.sessionCard}>
                <Text style={styles.sectionLabel}>SESSION LOG</Text>
                <Text style={styles.emptyText}>Log in to save and track your progress.</Text>
                <TouchableOpacity style={[styles.addButton, { backgroundColor: catTheme.fg }]} onPress={() => router.push('/login' as any)}>
                  <Text style={[styles.addButtonText, { color: '#FFFFFF' }]}>Log In</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.sessionCard}>
                <Text style={styles.sectionLabel}>LOG SESSION</Text>
                {category === 'strength' && logType !== 'plank' && logType !== 'reps-sets' && logType !== 'plyometric' && logType !== 'strength-time' && (
                  <View><View style={styles.inputRow}>{renderInput('Weight (kg)', weight, setWeight, 'numeric')}{renderInput('Sets', sets, setSets, 'numeric')}</View><View style={styles.inputRow}>{renderInput('Reps', reps, setReps, 'numeric')}</View></View>
                )}
                {category === 'strength' && logType === 'plank' && (
                  <View style={styles.inputRow}>{renderInput('Sets', sets, setSets, 'numeric')}{renderInput('Time (sec)', reps, setReps, 'numeric')}</View>
                )}
                {category === 'strength' && logType === 'strength-time' && (
                  <View><View style={styles.inputRow}>{renderInput('Weight (kg)', weight, setWeight, 'numeric')}{renderInput('Sets', sets, setSets, 'numeric')}</View><View style={styles.inputRow}>{renderInput('Time (sec)', reps, setReps, 'numeric')}</View></View>
                )}
                {logType === 'reps-sets' && (
                  <View style={styles.inputRow}>{renderInput('Sets', sets, setSets, 'numeric')}{renderInput('Reps', reps, setReps, 'numeric')}</View>
                )}
                {logType === 'plyometric' && (
                  <View>
                    <View style={styles.inputRow}>{renderInput('Sets', sets, setSets, 'numeric')}{renderInput('Reps', reps, setReps, 'numeric')}</View>
                    <View style={styles.inputRow}>{renderInput(`Height (${LOG_TYPE_FIELDS.plyometric.units?.height ?? 'in'})`, height, setHeight, 'numeric')}</View>
                    {renderLandingQuality()}
                  </View>
                )}
                {category === 'footwork' && logType !== 'plyometric' && logType !== 'reps-sets' && (
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
                <TouchableOpacity style={[styles.addButton, { backgroundColor: catTheme.fg }]} onPress={saveSession}>
                  <Text style={[styles.addButtonText, { color: '#FFFFFF' }]}>+ Save Session</Text>
                </TouchableOpacity>
              </View>
            )}
            <View style={styles.sessionCard}>
              <Text style={styles.sectionLabel}>SESSION HISTORY</Text>
              {renderSessionHistory()}
            </View>
            <View style={styles.sessionCard}>
              <View style={styles.notesLabelRow}>
                <Text style={styles.sectionLabel}>GENERAL NOTES</Text>
                {savingNote && <Text style={styles.savingText}>Saving...</Text>}
              </View>
              <View style={styles.subTabRow}>
                <TouchableOpacity style={[styles.subTab, notesSubTab === 'text' && { backgroundColor: catTheme.fg, borderColor: catTheme.fg }]} onPress={() => setNotesSubTab('text')}>
                  <Icon name="pencil-outline" size={14} color={notesSubTab === 'text' ? '#FFFFFF' : Theme.textSecondary} />
                  <Text style={[styles.subTabText, notesSubTab === 'text' && styles.subTabTextActive]}>Text</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.subTab, notesSubTab === 'voice' && { backgroundColor: catTheme.fg, borderColor: catTheme.fg }]} onPress={() => setNotesSubTab('voice')}>
                  <Icon name="microphone-outline" size={14} color={notesSubTab === 'voice' ? '#FFFFFF' : Theme.textSecondary} />
                  <Text style={[styles.subTabText, notesSubTab === 'voice' && styles.subTabTextActive]}>Voice</Text>
                </TouchableOpacity>
              </View>
              {notesSubTab === 'text' ? (
                <View style={styles.notesContainer}>
                  <TextInput style={styles.notesInput} placeholder="Add any extra things to remember..." placeholderTextColor={Theme.textSecondary} value={generalNote} onChangeText={saveNote} multiline numberOfLines={4} />
                  <TouchableOpacity
                    style={styles.clearAllRow}
                    onPress={clearGeneralNote}
                    disabled={!generalNote.trim()}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Icon name="trash-can-outline" size={15} color={generalNote.trim() ? '#C0392B' : Theme.textMuted} />
                    <Text style={[styles.clearAllText, { color: generalNote.trim() ? '#C0392B' : Theme.textMuted }]}>Clear</Text>
                  </TouchableOpacity>
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
              <TouchableOpacity
                style={[
                  styles.timerBtn,
                  { backgroundColor: catTheme.fg },
                  timerRunning && styles.timerBtnPause,
                  !timerRunning && isCountdown && getCountdownTotal() === 0 && styles.timerBtnDisabled,
                ]}
                onPress={timerRunning ? pauseTimer : startTimer}
                disabled={!timerRunning && isCountdown && getCountdownTotal() === 0}
              >
                <Icon name={timerRunning ? 'pause' : 'play'} size={20} color="#FFFFFF" />
                <Text style={[styles.timerBtnText, { color: '#FFFFFF' }]}>{timerRunning ? 'Pause' : 'Start'}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.timerResetBtn} onPress={() => resetTimer()}>
                <Icon name="refresh" size={20} color={Theme.textSecondary} />
                <Text style={styles.timerResetText}>Reset</Text>
              </TouchableOpacity>
            </View>

            {/* Stop sound button — only shows when timer sound is playing */}
            {timerSoundPlaying && (
              <TouchableOpacity style={styles.stopSoundBtn} onPress={stopTimerSound}>
                <Icon name="volume-off" size={18} color="#fff" />
                <Text style={styles.stopSoundText}>Stop Sound</Text>
              </TouchableOpacity>
            )}

            <View style={styles.timerModeRow}>
              <TouchableOpacity style={[styles.modePill, !isCountdown && { backgroundColor: catTheme.fg, borderColor: catTheme.fg }]} onPress={() => { setIsCountdown(false); resetTimer(false); }}>
                <Text style={[styles.modePillText, !isCountdown && styles.modePillTextActive]}>Stopwatch</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modePill, isCountdown && { backgroundColor: catTheme.fg, borderColor: catTheme.fg }]} onPress={() => { setIsCountdown(true); resetTimer(true); }}>
                <Text style={[styles.modePillText, isCountdown && styles.modePillTextActive]}>Countdown</Text>
              </TouchableOpacity>
            </View>

            {isCountdown && (
              <View style={styles.countdownInputRow}>
                <TextInput
                  style={styles.countdownInput}
                  placeholder="0"
                  placeholderTextColor={Theme.textSecondary}
                  value={countdownMin}
                  onChangeText={(t) => {
                    const clean = t.replace(/[^0-9]/g, '');
                    setCountdownMin(clean);
                    if (!timerRunning) setTimerSeconds((parseInt(clean) || 0) * 60 + (parseInt(countdownSec) || 0));
                  }}
                  keyboardType="numeric"
                />
                <Text style={styles.countdownLabel}>min</Text>
                <TextInput
                  style={styles.countdownInput}
                  placeholder="0"
                  placeholderTextColor={Theme.textSecondary}
                  value={countdownSec}
                  onChangeText={(t) => {
                    const clean = t.replace(/[^0-9]/g, '');
                    setCountdownSec(clean);
                    if (!timerRunning) setTimerSeconds((parseInt(countdownMin) || 0) * 60 + (parseInt(clean) || 0));
                  }}
                  keyboardType="numeric"
                />
                <Text style={styles.countdownLabel}>sec</Text>
              </View>
            )}
            {isCountdown && getCountdownTotal() === 0 && (
              <Text style={styles.countdownHint}>Set a time above to start the countdown.</Text>
            )}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Theme.background, padding: 24, paddingTop: 50 },
  backBtn: { marginBottom: 8, alignSelf: 'flex-start' },
  eyebrow: { fontSize: 11, fontWeight: '500', color: Theme.eyebrowGreen, letterSpacing: 1, marginBottom: 2 },
  title: { fontFamily: Fonts.serifMedium, fontSize: 26, color: Theme.textPrimary, marginBottom: 12 },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 20 },
  tag: { backgroundColor: Theme.cardTinted, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 },
  tagText: { color: Theme.eyebrowGreen, fontSize: 13, fontWeight: '600' },
  tabRow: { flexDirection: 'row', gap: 12, marginBottom: 20 },
  tab: { paddingHorizontal: 24, paddingVertical: 13, borderRadius: 24, backgroundColor: Theme.cardWhite },
  tabText: { color: Theme.textSecondary, fontWeight: '600', fontSize: 15 },
  tabTextActive: { color: '#FFFFFF' },
  content: { paddingBottom: 40 },
  videoWrap: { width: '100%', aspectRatio: 16 / 9, borderRadius: 16, overflow: 'hidden', marginBottom: 16 },
  video: { width: '100%', height: '100%' },
  image: { width: '100%', height: 340, borderRadius: 12, marginBottom: 16 },
  description: { fontSize: 17, color: Theme.textSecondary, lineHeight: 24, marginBottom: 20 },
  stepsCard: { backgroundColor: Theme.cardWhite, borderRadius: 14, padding: 18, gap: 18 },
  stepRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  stepNumber: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  stepNumberText: { color: '#FFFFFF', fontWeight: 'bold', fontSize: 15 },
  stepText: { flex: 1, color: Theme.textPrimary, fontSize: 17, lineHeight: 24 },
  weightPromptCard: { backgroundColor: Theme.cardWhite, borderRadius: 14, padding: 16, marginBottom: 16, borderLeftWidth: 3 },
  weightPromptTitle: { fontSize: 16, fontWeight: 'bold', color: Theme.textPrimary, marginBottom: 6 },
  weightPromptDesc: { fontSize: 15, color: Theme.textSecondary, lineHeight: 20, marginBottom: 12 },
  weightPromptRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  weightPromptInput: { flex: 1, backgroundColor: Theme.background, borderRadius: 8, padding: 10, color: Theme.textPrimary, fontSize: 16, textAlign: 'center', borderWidth: 1, borderColor: Theme.divider },
  weightPromptKg: { fontSize: 14, color: Theme.textPrimary, fontWeight: '600' },
  weightPromptBtn: { backgroundColor: Theme.limeAccent, borderRadius: 8, paddingVertical: 10, paddingHorizontal: 16 },
  weightPromptBtnText: { color: Theme.limeAccentDark, fontWeight: 'bold', fontSize: 14 },
  recommendationCard: { borderRadius: 14, padding: 14, marginBottom: 16, borderLeftWidth: 3 },
  recommendationHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  recommendationLabel: { fontSize: 12, fontWeight: 'bold', letterSpacing: 1 },
  editLink: { fontSize: 13, color: Theme.eyebrowGreen, fontWeight: '600', textDecorationLine: 'underline' },
  recommendationBody: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  recommendationIcon: { marginTop: 2 },
  recommendationText: { flex: 1, fontSize: 16, fontWeight: 'bold', color: Theme.textPrimary },
  onboardingHintRow: { flexDirection: 'row', alignItems: 'center', marginTop: 8 },
  onboardingHint: { fontSize: 13, color: Theme.eyebrowGreen, fontWeight: '600' },
  timerCard: { backgroundColor: Theme.cardWhite, borderRadius: 16, padding: 32, alignItems: 'center', justifyContent: 'center', minHeight: 320, marginBottom: 16 },
  timerDisplay: { fontSize: 72, fontWeight: 'bold', color: Theme.textPrimary, marginVertical: 24, letterSpacing: 4 },
  timerBtnRow: { flexDirection: 'row', gap: 12, marginBottom: 16 },
  timerBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 28, paddingHorizontal: 28, paddingVertical: 14 },
  timerBtnPause: { backgroundColor: '#E67E22' },
  timerBtnDisabled: { opacity: 0.4 },
  timerBtnText: { fontWeight: 'bold', fontSize: 16 },
  timerResetBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: Theme.cardWhite, borderRadius: 28, paddingHorizontal: 24, paddingVertical: 14, borderWidth: 1, borderColor: Theme.divider },
  timerResetText: { color: Theme.textSecondary, fontWeight: '600', fontSize: 16 },
  stopSoundBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#E74C3C', borderRadius: 20, paddingHorizontal: 20, paddingVertical: 10, marginBottom: 16 },
  stopSoundText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  timerModeRow: { flexDirection: 'row', gap: 8, marginBottom: 20 },
  modePill: { paddingHorizontal: 20, paddingVertical: 8, borderRadius: 20, backgroundColor: Theme.cardWhite, borderWidth: 1, borderColor: Theme.divider },
  modePillText: { fontSize: 13, color: Theme.textSecondary, fontWeight: '600' },
  modePillTextActive: { color: '#FFFFFF' },
  countdownInputRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  countdownInput: { backgroundColor: Theme.cardWhite, borderRadius: 10, paddingVertical: 12, paddingHorizontal: 0, color: Theme.textPrimary, fontSize: 16, borderWidth: 1, borderColor: Theme.divider, width: 70, textAlign: 'center', textAlignVertical: 'center' },
  countdownLabel: { fontSize: 14, color: Theme.textSecondary, fontWeight: '600' },
  countdownHint: { fontSize: 13, color: Theme.textMuted, fontStyle: 'italic', marginTop: 10, textAlign: 'center' },
  sessionCard: { backgroundColor: Theme.cardWhite, borderRadius: 14, padding: 12, marginBottom: 16 },
  sectionLabel: { color: Theme.eyebrowGreen, fontWeight: 'bold', fontSize: 12, letterSpacing: 1, marginBottom: 14 },
  notesLabelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  savingText: { fontSize: 12, color: Theme.textSecondary, fontStyle: 'italic' },
  inputRow: { flexDirection: 'row', gap: 6, marginBottom: 12 },
  input: { flex: 1, minWidth: 0, backgroundColor: Theme.background, borderRadius: 8, paddingVertical: 8, paddingHorizontal: 6, color: Theme.textPrimary, fontSize: 14, textAlign: 'center', borderWidth: 1, borderColor: Theme.divider },
  fieldLabel: { color: Theme.textSecondary, fontSize: 13, marginBottom: 8 },
  feelingRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  feelingBtn: { flex: 1, paddingVertical: 8, borderRadius: 8, backgroundColor: Theme.background, alignItems: 'center', borderWidth: 1, borderColor: Theme.divider },
  feelingText: { color: Theme.textSecondary, fontSize: 13 },
  addButton: { borderRadius: 10, paddingVertical: 12, alignItems: 'center', marginTop: 4 },
  addButtonText: { fontWeight: 'bold', fontSize: 14 },
  historyRow: { borderBottomWidth: 1, borderBottomColor: Theme.divider, paddingVertical: 14 },
  historyTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  historyDate: { color: Theme.textSecondary, fontSize: 15, fontWeight: '600' },
  historyFields: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  historyField: { color: Theme.textPrimary, fontSize: 15, fontWeight: '600', backgroundColor: Theme.background, paddingHorizontal: 13, paddingVertical: 7, borderRadius: 10, borderWidth: 1, borderColor: Theme.divider },
  emptyText: { color: Theme.textSecondary, fontSize: 15, fontStyle: 'italic', marginBottom: 12 },
  notesContainer: { backgroundColor: Theme.background, borderRadius: 8, padding: 10, borderWidth: 1, borderColor: Theme.divider },
  notesInput: { color: Theme.textPrimary, fontSize: 15, lineHeight: 22, minHeight: 80, textAlignVertical: 'top' },
  clearAllRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 6, marginTop: 8 },
  clearAllText: { fontSize: 13, fontWeight: '600', color: '#C0392B' },
  subTabRow: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  subTab: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, backgroundColor: Theme.background, borderWidth: 1, borderColor: Theme.divider },
  subTabText: { fontSize: 13, fontWeight: '600', color: Theme.textSecondary },
  subTabTextActive: { color: '#FFFFFF' },
  voiceEmptyState: { alignItems: 'center', paddingVertical: 24, gap: 8 },
  recordingCard: { alignItems: 'center', paddingVertical: 24, gap: 12 },
  recordingPulse: { width: 64, height: 64, borderRadius: 32, backgroundColor: '#E74C3C', alignItems: 'center', justifyContent: 'center' },
  recordingTime: { fontSize: 32, fontWeight: 'bold', color: Theme.textPrimary, letterSpacing: 2 },
  recordingLabel: { fontSize: 13, color: '#E74C3C', fontWeight: '600' },
  recordingActions: { flexDirection: 'row', gap: 16, marginTop: 8 },
  cancelRecordBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 20, backgroundColor: 'rgba(255,107,107,0.12)', borderWidth: 1, borderColor: 'rgba(255,107,107,0.3)' },
  cancelRecordText: { color: '#E74C3C', fontWeight: '600', fontSize: 13 },
  stopRecordBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 20 },
  stopRecordText: { fontWeight: '600', fontSize: 13 },
  uploadingText: { color: Theme.textSecondary, fontSize: 13, marginTop: 8 },
  startRecordBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, borderRadius: 12, paddingVertical: 14 },
  startRecordText: { fontWeight: 'bold', fontSize: 14 },
  voiceNoteRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Theme.divider },
  playBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: Theme.limeAccent, alignItems: 'center', justifyContent: 'center' },
  voiceNoteInfo: { flex: 1, gap: 4 },
  voiceNoteDate: { color: Theme.textSecondary, fontSize: 13 },
  voiceNoteDuration: { color: Theme.textPrimary, fontSize: 13, fontWeight: '600' },
  progressBarBg: { height: 4, borderRadius: 2, backgroundColor: Theme.divider, overflow: 'hidden' },
  progressBarFill: { height: '100%', borderRadius: 2, backgroundColor: Theme.eyebrowGreen },
  voiceNoteCount: { color: Theme.textSecondary, fontSize: 13, textAlign: 'right', marginTop: 8 },
});