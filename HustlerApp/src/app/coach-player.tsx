import { View, StyleSheet, TouchableOpacity, ScrollView, Image, Linking, ActivityIndicator } from 'react-native';
import { TextInput } from '@/components/TextInput';
import { Text } from '@/components/Text';
import { router, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { useState, useEffect, useRef, useCallback } from 'react';
import { Audio } from 'expo-av';
import { Icon } from '@/components/icons/Icon';
import { Theme, CategoryTheme, Fonts } from '@/constants/theme';
import { supabase } from '../lib/supabase';
import { notifyCoachMessage, notifyMatchCoachFeedback } from '../lib/notifications';
import { pickChatMedia, sendChatMediaMessage, sendMatchVoiceMessage } from '../lib/chatMedia';
import { showAlert, showConfirm } from '../lib/ui';
import { MessageBubble } from '@/components/MessageBubble';
import AssignChoiceModal from '@/components/AssignChoiceModal';

const CATEGORY_LABELS: Record<string, string> = {
  strength: 'Strength', footwork: 'Footwork', endurance: 'Endurance', recovery: 'Recovery',
};
const CATEGORY_ICONS: Record<string, string> = {
  strength: 'dumbbell', footwork: 'footprints', endurance: 'lightning-bolt', recovery: 'heart-pulse',
};
const FEELINGS = ['Bad', 'OK', 'Great'];
const LANDINGS = ['Landed clean', 'A little shaky', 'Missed / stepped down'];

const catTheme = (cat: string) => CategoryTheme[cat as keyof typeof CategoryTheme] ?? { bg: Theme.cardTinted, fg: Theme.eyebrowGreen };

const logChips = (ld: any): string[] => {
  if (!ld) return [];
  const c: string[] = [];
  if (ld.weight) c.push(`${ld.weight}kg`);
  if (ld.sets) c.push(`${ld.sets} sets`);
  if (ld.reps) c.push(`${ld.reps} reps`);
  if (ld.height) c.push(`${ld.height}in`);
  if (ld.time) c.push(`${ld.time} sec`);
  if (ld.duration) c.push(`${ld.duration} min`);
  if (ld.distance) c.push(`${ld.distance}km`);
  if (typeof ld.feeling === 'number' && ld.feeling >= 0) c.push(FEELINGS[ld.feeling] ?? '');
  if (typeof ld.landing === 'number' && ld.landing >= 0) c.push(LANDINGS[ld.landing] ?? '');
  return c.filter(Boolean);
};

const fmtTime = (d: string) => new Date(d).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
const fmtDate = (d: string) => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

type TabKey = 'training' | 'matches' | 'notes';

const TABS: { key: TabKey; label: string; icon: string }[] = [
  { key: 'training', label: 'Training', icon: 'run' },
  { key: 'matches', label: 'Matches', icon: 'clipboard-text' },
  { key: 'notes', label: 'Notes', icon: 'notebook-outline' },
];

export default function CoachPlayerScreen() {
  const { playerId, name } = useLocalSearchParams();
  const [playerName, setPlayerName] = useState((name as string) || 'Player');
  const [sessions, setSessions] = useState<any[]>([]);
  const [assignments, setAssignments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [myId, setMyId] = useState<string | null>(null);
  const myIdRef = useRef<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>('training');
  const [trainingView, setTrainingView] = useState<'assigned' | 'logged'>('assigned');
  const [newActivity, setNewActivity] = useState(0);

  const [msgInputs, setMsgInputs] = useState<Record<string, string>>({});
  const [sending, setSending] = useState<Record<string, boolean>>({});
  const [sendingMedia, setSendingMedia] = useState<Record<string, boolean>>({});
  const [expandedChats, setExpandedChats] = useState<Record<string, boolean>>({});
  const [showAssignChoice, setShowAssignChoice] = useState(false);

  // Shared match/opponent scouting logs
  const [opponentLogs, setOpponentLogs] = useState<any[]>([]);
  const [matchMsgInputs, setMatchMsgInputs] = useState<Record<string, string>>({});
  const [sendingMatchMsg, setSendingMatchMsg] = useState<Record<string, boolean>>({});
  const [expandedMatchChats, setExpandedMatchChats] = useState<Record<string, boolean>>({});
  const [expandedMatches, setExpandedMatches] = useState<Record<string, boolean>>({});
  const [opponentSearch, setOpponentSearch] = useState('');
  const [playingVoiceId, setPlayingVoiceId] = useState<string | null>(null);
  const voiceSoundRef = useRef<Audio.Sound | null>(null);
  const [isRecordingMatchVoice, setIsRecordingMatchVoice] = useState<Record<string, boolean>>({});
  const [matchRecordingDuration, setMatchRecordingDuration] = useState<Record<string, number>>({});
  const matchRecordingRef = useRef<Audio.Recording | null>(null);
  const matchRecordingTimerRef = useRef<any>(null);
  const [sendingMatchVoice, setSendingMatchVoice] = useState<Record<string, boolean>>({});

  // Shared journal entries
  const [journalEntries, setJournalEntries] = useState<any[]>([]);
  const [journalMsgInputs, setJournalMsgInputs] = useState<Record<string, string>>({});
  const [sendingJournalMsg, setSendingJournalMsg] = useState<Record<string, boolean>>({});
  const [expandedJournalChats, setExpandedJournalChats] = useState<Record<string, boolean>>({});
  const [expandedJournalEntries, setExpandedJournalEntries] = useState<Record<string, boolean>>({});

  // Private notes
  const [privateNote, setPrivateNote] = useState('');
  const [savingNote, setSavingNote] = useState(false);
  const noteTimeout = useRef<any>(null);

  // Notes shared with the player — flat list, newest first
  const [sharedNotes, setSharedNotes] = useState<any[]>([]);
  const [deletingSharedNoteId, setDeletingSharedNoteId] = useState<string | null>(null);

  useEffect(() => {
    load();
    const channel = supabase
      .channel('assignment_messages_coach')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'assignment_messages' }, (payload) => {
        if (payload.new.sender_id !== myIdRef.current) {
          loadMessagesOnly();
          refreshUnseenActivity();
        }
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'opponent_log_messages' }, (payload) => {
        if (payload.new.sender_id !== myIdRef.current) {
          loadMatchMessagesOnly();
          refreshUnseenActivity();
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [playerId]);

  useEffect(() => () => { if (voiceSoundRef.current) voiceSoundRef.current.unloadAsync(); }, []);

  const refreshUnseenActivity = async () => {
    const coachId = myIdRef.current;
    if (!coachId || !playerId) return;
    const { data } = await supabase
      .from('notifications').select('id').eq('user_id', coachId).eq('from_user_id', playerId as string).eq('seen', false);
    setNewActivity((data ?? []).length);
  };

  const goBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(coach-tabs)/players' as any);
    }
  };

  const assignWorkout = () => {
    setShowAssignChoice(false);
    router.push({ pathname: '/assign-workout', params: { playerId: playerId as string, name: playerName } });
  };

  const assignWeeklyPlan = () => {
    setShowAssignChoice(false);
    router.push({ pathname: '/assign-weekly-plan', params: { playerId: playerId as string, name: playerName } });
  };

  const load = async () => {
    if (!playerId) { setLoading(false); return; }
    setLoading(true);

    const { data: prof } = await supabase.from('profiles').select('full_name').eq('id', playerId).single();
    if (prof?.full_name) setPlayerName(prof.full_name);

    const { data: sessionData } = await supabase
      .from('session_logs').select('*').eq('user_id', playerId).order('created_at', { ascending: false });
    const rows = sessionData ?? [];
    setSessions(rows);

    const { data: { session } } = await supabase.auth.getSession();
    const coachId = session?.user?.id ?? null;
    setMyId(coachId);
    myIdRef.current = coachId;

    if (coachId) {
      const { data: asgs } = await supabase
        .from('assignments').select('*').eq('coach_id', coachId).eq('player_id', playerId).order('created_at', { ascending: false });
      const asgIds = (asgs ?? []).map((a: any) => a.id);
      const { data: proofs } = asgIds.length > 0 ? await supabase.from('assignment_proof').select('*').in('assignment_id', asgIds) : { data: [] };
      const { data: allMessages } = asgIds.length > 0
        ? await supabase.from('assignment_messages').select('*').in('assignment_id', asgIds).order('created_at', { ascending: true })
        : { data: [] };
      const proofMap: Record<string, any> = {};
      (proofs ?? []).forEach((p: any) => { proofMap[p.assignment_id] = p; });
      const messagesMap: Record<string, any[]> = {};
      (allMessages ?? []).forEach((m: any) => {
        if (!messagesMap[m.assignment_id]) messagesMap[m.assignment_id] = [];
        messagesMap[m.assignment_id].push(m);
      });
      setAssignments((asgs ?? []).map((a: any) => {
        const match = rows.find((s: any) => s.exercise_name === a.title && new Date(s.created_at) >= new Date(a.created_at));
        return { ...a, doneAt: match ? match.created_at : null, doneData: match ? match.log_data : null, proof: proofMap[a.id] ?? null, messages: messagesMap[a.id] ?? [] };
      }));

      // Load private note
      const { data: noteData } = await supabase
        .from('coach_player_notes').select('notes').eq('coach_id', coachId).eq('player_id', playerId as string).maybeSingle();
      if (noteData) setPrivateNote(noteData.notes ?? '');

      // Load notes shared with the player
      const { data: shared } = await supabase
        .from('coach_shared_notes').select('*').eq('coach_id', coachId).eq('player_id', playerId as string).order('created_at', { ascending: false });
      setSharedNotes(shared ?? []);

      // Load shared opponent scouting logs. Note: opponent_name is stored
      // directly on this row (not joined from `opponents`) because the coach
      // doesn't have RLS access to the player's opponents table, which made
      // an embedded `opponents(name)` join silently come back null for them.
      const { data: oppLogs } = await supabase
        .from('opponent_logs')
        .select('*')
        .eq('player_id', playerId as string)
        .eq('shared_with_coach', true)
        .order('created_at', { ascending: false });
      const oppLogIds = (oppLogs ?? []).map((l: any) => l.id);
      const { data: oppLogMsgs } = oppLogIds.length
        ? await supabase.from('opponent_log_messages').select('*').in('opponent_log_id', oppLogIds).order('created_at', { ascending: true })
        : { data: [] };
      const oppLogMsgMap: Record<string, any[]> = {};
      (oppLogMsgs ?? []).forEach((m: any) => {
        if (!oppLogMsgMap[m.opponent_log_id]) oppLogMsgMap[m.opponent_log_id] = [];
        oppLogMsgMap[m.opponent_log_id].push(m);
      });
      setOpponentLogs((oppLogs ?? []).map((l: any) => ({ ...l, messages: oppLogMsgMap[l.id] ?? [] })));

      // Load shared journal entries + their reply threads
      const { data: journal } = await supabase
        .from('journal_entries')
        .select('*')
        .eq('user_id', playerId as string)
        .eq('shared_with_coach', true)
        .order('entry_date', { ascending: false });
      const journalIds = (journal ?? []).map((e: any) => e.id);
      const { data: journalMsgs } = journalIds.length
        ? await supabase.from('journal_entry_messages').select('*').in('journal_entry_id', journalIds).order('created_at', { ascending: true })
        : { data: [] };
      const journalMsgMap: Record<string, any[]> = {};
      (journalMsgs ?? []).forEach((m: any) => {
        if (!journalMsgMap[m.journal_entry_id]) journalMsgMap[m.journal_entry_id] = [];
        journalMsgMap[m.journal_entry_id].push(m);
      });
      setJournalEntries((journal ?? []).map((e: any) => ({ ...e, messages: journalMsgMap[e.id] ?? [] })));

      refreshUnseenActivity();

      // The coach has opened this player's profile — that counts as having
      // seen their activity, so clear the unread badge back on the players list.
      supabase.from('notifications').update({ seen: true })
        .eq('user_id', coachId).eq('from_user_id', playerId as string).eq('seen', false);
    }

    setLoading(false);
  };

  const loadMessagesOnly = async () => {
    const coachId = myIdRef.current;
    if (!coachId || !playerId) return;
    const { data: asgs } = await supabase.from('assignments').select('id').eq('coach_id', coachId).eq('player_id', playerId as string);
    const asgIds = (asgs ?? []).map((a: any) => a.id);
    if (!asgIds.length) return;
    const { data: allMessages } = await supabase.from('assignment_messages').select('*').in('assignment_id', asgIds).order('created_at', { ascending: true });
    const messagesMap: Record<string, any[]> = {};
    (allMessages ?? []).forEach((m: any) => {
      if (!messagesMap[m.assignment_id]) messagesMap[m.assignment_id] = [];
      messagesMap[m.assignment_id].push(m);
    });
    setAssignments(prev => prev.map(a => ({ ...a, messages: messagesMap[a.id] ?? a.messages })));
  };

  const loadMatchMessagesOnly = async () => {
    if (!playerId) return;
    const { data: oppLogs } = await supabase.from('opponent_logs').select('id').eq('player_id', playerId as string).eq('shared_with_coach', true);
    const oppLogIds = (oppLogs ?? []).map((l: any) => l.id);
    if (!oppLogIds.length) return;
    const { data: allMessages } = await supabase.from('opponent_log_messages').select('*').in('opponent_log_id', oppLogIds).order('created_at', { ascending: true });
    const messagesMap: Record<string, any[]> = {};
    (allMessages ?? []).forEach((m: any) => {
      if (!messagesMap[m.opponent_log_id]) messagesMap[m.opponent_log_id] = [];
      messagesMap[m.opponent_log_id].push(m);
    });
    setOpponentLogs(prev => prev.map(l => ({ ...l, messages: messagesMap[l.id] ?? l.messages })));
  };

  const sendMessage = async (assignment: any) => {
    const msg = (msgInputs[assignment.id] ?? '').trim();
    const coachId = myIdRef.current;
    if (!msg || !coachId) return;
    setSending(prev => ({ ...prev, [assignment.id]: true }));
    await supabase.from('assignment_messages').insert({ assignment_id: assignment.id, sender_id: coachId, message: msg });
    await supabase.from('notifications').insert({ user_id: playerId as string, type: 'coach_feedback', assignment_id: assignment.id, from_user_id: coachId });

    // Push notification to player
    const { data: coachProfile } = await supabase.from('profiles').select('full_name').eq('id', coachId).single();
    await notifyCoachMessage(playerId as string, coachProfile?.full_name ?? 'Your coach', msg);
    setMsgInputs(prev => ({ ...prev, [assignment.id]: '' }));
    setSending(prev => ({ ...prev, [assignment.id]: false }));
    setAssignments(prev => prev.map(a =>
      a.id === assignment.id
        ? { ...a, messages: [...a.messages, { id: Date.now().toString(), assignment_id: a.id, sender_id: coachId, message: msg, created_at: new Date().toISOString() }] }
        : a
    ));
  };

  const pickAndSendMedia = async (assignment: any) => {
    const coachId = myIdRef.current;
    if (!coachId) return;
    const picked = await pickChatMedia();
    if (picked.status === 'permission-denied') { showAlert('Permission needed', 'Please allow library access.'); return; }
    if (picked.status === 'cancelled') return;

    setSendingMedia(prev => ({ ...prev, [assignment.id]: true }));
    const result = await sendChatMediaMessage({ assignmentId: assignment.id, senderId: coachId, uri: picked.uri, kind: picked.kind });
    if (!result) { setSendingMedia(prev => ({ ...prev, [assignment.id]: false })); showAlert('Upload failed', 'Please try again.'); return; }
    const { url, mediaType } = result;
    await supabase.from('notifications').insert({ user_id: playerId as string, type: 'coach_feedback', assignment_id: assignment.id, from_user_id: coachId });

    const { data: coachProfile } = await supabase.from('profiles').select('full_name').eq('id', coachId).single();
    await notifyCoachMessage(playerId as string, coachProfile?.full_name ?? 'Your coach', mediaType === 'photo' ? '📷 Sent a photo' : '🎥 Sent a video');
    setSendingMedia(prev => ({ ...prev, [assignment.id]: false }));
    setAssignments(prev => prev.map(a =>
      a.id === assignment.id
        ? { ...a, messages: [...a.messages, { id: Date.now().toString(), assignment_id: a.id, sender_id: coachId, message: '', media_url: url, media_type: mediaType, created_at: new Date().toISOString() }] }
        : a
    ));
  };

  // ── Delete message ──
  const deleteAssignmentMessage = (assignment: any, messageId: string) => {
    const coachId = myIdRef.current;
    if (!coachId) return;
    showConfirm('Delete message', 'Delete this message? This can\'t be undone.', async () => {
      await supabase.from('assignment_messages').delete().eq('id', messageId).eq('sender_id', coachId);
      setAssignments(prev => prev.map(a =>
        a.id === assignment.id ? { ...a, messages: a.messages.filter((m: any) => m.id !== messageId) } : a
      ));
    });
  };

  const deleteMatchMessage = (log: any, messageId: string) => {
    const coachId = myIdRef.current;
    if (!coachId) return;
    showConfirm('Delete message', 'Delete this message? This can\'t be undone.', async () => {
      await supabase.from('opponent_log_messages').delete().eq('id', messageId).eq('sender_id', coachId);
      setOpponentLogs(prev => prev.map(l =>
        l.id === log.id ? { ...l, messages: l.messages.filter((m: any) => m.id !== messageId) } : l
      ));
    });
  };

  const deleteJournalMessage = (entry: any, messageId: string) => {
    const coachId = myIdRef.current;
    if (!coachId) return;
    showConfirm('Delete message', 'Delete this message? This can\'t be undone.', async () => {
      await supabase.from('journal_entry_messages').delete().eq('id', messageId).eq('sender_id', coachId);
      setJournalEntries(prev => prev.map(e =>
        e.id === entry.id ? { ...e, messages: e.messages.filter((m: any) => m.id !== messageId) } : e
      ));
    });
  };

  const saveNote = (text: string) => {
    setPrivateNote(text);
    clearTimeout(noteTimeout.current);
    noteTimeout.current = setTimeout(async () => {
      const coachId = myIdRef.current;
      if (!coachId) return;
      setSavingNote(true);
      await supabase.from('coach_player_notes').upsert({
        coach_id: coachId,
        player_id: playerId as string,
        notes: text,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'coach_id,player_id' });
      setSavingNote(false);
    }, 800);
  };

  const loadSharedNotesOnly = async () => {
    const coachId = myIdRef.current;
    if (!coachId || !playerId) return;
    const { data: shared } = await supabase
      .from('coach_shared_notes').select('*').eq('coach_id', coachId).eq('player_id', playerId as string).order('created_at', { ascending: false });
    setSharedNotes(shared ?? []);
  };

  // Refresh the shared-notes list whenever this screen regains focus — the
  // coach adds notes on a separate pushed screen (coach-shared-note.tsx), so
  // this catches new/edited notes on the way back without a full reload.
  useFocusEffect(useCallback(() => { loadSharedNotesOnly(); }, [playerId]));

  const openNewSharedNote = () => {
    router.push({ pathname: '/coach-shared-note', params: { playerId: playerId as string, name: playerName } });
  };

  const deleteSharedNote = (noteId: string) => {
    showConfirm('Delete note', 'This note will no longer be visible to the player. This can\'t be undone.', async () => {
      setDeletingSharedNoteId(noteId);
      const coachId = myIdRef.current;
      await supabase.from('coach_shared_notes').delete().eq('id', noteId).eq('coach_id', coachId ?? '');
      setSharedNotes(prev => prev.filter(n => n.id !== noteId));
      setDeletingSharedNoteId(null);
    });
  };

  // ── Mark the other person's messages as seen so they can no longer delete them ──
  const markSeen = async (table: string, ids: string[]) => {
    if (!ids.length) return;
    await supabase.from(table).update({ seen_at: new Date().toISOString() }).in('id', ids);
  };

  const toggleChat = (assignment: any) => {
    setExpandedChats(prev => ({ ...prev, [assignment.id]: !prev[assignment.id] }));
    const coachId = myIdRef.current;
    const unseenIds = (assignment.messages ?? []).filter((m: any) => m.sender_id !== coachId && !m.seen_at).map((m: any) => m.id);
    if (!unseenIds.length) return;
    const seenAt = new Date().toISOString();
    markSeen('assignment_messages', unseenIds);
    setAssignments(prev => prev.map(a =>
      a.id === assignment.id ? { ...a, messages: a.messages.map((m: any) => unseenIds.includes(m.id) ? { ...m, seen_at: seenAt } : m) } : a
    ));
  };

  const toggleJournalExpand = (id: string) => {
    setExpandedJournalEntries(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const toggleJournalChat = (entry: any) => {
    setExpandedJournalChats(prev => ({ ...prev, [entry.id]: !prev[entry.id] }));
    const coachId = myIdRef.current;
    const unseenIds = (entry.messages ?? []).filter((m: any) => m.sender_id !== coachId && !m.seen_at).map((m: any) => m.id);
    if (!unseenIds.length) return;
    const seenAt = new Date().toISOString();
    markSeen('journal_entry_messages', unseenIds);
    setJournalEntries(prev => prev.map(e =>
      e.id === entry.id ? { ...e, messages: e.messages.map((m: any) => unseenIds.includes(m.id) ? { ...m, seen_at: seenAt } : m) } : e
    ));
  };

  const sendJournalMessage = async (entry: any) => {
    const msg = (journalMsgInputs[entry.id] ?? '').trim();
    const coachId = myIdRef.current;
    if (!msg || !coachId) return;
    setSendingJournalMsg(prev => ({ ...prev, [entry.id]: true }));
    const { data: inserted, error } = await supabase
      .from('journal_entry_messages').insert({ journal_entry_id: entry.id, sender_id: coachId, message: msg }).select().single();
    setSendingJournalMsg(prev => ({ ...prev, [entry.id]: false }));
    if (error) { showAlert('Error', 'Could not send your message. Please try again.'); return; }

    const { data: coachProfile } = await supabase.from('profiles').select('full_name').eq('id', coachId).single();
    await notifyCoachMessage(playerId as string, coachProfile?.full_name ?? 'Your coach', msg);
    setJournalMsgInputs(prev => ({ ...prev, [entry.id]: '' }));
    setJournalEntries(prev => prev.map(e =>
      e.id === entry.id ? { ...e, messages: [...e.messages, inserted] } : e
    ));
  };

  const toggleMatchExpand = (id: string) => {
    setExpandedMatches(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const playVoiceNote = async (log: any) => {
    if (voiceSoundRef.current) {
      await voiceSoundRef.current.stopAsync();
      await voiceSoundRef.current.unloadAsync();
      voiceSoundRef.current = null;
    }
    if (playingVoiceId === log.id) { setPlayingVoiceId(null); return; }
    const { sound } = await Audio.Sound.createAsync({ uri: log.voice_note_url }, { shouldPlay: true });
    voiceSoundRef.current = sound;
    setPlayingVoiceId(log.id);
    sound.setOnPlaybackStatusUpdate(status => {
      if (status.isLoaded && status.didJustFinish) setPlayingVoiceId(null);
    });
  };

  const toggleMatchChat = (log: any) => {
    setExpandedMatchChats(prev => ({ ...prev, [log.id]: !prev[log.id] }));
    const coachId = myIdRef.current;
    const unseenIds = (log.messages ?? []).filter((m: any) => m.sender_id !== coachId && !m.seen_at).map((m: any) => m.id);
    if (!unseenIds.length) return;
    const seenAt = new Date().toISOString();
    markSeen('opponent_log_messages', unseenIds);
    setOpponentLogs(prev => prev.map(l =>
      l.id === log.id ? { ...l, messages: l.messages.map((m: any) => unseenIds.includes(m.id) ? { ...m, seen_at: seenAt } : m) } : l
    ));
  };

  const sendMatchMessage = async (log: any) => {
    const msg = (matchMsgInputs[log.id] ?? '').trim();
    const coachId = myIdRef.current;
    if (!msg || !coachId) return;
    setSendingMatchMsg(prev => ({ ...prev, [log.id]: true }));
    const { data: inserted, error } = await supabase
      .from('opponent_log_messages').insert({ opponent_log_id: log.id, sender_id: coachId, message: msg }).select().single();
    setSendingMatchMsg(prev => ({ ...prev, [log.id]: false }));
    if (error) { showAlert('Error', 'Could not send your message. Please try again.'); return; }

    const { data: coachProfile } = await supabase.from('profiles').select('full_name').eq('id', coachId).single();
    await notifyMatchCoachFeedback(playerId as string, coachProfile?.full_name ?? 'Your coach', msg);
    setMatchMsgInputs(prev => ({ ...prev, [log.id]: '' }));
    setOpponentLogs(prev => prev.map(l =>
      l.id === log.id ? { ...l, messages: [...l.messages, inserted] } : l
    ));
  };

  const startMatchVoiceRecording = async (logId: string) => {
    try {
      const permission = await Audio.requestPermissionsAsync();
      if (!permission.granted) { showAlert('Permission needed', 'Please allow microphone access to record a voice note.'); return; }
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      const { recording } = await Audio.Recording.createAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      matchRecordingRef.current = recording;
      setIsRecordingMatchVoice(prev => ({ ...prev, [logId]: true }));
      setMatchRecordingDuration(prev => ({ ...prev, [logId]: 0 }));
      matchRecordingTimerRef.current = setInterval(() => {
        setMatchRecordingDuration(prev => ({ ...prev, [logId]: (prev[logId] ?? 0) + 1 }));
      }, 1000);
    } catch {
      showAlert('Error', 'Could not start recording. Please try again.');
    }
  };

  const stopAndSendMatchVoiceRecording = async (log: any) => {
    if (!matchRecordingRef.current) return;
    clearInterval(matchRecordingTimerRef.current);
    setIsRecordingMatchVoice(prev => ({ ...prev, [log.id]: false }));
    const coachId = myIdRef.current;
    try {
      await matchRecordingRef.current.stopAndUnloadAsync();
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false });
      const uri = matchRecordingRef.current.getURI();
      matchRecordingRef.current = null;
      if (!uri || !coachId) { showAlert('Error', 'Recording failed — no audio captured.'); return; }
      const duration = matchRecordingDuration[log.id] ?? 0;
      setSendingMatchVoice(prev => ({ ...prev, [log.id]: true }));
      const result = await sendMatchVoiceMessage({ opponentLogId: log.id, senderId: coachId, uri, durationSeconds: duration });
      setSendingMatchVoice(prev => ({ ...prev, [log.id]: false }));
      if (!result) { showAlert('Upload failed', 'Please try again.'); return; }
      const { data: coachProfile } = await supabase.from('profiles').select('full_name').eq('id', coachId).single();
      await notifyMatchCoachFeedback(playerId as string, coachProfile?.full_name ?? 'Your coach', '🎤 Sent a voice note');
      setOpponentLogs(prev => prev.map(l =>
        l.id === log.id
          ? { ...l, messages: [...l.messages, { id: Date.now().toString(), opponent_log_id: log.id, sender_id: coachId, message: '', media_url: result.url, media_type: 'audio', media_duration_seconds: duration, created_at: new Date().toISOString() }] }
          : l
      ));
    } catch {
      showAlert('Error', 'Could not save recording.');
    }
  };

  // opponentLogs is already ordered most-recent-first, so a Set preserves
  // that order and gives us each opponent's most recent appearance first.
  const recentOpponents = Array.from(new Set(
    opponentLogs.map((l: any) => l.opponent_name).filter(Boolean)
  ));

  const matchQuery = opponentSearch.trim().toLowerCase();
  const filteredLogs = matchQuery
    ? opponentLogs.filter((l: any) => (l.opponent_name ?? '').toLowerCase().includes(matchQuery))
    : opponentLogs;

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <View style={styles.titleRow}>
          <TouchableOpacity onPress={goBack}>
            <Icon name="arrow-left" size={24} color={Theme.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.title}>{playerName}</Text>
        </View>

        {!loading && activeTab === 'training' && (
          <TouchableOpacity
            style={styles.assignBtn}
            onPress={() => setShowAssignChoice(true)}
          >
            <Icon name="clipboard-plus-outline" size={18} color={Theme.limeAccentDark} />
            <Text style={styles.assignBtnText}>Assign</Text>
          </TouchableOpacity>
        )}

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        {loading ? (
          <ActivityIndicator color={Theme.eyebrowGreen} style={{ marginTop: 40 }} />
        ) : activeTab === 'training' ? (
          <>
            <View style={styles.subToggleRow}>
              <TouchableOpacity
                style={[styles.subToggleBtn, trainingView === 'assigned' && styles.subToggleBtnActive]}
                onPress={() => setTrainingView('assigned')}
              >
                <Text style={[styles.subToggleText, trainingView === 'assigned' && styles.subToggleTextActive]}>Assigned</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.subToggleBtn, trainingView === 'logged' && styles.subToggleBtnActive]}
                onPress={() => setTrainingView('logged')}
              >
                <Text style={[styles.subToggleText, trainingView === 'logged' && styles.subToggleTextActive]}>Logged</Text>
              </TouchableOpacity>
            </View>

            {trainingView === 'logged' ? (
              sessions.length === 0 ? (
                <View style={styles.emptyState}>
                  <Icon name="clipboard-text-outline" size={40} color={Theme.textSecondary} />
                  <Text style={styles.emptyDesc}>No sessions logged yet.</Text>
                </View>
              ) : (
                sessions.map((s: any, i: number) => {
                  const cat = catTheme(s.category);
                  return (
                    <View key={i} style={styles.sessionCard}>
                      <View style={[styles.sessionIcon, { backgroundColor: cat.bg }]}>
                        <Icon name={(CATEGORY_ICONS[s.category] ?? 'run') as any} size={18} color={cat.fg} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.sessionName}>{s.exercise_name ?? 'Session'}</Text>
                        <Text style={styles.sessionMeta}>{CATEGORY_LABELS[s.category] ?? s.category} · {fmtDate(s.created_at)}</Text>
                        {logChips(s.log_data).length > 0 && (
                          <View style={styles.chipRow}>
                            {logChips(s.log_data).map((chip, ci) => (
                              <View key={ci} style={styles.chip}><Text style={styles.chipText}>{chip}</Text></View>
                            ))}
                          </View>
                        )}
                      </View>
                    </View>
                  );
                })
              )
            ) : (
              assignments.length === 0 ? (
                <View style={styles.emptyState}>
                  <Icon name="clipboard-plus-outline" size={40} color={Theme.textSecondary} />
                  <Text style={styles.emptyDesc}>No workouts assigned yet.</Text>
                </View>
              ) : (
                assignments.map((a: any) => (
                  <View key={a.id} style={styles.assignCard}>
                    <View style={styles.assignTopRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.assignTitle}>{a.title}</Text>
                        <Text style={styles.assignSub}>
                          {a.doneAt ? `Done · ${fmtDate(a.doneAt)}` : a.proof ? 'Proof submitted' : `Sent ${fmtDate(a.created_at)}`}
                        </Text>
                      </View>
                      {a.doneAt ? (
                        <View style={[styles.doneChip, styles.doneChipYes]}>
                          <Icon name="check-circle" size={14} color={Theme.eyebrowGreen} />
                          <Text style={[styles.doneChipText, styles.doneChipTextYes]}>Done</Text>
                        </View>
                      ) : a.proof ? (
                        <View style={[styles.doneChip, styles.doneChipCompleted]}>
                          <Icon name="check-decagram" size={14} color="#1E8E3E" />
                          <Text style={[styles.doneChipText, styles.doneChipTextCompleted]}>Completed</Text>
                        </View>
                      ) : (
                        <View style={[styles.doneChip, styles.doneChipNo]}>
                          <Icon name="clock-outline" size={14} color={Theme.textSecondary} />
                          <Text style={[styles.doneChipText, styles.doneChipTextNo]}>Not yet</Text>
                        </View>
                      )}
                    </View>
                    {a.doneAt && logChips(a.doneData).length > 0 && (
                      <View style={styles.chipRow}>
                        {logChips(a.doneData).map((chip: string, ci: number) => (
                          <View key={ci} style={styles.chip}><Text style={styles.chipText}>{chip}</Text></View>
                        ))}
                      </View>
                    )}
                    {a.proof && (
                      <View style={styles.proofSection}>
                        <View style={styles.proofLabelRow}>
                          <Icon name="paperclip" size={17} color={Theme.textSecondary} />
                          <Text style={styles.proofLabel}>Proof uploaded</Text>
                        </View>
                        {a.proof.media_type === 'photo' ? (
                          <TouchableOpacity onPress={() => Linking.openURL(a.proof.media_url)}>
                            <Image source={{ uri: a.proof.media_url }} style={styles.proofThumb} resizeMode="cover" />
                            <Text style={styles.proofTap}>Tap to view full size</Text>
                          </TouchableOpacity>
                        ) : (
                          <TouchableOpacity style={styles.videoProof} onPress={() => Linking.openURL(a.proof.media_url)}>
                            <Icon name="play-circle-outline" size={32} color={Theme.eyebrowGreen} />
                            <Text style={styles.videoProofText}>Tap to watch video</Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    )}
                    <TouchableOpacity style={styles.chatToggle} onPress={() => toggleChat(a)}>
                      <Icon name="message-outline" size={15} color={Theme.eyebrowGreen} />
                      <Text style={styles.chatToggleText}>{a.messages.length > 0 ? `Messages (${a.messages.length})` : 'Leave feedback'}</Text>
                      <Icon name={expandedChats[a.id] ? 'chevron-up' : 'chevron-down'} size={16} color={Theme.textSecondary} />
                    </TouchableOpacity>
                    {expandedChats[a.id] && (
                      <>
                        {a.messages.length > 0 && (
                          <View style={styles.chatThread}>
                            {a.messages.map((m: any) => (
                              <MessageBubble
                                key={m.id}
                                isMine={m.sender_id === myIdRef.current}
                                senderLabel={playerName}
                                message={m.message}
                                mediaUrl={m.media_url}
                                mediaType={m.media_type}
                                timeLabel={fmtTime(m.created_at)}
                                onDelete={() => deleteAssignmentMessage(a, m.id)}
                                deletable={!m.seen_at}
                              />
                            ))}
                          </View>
                        )}
                        <View style={styles.inputRow}>
                          <TouchableOpacity style={styles.mediaBtn} onPress={() => pickAndSendMedia(a)} disabled={sendingMedia[a.id]}>
                            {sendingMedia[a.id] ? <ActivityIndicator size="small" color={Theme.eyebrowGreen} /> : <Icon name="image-multiple-outline" size={20} color={Theme.eyebrowGreen} />}
                          </TouchableOpacity>
                          <TextInput style={styles.input} placeholder="Leave feedback or reply..." placeholderTextColor={Theme.textSecondary} value={msgInputs[a.id] ?? ''} onChangeText={(t) => setMsgInputs(prev => ({ ...prev, [a.id]: t }))} multiline />
                          <TouchableOpacity style={[styles.sendBtn, (!msgInputs[a.id]?.trim() || sending[a.id]) && styles.sendBtnDisabled]} onPress={() => sendMessage(a)} disabled={!msgInputs[a.id]?.trim() || sending[a.id]}>
                            {sending[a.id] ? <ActivityIndicator size="small" color="#fff" /> : <Icon name="send" size={16} color="#fff" />}
                          </TouchableOpacity>
                        </View>
                      </>
                    )}
                  </View>
                ))
              )
            )}
          </>
        ) : activeTab === 'matches' ? (
          <>
            {opponentLogs.length === 0 ? (
              <View style={styles.emptyState}>
                <Icon name="clipboard-text-outline" size={40} color={Theme.textSecondary} />
                <Text style={styles.emptyDesc}>No shared matches yet.</Text>
              </View>
            ) : (
              <>
                <View style={styles.searchRow}>
                  <Icon name="magnify" size={20} color={Theme.textSecondary} />
                  <TextInput
                    style={styles.searchInput}
                    placeholder="Search opponent..."
                    placeholderTextColor={Theme.textSecondary}
                    value={opponentSearch}
                    onChangeText={setOpponentSearch}
                  />
                  {opponentSearch.length > 0 && (
                    <TouchableOpacity onPress={() => setOpponentSearch('')}>
                      <Icon name="close-circle" size={18} color={Theme.textSecondary} />
                    </TouchableOpacity>
                  )}
                </View>

                {!opponentSearch && recentOpponents.length > 1 && (
                  <View style={styles.recentOpponentsSection}>
                    <Text style={styles.logSectionLabel}>RECENT OPPONENTS</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                      {recentOpponents.map((oppName) => (
                        <TouchableOpacity key={oppName} style={styles.opponentChip} onPress={() => setOpponentSearch(oppName)}>
                          <Text style={styles.opponentChipText}>{oppName}</Text>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  </View>
                )}

                {filteredLogs.length === 0 ? (
                  <View style={styles.emptyState}>
                    <Icon name="account-search-outline" size={40} color={Theme.textSecondary} />
                    <Text style={styles.emptyDesc}>No matches found for "{opponentSearch}".</Text>
                  </View>
                ) : (
                  filteredLogs.map((log: any) => {
                    const expanded = !!expandedMatches[log.id];
                    return (
                      <View key={log.id} style={styles.matchCard}>
                        <TouchableOpacity style={styles.matchTopRow} onPress={() => toggleMatchExpand(log.id)} activeOpacity={0.7}>
                          <View style={{ flex: 1 }}>
                            <View style={styles.matchNameRow}>
                              <Text style={styles.sessionName}>{log.opponent_name ?? 'Opponent'}</Text>
                              {log.match_type && (
                                <View style={[styles.typeTag, log.match_type === 'singles' ? styles.typeTagSingles : styles.typeTagDoubles]}>
                                  <Text style={[styles.typeTagText, log.match_type === 'singles' ? styles.typeTagTextSingles : styles.typeTagTextDoubles]}>
                                    {log.match_type === 'singles' ? 'Singles' : 'Doubles'}
                                  </Text>
                                </View>
                              )}
                            </View>
                            <Text style={styles.matchDate}>{fmtDate(log.created_at)}</Text>
                          </View>
                          {log.result && log.result !== 'unsure' && (
                            <View style={[styles.resultDot, { backgroundColor: log.result === 'win' ? '#3BB273' : '#E14444' }]} />
                          )}
                          <Icon name={expanded ? 'chevron-up' : 'chevron-down'} size={22} color={Theme.textSecondary} />
                        </TouchableOpacity>

                        {expanded && (
                          <>
                            {log.score && (
                              <View style={styles.scoreResultRow}>
                                <Text style={styles.matchScore}>{log.score}</Text>
                              </View>
                            )}

                            {(log.strengths_tags?.length > 0 || log.strengths_text) && (
                              <View style={styles.logSection}>
                                <Text style={styles.logSectionLabel}>STRENGTHS</Text>
                                {log.strengths_tags?.length > 0 && (
                                  <View style={styles.chipRow}>
                                    {log.strengths_tags.map((t: string) => (
                                      <View key={`s-${t}`} style={[styles.chip, styles.chipStrength]}><Text style={[styles.chipText, styles.chipStrengthText]}>{t}</Text></View>
                                    ))}
                                  </View>
                                )}
                                {log.strengths_text && <Text style={styles.sessionMeta}>{log.strengths_text}</Text>}
                              </View>
                            )}

                            {(log.weaknesses_tags?.length > 0 || log.weaknesses_text) && (
                              <View style={styles.logSection}>
                                <Text style={styles.logSectionLabel}>WEAKNESSES</Text>
                                {log.weaknesses_tags?.length > 0 && (
                                  <View style={styles.chipRow}>
                                    {log.weaknesses_tags.map((t: string) => (
                                      <View key={`w-${t}`} style={[styles.chip, styles.chipWeakness]}><Text style={[styles.chipText, styles.chipWeaknessText]}>{t}</Text></View>
                                    ))}
                                  </View>
                                )}
                                {log.weaknesses_text && <Text style={styles.sessionMeta}>{log.weaknesses_text}</Text>}
                              </View>
                            )}

                            {(log.parent_strengths_text || log.parent_weaknesses_text) && (
                              <View style={styles.logSection}>
                                <Text style={styles.logSectionLabel}>PARENT'S NOTES</Text>
                                {log.parent_strengths_text && <Text style={styles.sessionMeta}>Strengths: {log.parent_strengths_text}</Text>}
                                {log.parent_weaknesses_text && <Text style={styles.sessionMeta}>Weaknesses: {log.parent_weaknesses_text}</Text>}
                              </View>
                            )}

                            {log.next_time_text && (
                              <View style={styles.logSection}>
                                <Text style={styles.logSectionLabel}>NEXT TIME</Text>
                                <Text style={styles.sessionMeta}>{log.next_time_text}</Text>
                              </View>
                            )}

                            {log.video_url && (
                              <TouchableOpacity style={styles.videoLinkRow} onPress={() => Linking.openURL(log.video_url)}>
                                <Icon name="link-variant" size={18} color={Theme.eyebrowGreen} />
                                <Text style={styles.videoLinkText}>Watch match video</Text>
                              </TouchableOpacity>
                            )}
                            {log.voice_note_url && (
                              <TouchableOpacity style={styles.videoLinkRow} onPress={() => playVoiceNote(log)}>
                                <Icon name={playingVoiceId === log.id ? 'pause-circle' : 'play-circle'} size={20} color={Theme.eyebrowGreen} />
                                <Text style={styles.videoLinkText}>Voice note{log.voice_note_duration_seconds ? ` · ${log.voice_note_duration_seconds}s` : ''}</Text>
                              </TouchableOpacity>
                            )}

                            <TouchableOpacity style={styles.chatToggle} onPress={() => toggleMatchChat(log)}>
                              <Icon name="message-outline" size={15} color={Theme.eyebrowGreen} />
                              <Text style={styles.chatToggleText}>{log.messages.length > 0 ? `Messages (${log.messages.length})` : 'Leave feedback'}</Text>
                              <Icon name={expandedMatchChats[log.id] ? 'chevron-up' : 'chevron-down'} size={16} color={Theme.textSecondary} />
                            </TouchableOpacity>
                            {expandedMatchChats[log.id] && (
                              <>
                                {log.messages.length > 0 && (
                                  <View style={styles.chatThread}>
                                    {log.messages.map((m: any) => (
                                      <MessageBubble
                                        key={m.id}
                                        isMine={m.sender_id === myIdRef.current}
                                        senderLabel={playerName}
                                        message={m.message}
                                        mediaUrl={m.media_url}
                                        mediaType={m.media_type}
                                        mediaDurationSeconds={m.media_duration_seconds}
                                        timeLabel={fmtTime(m.created_at)}
                                        onDelete={() => deleteMatchMessage(log, m.id)}
                                        deletable={!m.seen_at}
                                      />
                                    ))}
                                  </View>
                                )}
                                <View style={styles.inputRow}>
                                  <TextInput
                                    style={styles.input}
                                    placeholder={isRecordingMatchVoice[log.id] ? `Recording... ${matchRecordingDuration[log.id] ?? 0}s` : 'Leave feedback on this match...'}
                                    placeholderTextColor={Theme.textSecondary}
                                    value={matchMsgInputs[log.id] ?? ''}
                                    onChangeText={(t) => setMatchMsgInputs(prev => ({ ...prev, [log.id]: t }))}
                                    editable={!isRecordingMatchVoice[log.id]}
                                    multiline
                                  />
                                  <TouchableOpacity
                                    style={[styles.sendBtn, isRecordingMatchVoice[log.id] && styles.sendBtnDisabled]}
                                    onPress={() => isRecordingMatchVoice[log.id] ? stopAndSendMatchVoiceRecording(log) : startMatchVoiceRecording(log.id)}
                                    disabled={sendingMatchVoice[log.id]}
                                  >
                                    {sendingMatchVoice[log.id] ? (
                                      <ActivityIndicator size="small" color="#fff" />
                                    ) : (
                                      <Icon name={isRecordingMatchVoice[log.id] ? 'stop' : 'microphone-outline'} size={16} color="#fff" />
                                    )}
                                  </TouchableOpacity>
                                  <TouchableOpacity
                                    style={[styles.sendBtn, (!matchMsgInputs[log.id]?.trim() || sendingMatchMsg[log.id]) && styles.sendBtnDisabled]}
                                    onPress={() => sendMatchMessage(log)}
                                    disabled={!matchMsgInputs[log.id]?.trim() || sendingMatchMsg[log.id]}
                                  >
                                    {sendingMatchMsg[log.id] ? <ActivityIndicator size="small" color="#fff" /> : <Icon name="send" size={16} color="#fff" />}
                                  </TouchableOpacity>
                                </View>
                              </>
                            )}
                          </>
                        )}
                      </View>
                    );
                  })
                )}
              </>
            )}
          </>
        ) : (
          <>
            <Text style={styles.sectionLabel}>YOUR PRIVATE NOTES</Text>
            <View style={styles.notesCard}>
              <View style={styles.notesHeader}>
                <View style={styles.notesHeaderLeft}>
                  <Icon name="lock-outline" size={16} color={Theme.textSecondary} />
                  <Text style={styles.notesHeaderText}>Only you can see these</Text>
                </View>
                {savingNote && <Text style={styles.savingText}>Saving...</Text>}
              </View>
              <TextInput
                style={styles.notesInput}
                placeholder={`Notes about ${playerName}... (e.g. competing July 20, needs footwork focus, strong backhand)`}
                placeholderTextColor={Theme.textSecondary}
                value={privateNote}
                onChangeText={saveNote}
                multiline
                numberOfLines={10}
                textAlignVertical="top"
              />
            </View>

            <View style={styles.sectionDivider} />
            <View style={styles.sectionLabelRow}>
              <Text style={[styles.sectionLabel, { marginBottom: 0 }]}>NOTES SHARED WITH PLAYER</Text>
              <TouchableOpacity style={styles.addNoteBtn} onPress={openNewSharedNote} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Icon name="plus" size={18} color={Theme.limeAccentDark} />
              </TouchableOpacity>
            </View>

            {sharedNotes.length === 0 ? (
              <View style={styles.emptyState}>
                <Icon name="account-multiple" size={40} color={Theme.textSecondary} />
                <Text style={styles.emptyDesc}>No shared notes yet. Tap + to write one — {playerName} will be able to see it.</Text>
              </View>
            ) : (
              sharedNotes.map((n: any) => (
                <View key={n.id} style={styles.sharedNoteCard}>
                  <Text style={styles.sharedNoteText}>{n.note}</Text>
                  <View style={styles.sharedNoteFooter}>
                    <Text style={styles.sharedNoteDate}>{fmtDate(n.created_at)}</Text>
                    <TouchableOpacity onPress={() => deleteSharedNote(n.id)} disabled={deletingSharedNoteId === n.id} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                      {deletingSharedNoteId === n.id ? (
                        <ActivityIndicator size="small" color={Theme.textSecondary} />
                      ) : (
                        <Icon name="trash-can-outline" size={16} color={Theme.textSecondary} />
                      )}
                    </TouchableOpacity>
                  </View>
                </View>
              ))
            )}

            <View style={styles.sectionDivider} />
            <Text style={styles.sectionLabel}>PLAYER'S SHARED JOURNAL</Text>

            {journalEntries.length === 0 ? (
              <View style={styles.emptyState}>
                <Icon name="school-outline" size={40} color={Theme.textSecondary} />
                <Text style={styles.emptyDesc}>No shared lesson notes yet. Personal journal entries stay private to the player.</Text>
              </View>
            ) : (
              journalEntries.map((entry: any) => {
                const journalExpanded = !!expandedJournalEntries[entry.id];
                return (
                  <View key={entry.id} style={styles.journalCard}>
                    <TouchableOpacity
                      style={styles.journalHeaderRow}
                      onPress={() => toggleJournalExpand(entry.id)}
                      activeOpacity={0.7}
                    >
                      <View style={styles.sessionIcon}>
                        <Icon name="notebook-outline" size={18} color={Theme.eyebrowGreen} />
                      </View>
                      <Text style={[styles.sessionName, { flex: 1 }]}>{fmtDate(`${entry.entry_date}T00:00:00`)}</Text>
                      <Icon name={journalExpanded ? 'chevron-up' : 'chevron-down'} size={22} color={Theme.textSecondary} />
                    </TouchableOpacity>

                    {journalExpanded && (
                      <View style={styles.journalBody}>
                        {entry.soreness_tags?.length > 0 && (
                          <View style={styles.chipRow}>
                            {entry.soreness_tags.map((t: string) => (
                              <View key={t} style={styles.chip}><Text style={styles.chipText}>{t}</Text></View>
                            ))}
                          </View>
                        )}
                        {entry.free_text && <Text style={styles.sessionMeta}>{entry.free_text}</Text>}

                        <TouchableOpacity style={styles.chatToggle} onPress={() => toggleJournalChat(entry)}>
                          <Icon name="message-outline" size={15} color={Theme.eyebrowGreen} />
                          <Text style={styles.chatToggleText}>{entry.messages.length > 0 ? `Messages (${entry.messages.length})` : 'Leave a message'}</Text>
                          <Icon name={expandedJournalChats[entry.id] ? 'chevron-up' : 'chevron-down'} size={16} color={Theme.textSecondary} />
                        </TouchableOpacity>
                        {expandedJournalChats[entry.id] && (
                          <>
                            {entry.messages.length > 0 && (
                              <View style={styles.chatThread}>
                                {entry.messages.map((m: any) => (
                                  <MessageBubble
                                    key={m.id}
                                    isMine={m.sender_id === myIdRef.current}
                                    senderLabel={playerName}
                                    message={m.message}
                                    mediaUrl={null}
                                    mediaType={null}
                                    timeLabel={fmtTime(m.created_at)}
                                    onDelete={() => deleteJournalMessage(entry, m.id)}
                                    deletable={!m.seen_at}
                                  />
                                ))}
                              </View>
                            )}
                            <View style={styles.inputRow}>
                              <TextInput
                                style={styles.input}
                                placeholder="Ask about how they're feeling..."
                                placeholderTextColor={Theme.textSecondary}
                                value={journalMsgInputs[entry.id] ?? ''}
                                onChangeText={(t) => setJournalMsgInputs(prev => ({ ...prev, [entry.id]: t }))}
                                multiline
                              />
                              <TouchableOpacity
                                style={[styles.sendBtn, (!journalMsgInputs[entry.id]?.trim() || sendingJournalMsg[entry.id]) && styles.sendBtnDisabled]}
                                onPress={() => sendJournalMessage(entry)}
                                disabled={!journalMsgInputs[entry.id]?.trim() || sendingJournalMsg[entry.id]}
                              >
                                {sendingJournalMsg[entry.id] ? <ActivityIndicator size="small" color={Theme.limeAccentDark} /> : <Icon name="send" size={16} color={Theme.limeAccentDark} />}
                              </TouchableOpacity>
                            </View>
                          </>
                        )}
                      </View>
                    )}
                  </View>
                );
              })
            )}
          </>
        )}
        </ScrollView>
      </View>

      {!loading && (
        <View style={styles.bottomTabBar}>
          {TABS.map(tab => {
            const active = activeTab === tab.key;
            const showDot = tab.key === 'training' && newActivity > 0;
            const color = active ? Theme.todayBlue : Theme.textMuted;
            return (
              <TouchableOpacity key={tab.key} style={styles.bottomTabItem} onPress={() => setActiveTab(tab.key)}>
                <View>
                  <Icon name={tab.icon as any} size={26} color={color} />
                  {showDot && <View style={styles.bottomTabDot} />}
                </View>
                <Text style={[styles.bottomTabLabel, { color }]}>{tab.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      <AssignChoiceModal
        visible={showAssignChoice}
        onClose={() => setShowAssignChoice(false)}
        onSelectWorkout={assignWorkout}
        onSelectWeeklyPlan={assignWeeklyPlan}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Theme.background },
  content: { flex: 1, padding: 24, paddingTop: 60 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 20 },
  title: { fontFamily: Fonts.serifMedium, fontSize: 30, color: Theme.textPrimary },
  scroll: { paddingBottom: 60 },
  assignBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: Theme.limeAccent, borderRadius: 14, paddingVertical: 17, marginBottom: 18 },
  assignBtnText: { color: Theme.limeAccentDark, fontWeight: 'bold', fontSize: 17 },
  sectionLabel: { fontSize: 11, fontWeight: 'bold', color: Theme.eyebrowGreen, letterSpacing: 1, marginBottom: 12 },
  sectionDivider: { height: 1, backgroundColor: Theme.divider, marginVertical: 20 },
  sectionLabelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  addNoteBtn: { width: 26, height: 26, borderRadius: 13, backgroundColor: Theme.limeAccent, alignItems: 'center', justifyContent: 'center' },
  sharedNoteCard: { backgroundColor: Theme.cardWhite, borderRadius: 14, padding: 16, marginBottom: 12, gap: 10 },
  sharedNoteText: { fontSize: 16, color: Theme.textPrimary, lineHeight: 22 },
  sharedNoteFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sharedNoteDate: { fontSize: 13, color: Theme.textSecondary },

  // Bottom tab bar (matches the app's main tab bar styling)
  bottomTabBar: { flexDirection: 'row', backgroundColor: Theme.background, borderTopColor: Theme.divider, borderTopWidth: 1, height: 96, paddingBottom: 20, paddingTop: 12 },
  bottomTabItem: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 4 },
  bottomTabLabel: { fontSize: 12, fontWeight: '600', marginTop: 2 },
  bottomTabDot: { position: 'absolute', top: -2, right: -6, width: 8, height: 8, borderRadius: 4, backgroundColor: '#FF3B30' },

  // Training sub-toggle (Assigned / Logged)
  subToggleRow: { flexDirection: 'row', backgroundColor: Theme.cardWhite, borderRadius: 12, padding: 5, marginBottom: 18, gap: 5 },
  subToggleBtn: { flex: 1, alignItems: 'center', paddingVertical: 12, borderRadius: 9 },
  subToggleBtnActive: { backgroundColor: Theme.eyebrowGreen },
  subToggleText: { fontSize: 15, fontWeight: '600', color: Theme.textSecondary },
  subToggleTextActive: { color: '#FFFFFF' },

  // Assigned workouts
  assignCard: { backgroundColor: Theme.cardWhite, borderRadius: 18, padding: 20, marginBottom: 16, gap: 14 },
  assignTopRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  assignTitle: { fontSize: 20, fontWeight: '600', color: Theme.textPrimary },
  assignSub: { fontSize: 15, color: Theme.textSecondary, marginTop: 3 },
  doneChip: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 12, paddingHorizontal: 11, paddingVertical: 6 },
  doneChipYes: { backgroundColor: Theme.cardTinted },
  doneChipCompleted: { backgroundColor: '#E3F8E3' },
  doneChipNo: { backgroundColor: Theme.background },
  doneChipText: { fontSize: 14, fontWeight: '600' },
  doneChipTextYes: { color: Theme.eyebrowGreen },
  doneChipTextCompleted: { color: '#1E8E3E' },
  doneChipTextNo: { color: Theme.textSecondary },
  proofSection: { gap: 6 },
  proofLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  proofLabel: { fontSize: 15, color: Theme.textSecondary, fontWeight: '600' },
  proofThumb: { width: '100%', height: 170, borderRadius: 10, backgroundColor: Theme.background },
  proofTap: { fontSize: 15, color: Theme.textSecondary, marginTop: 4, textAlign: 'center' },
  videoProof: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: Theme.cardTinted, borderRadius: 10, padding: 16 },
  videoProofText: { fontSize: 15, color: Theme.eyebrowGreen, fontWeight: '600' },
  chatToggle: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 12, paddingHorizontal: 2, borderTopWidth: 1, borderTopColor: Theme.divider },
  chatToggleText: { flex: 1, fontSize: 16, color: Theme.eyebrowGreen, fontWeight: '600' },
  chatThread: { gap: 6 },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, marginTop: 4 },
  mediaBtn: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: Theme.background, borderWidth: 1, borderColor: Theme.divider },
  input: { flex: 1, backgroundColor: Theme.background, borderRadius: 12, padding: 13, color: Theme.textPrimary, fontSize: 16, borderWidth: 1, borderColor: Theme.divider, maxHeight: 90 },
  sendBtn: { backgroundColor: Theme.limeAccent, borderRadius: 10, width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  sendBtnDisabled: { opacity: 0.4 },

  // Private notes
  notesCard: { backgroundColor: Theme.cardWhite, borderRadius: 16, padding: 18, marginBottom: 4 },
  notesHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  notesHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  notesHeaderText: { fontSize: 14, color: Theme.textSecondary, fontWeight: '600' },
  savingText: { fontSize: 13, color: Theme.textSecondary, fontStyle: 'italic' },
  notesInput: { color: Theme.textPrimary, fontSize: 17, lineHeight: 25, minHeight: 320 },

  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { backgroundColor: Theme.background, borderRadius: 10, paddingHorizontal: 13, paddingVertical: 7, borderWidth: 1, borderColor: Theme.divider },
  chipStrength: { backgroundColor: 'rgba(46,204,113,0.10)', borderWidth: 1, borderColor: 'rgba(30,142,62,0.28)' },
  chipWeakness: { backgroundColor: 'rgba(231,76,60,0.08)', borderWidth: 1, borderColor: 'rgba(192,57,43,0.26)' },
  chipText: { fontSize: 15, color: Theme.textPrimary },
  chipStrengthText: { color: '#1E8E3E', fontWeight: '600' },
  chipWeaknessText: { color: '#C0392B', fontWeight: '600' },
  emptyState: { alignItems: 'center', paddingTop: 40, gap: 10 },
  emptyDesc: { fontSize: 15, color: Theme.textSecondary, textAlign: 'center' },
  sessionCard: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: Theme.cardWhite, borderRadius: 16, padding: 18, marginBottom: 14 },
  sessionIcon: { width: 46, height: 46, borderRadius: 23, backgroundColor: Theme.cardTinted, alignItems: 'center', justifyContent: 'center' },
  sessionName: { fontSize: 19, fontWeight: '600', color: Theme.textPrimary },
  sessionMeta: { fontSize: 15, color: Theme.textSecondary, marginTop: 2 },

  // Journal entries — collapsed to just the date, expand on tap
  journalCard: { backgroundColor: Theme.cardWhite, borderRadius: 16, padding: 18, marginBottom: 14 },
  journalHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  journalBody: { marginTop: 14, gap: 6 },

  // Matches tab
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: Theme.cardWhite, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, marginBottom: 16, borderWidth: 1, borderColor: Theme.divider },
  searchInput: { flex: 1, fontSize: 15, color: Theme.textPrimary },
  recentOpponentsSection: { marginBottom: 18 },
  opponentChip: { backgroundColor: Theme.cardWhite, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8, borderWidth: 1, borderColor: Theme.divider },
  opponentChipText: { fontSize: 14, fontWeight: '600', color: Theme.eyebrowGreen },
  matchCard: { backgroundColor: Theme.cardWhite, borderRadius: 16, padding: 18, marginBottom: 14, gap: 14 },
  matchTopRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  matchNameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  typeTag: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  typeTagSingles: { backgroundColor: Theme.cardTinted },
  typeTagDoubles: { backgroundColor: '#E2EFAE' },
  typeTagText: { fontSize: 12, fontWeight: '600' },
  typeTagTextSingles: { color: '#0C447C' },
  typeTagTextDoubles: { color: '#3B6D11' },
  matchDate: { fontSize: 14, color: Theme.textSecondary, marginTop: 1 },
  matchScore: { fontSize: 21, fontWeight: '700', color: Theme.textPrimary },
  scoreResultRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  resultDot: { width: 16, height: 16, borderRadius: 8 },
  logSection: { gap: 9, paddingTop: 12, borderTopWidth: 1, borderTopColor: Theme.divider },
  logSectionLabel: { fontSize: 12, fontWeight: 'bold', color: Theme.textSecondary, letterSpacing: 1 },
  videoLinkRow: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: Theme.cardTinted, borderRadius: 10, padding: 10 },
  videoLinkText: { fontSize: 13, color: Theme.eyebrowGreen, fontWeight: '600' },
});
