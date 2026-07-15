import { View, StyleSheet, TouchableOpacity, ScrollView, Image, TextInput, Linking, ActivityIndicator } from 'react-native';
import { Text } from '@/components/Text';
import { router, useLocalSearchParams } from 'expo-router';
import { useState, useEffect, useRef } from 'react';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Theme, CategoryTheme, Fonts } from '@/constants/theme';
import { supabase } from '../lib/supabase';
import { notifyCoachMessage } from '../lib/notifications';
import { pickChatMedia, sendChatMediaMessage } from '../lib/chatMedia';
import { showAlert, showConfirm } from '../lib/ui';
import { MessageBubble } from '@/components/MessageBubble';

const CATEGORY_LABELS: Record<string, string> = {
  strength: 'Strength', footwork: 'Footwork', endurance: 'Endurance', recovery: 'Recovery',
};
const CATEGORY_ICONS: Record<string, string> = {
  strength: 'dumbbell', footwork: 'badminton', endurance: 'lightning-bolt', recovery: 'heart-pulse',
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

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

type TabKey = 'overview' | 'training' | 'matches' | 'notes';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'overview', label: 'Overview' },
  { key: 'training', label: 'Training' },
  { key: 'matches', label: 'Matches' },
  { key: 'notes', label: 'Notes' },
];

export default function CoachPlayerScreen() {
  const { playerId, name } = useLocalSearchParams();
  const [playerName, setPlayerName] = useState((name as string) || 'Player');
  const [sessions, setSessions] = useState<any[]>([]);
  const [assignments, setAssignments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [myId, setMyId] = useState<string | null>(null);
  const myIdRef = useRef<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>('overview');
  const [trainingView, setTrainingView] = useState<'assigned' | 'logged'>('assigned');
  const [newActivity, setNewActivity] = useState(0);

  const [progressTrends, setProgressTrends] = useState<Record<string, { values: number[]; unit: string; trend: 'up' | 'down' | 'flat' }>>({});
  const [msgInputs, setMsgInputs] = useState<Record<string, string>>({});
  const [sending, setSending] = useState<Record<string, boolean>>({});
  const [sendingMedia, setSendingMedia] = useState<Record<string, boolean>>({});
  const [expandedChats, setExpandedChats] = useState<Record<string, boolean>>({});

  // Progress snapshot
  const [weekSessions, setWeekSessions] = useState(0);
  const [lastWeekSessions, setLastWeekSessions] = useState(0);
  const [consistency, setConsistency] = useState(0);
  const [categoryBreakdown, setCategoryBreakdown] = useState<Record<string, number>>({});
  const [last7Days, setLast7Days] = useState<boolean[]>(Array(7).fill(false));

  // Shared match/opponent scouting logs
  const [opponentLogs, setOpponentLogs] = useState<any[]>([]);
  const [matchMsgInputs, setMatchMsgInputs] = useState<Record<string, string>>({});
  const [sendingMatchMsg, setSendingMatchMsg] = useState<Record<string, boolean>>({});
  const [expandedMatchChats, setExpandedMatchChats] = useState<Record<string, boolean>>({});

  // Shared journal entries
  const [journalEntries, setJournalEntries] = useState<any[]>([]);
  const [journalMsgInputs, setJournalMsgInputs] = useState<Record<string, string>>({});
  const [sendingJournalMsg, setSendingJournalMsg] = useState<Record<string, boolean>>({});
  const [expandedJournalChats, setExpandedJournalChats] = useState<Record<string, boolean>>({});

  // Private notes
  const [privateNote, setPrivateNote] = useState('');
  const [savingNote, setSavingNote] = useState(false);
  const noteTimeout = useRef<any>(null);

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

  const refreshUnseenActivity = async () => {
    const coachId = myIdRef.current;
    if (!coachId || !playerId) return;
    const { data } = await supabase
      .from('notifications').select('id').eq('user_id', coachId).eq('from_user_id', playerId as string).eq('seen', false);
    setNewActivity((data ?? []).length);
  };

  const goBack = () => {
    router.back();
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

    // Progress snapshot calculations
    const now = new Date();
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - ((now.getDay() + 6) % 7));
    startOfWeek.setHours(0, 0, 0, 0);
    const startOfLastWeek = new Date(startOfWeek);
    startOfLastWeek.setDate(startOfLastWeek.getDate() - 7);

    const thisWeek = rows.filter((s: any) => new Date(s.created_at) >= startOfWeek);
    const lastWeek = rows.filter((s: any) => new Date(s.created_at) >= startOfLastWeek && new Date(s.created_at) < startOfWeek);
    setWeekSessions(new Set(thisWeek.map((s: any) => new Date(s.created_at).toDateString())).size);
    setLastWeekSessions(new Set(lastWeek.map((s: any) => new Date(s.created_at).toDateString())).size);

    // Last 30 days consistency
    const last30 = new Date(); last30.setDate(last30.getDate() - 30);
    const activeDays = new Set(rows.filter((s: any) => new Date(s.created_at) >= last30).map((s: any) => new Date(s.created_at).toDateString())).size;
    setConsistency(Math.round((activeDays / 30) * 100));

    // Category breakdown
    const breakdown: Record<string, number> = {};
    rows.slice(0, 20).forEach((s: any) => {
      breakdown[s.category] = (breakdown[s.category] || 0) + 1;
    });
    setCategoryBreakdown(breakdown);

    // Last 7 days bar chart
    const last7 = Array(7).fill(false).map((_, i) => {
      const d = new Date(); d.setDate(d.getDate() - (6 - i)); d.setHours(0, 0, 0, 0);
      const next = new Date(d); next.setDate(next.getDate() + 1);
      return rows.some((s: any) => { const sd = new Date(s.created_at); return sd >= d && sd < next; });
    });
    setLast7Days(last7);

    // ── Progress trends per exercise ──
    const trendMap: Record<string, { values: number[]; unit: string; trend: 'up' | 'down' | 'flat' }> = {};
    rows.forEach((s: any) => {
      const ld = s.log_data; if (!ld) return;
      const key = s.exercise_name;
      let val = 0; let unit = '';
      if (ld.weight) { val = parseFloat(ld.weight) || 0; unit = 'kg'; }
      else if (ld.height) { val = parseFloat(ld.height) || 0; unit = 'in'; }
      else if (ld.reps) { val = parseInt(ld.reps) || 0; unit = 'reps'; }
      else if (ld.time) { val = parseInt(ld.time) || 0; unit = 'sec'; }
      else if (ld.duration) { val = parseInt(ld.duration) || 0; unit = 'min'; }
      if (val === 0) return;
      if (!trendMap[key]) trendMap[key] = { values: [], unit, trend: 'flat' };
      trendMap[key].values.push(val);
    });
    Object.keys(trendMap).forEach(key => {
      const t = trendMap[key];
      if (t.values.length < 2) return;
      const recent = t.values.slice(0, Math.min(3, t.values.length));
      const older = t.values.slice(-Math.min(3, t.values.length));
      const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
      const olderAvg = older.reduce((a, b) => a + b, 0) / older.length;
      if (recentAvg > olderAvg * 1.05) t.trend = 'up';
      else if (recentAvg < olderAvg * 0.95) t.trend = 'down';
      else t.trend = 'flat';
    });
    setProgressTrends(Object.fromEntries(Object.entries(trendMap).filter(([_, t]) => t.values.length >= 2)));

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
        .from('coach_player_notes').select('note').eq('coach_id', coachId).eq('player_id', playerId as string).single();
      if (noteData) setPrivateNote(noteData.note ?? '');

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
        note: text,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'coach_id,player_id' });
      setSavingNote(false);
    }, 800);
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
    await notifyCoachMessage(playerId as string, coachProfile?.full_name ?? 'Your coach', msg);
    setMatchMsgInputs(prev => ({ ...prev, [log.id]: '' }));
    setOpponentLogs(prev => prev.map(l =>
      l.id === log.id ? { ...l, messages: [...l.messages, inserted] } : l
    ));
  };

  const weekDiff = weekSessions - lastWeekSessions;
  const totalRecent = Object.values(categoryBreakdown).reduce((a, b) => a + b, 0);

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <View style={styles.titleRow}>
          <TouchableOpacity onPress={goBack}>
            <MaterialCommunityIcons name="arrow-left" size={24} color={Theme.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.title}>{playerName}</Text>
        </View>

        {!loading && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.topTabScroll} contentContainerStyle={styles.topTabRow}>
            {TABS.map(tab => {
              const active = activeTab === tab.key;
              const showDot = tab.key === 'training' && newActivity > 0;
              return (
                <TouchableOpacity
                  key={tab.key}
                  style={[styles.topTabPill, active && styles.topTabPillActive]}
                  onPress={() => setActiveTab(tab.key)}
                >
                  <Text style={[styles.topTabPillText, active && styles.topTabPillTextActive]}>{tab.label}</Text>
                  {showDot && <View style={styles.topTabDot} />}
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        )}

        {!loading && (activeTab === 'overview' || activeTab === 'training') && (
          <TouchableOpacity
            style={styles.assignBtn}
            onPress={() => router.push({ pathname: '/assign-workout', params: { playerId: playerId as string, name: playerName } })}
          >
            <MaterialCommunityIcons name="clipboard-plus-outline" size={18} color={Theme.limeAccentDark} />
            <Text style={styles.assignBtnText}>Assign Workout</Text>
          </TouchableOpacity>
        )}

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        {loading ? (
          <ActivityIndicator color={Theme.eyebrowGreen} style={{ marginTop: 40 }} />
        ) : activeTab === 'overview' ? (
          <>
            <View style={styles.snapshotCard}>

              {/* Top stats row */}
              <View style={styles.snapshotRow}>
                <View style={styles.snapshotStat}>
                  <Text style={styles.snapshotNum}>{weekSessions}</Text>
                  <Text style={styles.snapshotLabel}>This week</Text>
                  {weekDiff !== 0 && (
                    <View style={[styles.weekDiffChip, weekDiff > 0 ? styles.weekDiffUp : styles.weekDiffDown]}>
                      <MaterialCommunityIcons name={weekDiff > 0 ? 'trending-up' : 'trending-down'} size={12} color={weekDiff > 0 ? '#2ECC71' : '#FF6B6B'} />
                      <Text style={[styles.weekDiffText, { color: weekDiff > 0 ? '#2ECC71' : '#FF6B6B' }]}>
                        {weekDiff > 0 ? '+' : ''}{weekDiff} vs last week
                      </Text>
                    </View>
                  )}
                </View>
                <View style={styles.snapshotDivider} />
                <View style={styles.snapshotStat}>
                  <Text style={styles.snapshotNum}>{consistency}%</Text>
                  <Text style={styles.snapshotLabel}>30-day consistency</Text>
                  <View style={styles.consistencyBar}>
                    <View style={[styles.consistencyFill, { width: `${consistency}%`, backgroundColor: consistency >= 70 ? '#2ECC71' : consistency >= 40 ? '#E67E22' : '#FF6B6B' }]} />
                  </View>
                </View>
              </View>

              {/* 7-day chart */}
              <View style={styles.chartSection}>
                <Text style={styles.chartLabel}>LAST 7 DAYS</Text>
                <View style={styles.chartRow}>
                  {last7Days.map((active, i) => {
                    const d = new Date(); d.setDate(d.getDate() - (6 - i));
                    const dayName = DAYS[(d.getDay() + 6) % 7];
                    return (
                      <View key={i} style={styles.chartCol}>
                        <View style={[styles.chartBar, active && styles.chartBarActive]} />
                        <Text style={[styles.chartDayLabel, active && styles.chartDayLabelActive]}>{dayName}</Text>
                      </View>
                    );
                  })}
                </View>
              </View>

              {/* Category breakdown */}
              {totalRecent > 0 && (
                <View style={styles.breakdownSection}>
                  <Text style={styles.chartLabel}>CATEGORY BREAKDOWN (last 20 sessions)</Text>
                  {Object.entries(categoryBreakdown).sort((a, b) => b[1] - a[1]).map(([cat, count]) => (
                    <View key={cat} style={styles.breakdownRow}>
                      <Text style={styles.breakdownCat}>{CATEGORY_LABELS[cat] ?? cat}</Text>
                      <View style={styles.breakdownTrack}>
                        <View style={[styles.breakdownFill, { width: `${(count / totalRecent) * 100}%`, backgroundColor: catTheme(cat).fg }]} />
                      </View>
                      <Text style={styles.breakdownCount}>{count}</Text>
                    </View>
                  ))}
                </View>
              )}

              {/* Progress trends */}
              {Object.keys(progressTrends).length > 0 && (
                <View style={styles.breakdownSection}>
                  <Text style={styles.chartLabel}>EXERCISE TRENDS</Text>
                  {Object.entries(progressTrends).slice(0, 6).map(([exName, t]) => (
                    <View key={exName} style={styles.trendRow}>
                      <Text style={styles.trendName} numberOfLines={1}>{exName}</Text>
                      <Text style={styles.trendBest}>
                        {Math.max(...t.values)}{t.unit}
                      </Text>
                      <View style={[styles.trendChip,
                        t.trend === 'up' ? styles.trendUp : t.trend === 'down' ? styles.trendDown : styles.trendFlat
                      ]}>
                        <MaterialCommunityIcons
                          name={t.trend === 'up' ? 'trending-up' : t.trend === 'down' ? 'trending-down' : 'trending-neutral'}
                          size={13}
                          color={t.trend === 'up' ? '#2ECC71' : t.trend === 'down' ? '#FF6B6B' : Theme.textSecondary}
                        />
                        <Text style={[styles.trendChipText,
                          { color: t.trend === 'up' ? '#2ECC71' : t.trend === 'down' ? '#FF6B6B' : Theme.textSecondary }
                        ]}>
                          {t.trend === 'up' ? 'Improving' : t.trend === 'down' ? 'Declining' : 'Consistent'}
                        </Text>
                      </View>
                    </View>
                  ))}
                </View>
              )}
            </View>

          </>
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
                  <MaterialCommunityIcons name="clipboard-text-outline" size={40} color={Theme.textSecondary} />
                  <Text style={styles.emptyDesc}>No sessions logged yet.</Text>
                </View>
              ) : (
                sessions.map((s: any, i: number) => {
                  const cat = catTheme(s.category);
                  return (
                    <View key={i} style={styles.sessionCard}>
                      <View style={[styles.sessionIcon, { backgroundColor: cat.bg }]}>
                        <MaterialCommunityIcons name={(CATEGORY_ICONS[s.category] ?? 'run') as any} size={18} color={cat.fg} />
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
                  <MaterialCommunityIcons name="clipboard-plus-outline" size={40} color={Theme.textSecondary} />
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
                          <MaterialCommunityIcons name="check-circle" size={14} color={Theme.eyebrowGreen} />
                          <Text style={[styles.doneChipText, styles.doneChipTextYes]}>Done</Text>
                        </View>
                      ) : a.proof ? (
                        <View style={[styles.doneChip, styles.doneChipCompleted]}>
                          <MaterialCommunityIcons name="check-decagram" size={14} color="#1E8E3E" />
                          <Text style={[styles.doneChipText, styles.doneChipTextCompleted]}>Completed</Text>
                        </View>
                      ) : (
                        <View style={[styles.doneChip, styles.doneChipNo]}>
                          <MaterialCommunityIcons name="clock-outline" size={14} color={Theme.textSecondary} />
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
                          <MaterialCommunityIcons name="paperclip" size={17} color={Theme.textSecondary} />
                          <Text style={styles.proofLabel}>Proof uploaded</Text>
                        </View>
                        {a.proof.media_type === 'photo' ? (
                          <TouchableOpacity onPress={() => Linking.openURL(a.proof.media_url)}>
                            <Image source={{ uri: a.proof.media_url }} style={styles.proofThumb} resizeMode="cover" />
                            <Text style={styles.proofTap}>Tap to view full size</Text>
                          </TouchableOpacity>
                        ) : (
                          <TouchableOpacity style={styles.videoProof} onPress={() => Linking.openURL(a.proof.media_url)}>
                            <MaterialCommunityIcons name="play-circle-outline" size={32} color={Theme.eyebrowGreen} />
                            <Text style={styles.videoProofText}>Tap to watch video</Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    )}
                    <TouchableOpacity style={styles.chatToggle} onPress={() => toggleChat(a)}>
                      <MaterialCommunityIcons name="message-outline" size={15} color={Theme.eyebrowGreen} />
                      <Text style={styles.chatToggleText}>{a.messages.length > 0 ? `Messages (${a.messages.length})` : 'Leave feedback'}</Text>
                      <MaterialCommunityIcons name={expandedChats[a.id] ? 'chevron-up' : 'chevron-down'} size={16} color={Theme.textSecondary} />
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
                            {sendingMedia[a.id] ? <ActivityIndicator size="small" color={Theme.eyebrowGreen} /> : <MaterialCommunityIcons name="image-multiple-outline" size={20} color={Theme.eyebrowGreen} />}
                          </TouchableOpacity>
                          <TextInput style={styles.input} placeholder="Leave feedback or reply..." placeholderTextColor={Theme.textSecondary} value={msgInputs[a.id] ?? ''} onChangeText={(t) => setMsgInputs(prev => ({ ...prev, [a.id]: t }))} multiline />
                          <TouchableOpacity style={[styles.sendBtn, (!msgInputs[a.id]?.trim() || sending[a.id]) && styles.sendBtnDisabled]} onPress={() => sendMessage(a)} disabled={!msgInputs[a.id]?.trim() || sending[a.id]}>
                            {sending[a.id] ? <ActivityIndicator size="small" color="#fff" /> : <MaterialCommunityIcons name="send" size={16} color="#fff" />}
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
                <MaterialCommunityIcons name="clipboard-text-outline" size={40} color={Theme.textSecondary} />
                <Text style={styles.emptyDesc}>No shared matches yet.</Text>
              </View>
            ) : (
              opponentLogs.map((log: any) => (
                <View key={log.id} style={styles.matchCard}>
                  <View style={styles.matchTopRow}>
                    <Text style={styles.sessionName}>{log.opponent_name ?? 'Opponent'}</Text>
                    <Text style={styles.matchDate}>{fmtDate(log.created_at)}</Text>
                  </View>

                  <View style={styles.scoreResultRow}>
                    {log.score && <Text style={styles.matchScore}>{log.score}</Text>}
                    {log.result && log.result !== 'unsure' && (
                      <View style={[styles.resultBadge, { backgroundColor: log.result === 'win' ? 'rgba(46,204,113,0.15)' : 'rgba(255,107,107,0.15)' }]}>
                        <MaterialCommunityIcons name={log.result === 'win' ? 'trophy-outline' : 'close-circle-outline'} size={13} color={log.result === 'win' ? Theme.eyebrowGreen : '#FF6B6B'} />
                        <Text style={[styles.resultBadgeText, { color: log.result === 'win' ? Theme.eyebrowGreen : '#FF6B6B' }]}>
                          {log.result === 'win' ? 'Win' : 'Loss'}
                        </Text>
                      </View>
                    )}
                  </View>

                  {(log.strengths_tags?.length > 0 || log.strengths_text) && (
                    <View style={styles.logSection}>
                      <Text style={styles.logSectionLabel}>STRENGTHS</Text>
                      {log.strengths_tags?.length > 0 && (
                        <View style={styles.chipRow}>
                          {log.strengths_tags.map((t: string) => (
                            <View key={`s-${t}`} style={[styles.chip, styles.chipStrength]}><Text style={styles.chipText}>{t}</Text></View>
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
                            <View key={`w-${t}`} style={[styles.chip, styles.chipWeakness]}><Text style={styles.chipText}>{t}</Text></View>
                          ))}
                        </View>
                      )}
                      {log.weaknesses_text && <Text style={styles.sessionMeta}>{log.weaknesses_text}</Text>}
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
                      <MaterialCommunityIcons name="link-variant" size={18} color={Theme.eyebrowGreen} />
                      <Text style={styles.videoLinkText}>Watch match video</Text>
                    </TouchableOpacity>
                  )}

                  <TouchableOpacity style={styles.chatToggle} onPress={() => toggleMatchChat(log)}>
                    <MaterialCommunityIcons name="message-outline" size={15} color={Theme.eyebrowGreen} />
                    <Text style={styles.chatToggleText}>{log.messages.length > 0 ? `Messages (${log.messages.length})` : 'Leave feedback'}</Text>
                    <MaterialCommunityIcons name={expandedMatchChats[log.id] ? 'chevron-up' : 'chevron-down'} size={16} color={Theme.textSecondary} />
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
                              mediaUrl={null}
                              mediaType={null}
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
                          placeholder="Leave feedback on this match..."
                          placeholderTextColor={Theme.textSecondary}
                          value={matchMsgInputs[log.id] ?? ''}
                          onChangeText={(t) => setMatchMsgInputs(prev => ({ ...prev, [log.id]: t }))}
                          multiline
                        />
                        <TouchableOpacity
                          style={[styles.sendBtn, (!matchMsgInputs[log.id]?.trim() || sendingMatchMsg[log.id]) && styles.sendBtnDisabled]}
                          onPress={() => sendMatchMessage(log)}
                          disabled={!matchMsgInputs[log.id]?.trim() || sendingMatchMsg[log.id]}
                        >
                          {sendingMatchMsg[log.id] ? <ActivityIndicator size="small" color="#fff" /> : <MaterialCommunityIcons name="send" size={16} color="#fff" />}
                        </TouchableOpacity>
                      </View>
                    </>
                  )}
                </View>
              ))
            )}
          </>
        ) : (
          <>
            <Text style={styles.sectionLabel}>YOUR PRIVATE NOTES</Text>
            <View style={styles.notesCard}>
              <View style={styles.notesHeader}>
                <View style={styles.notesHeaderLeft}>
                  <MaterialCommunityIcons name="lock-outline" size={16} color={Theme.textSecondary} />
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
            <Text style={styles.sectionLabel}>SHARED JOURNAL ENTRIES</Text>

            {journalEntries.length === 0 ? (
              <View style={styles.emptyState}>
                <MaterialCommunityIcons name="notebook-outline" size={40} color={Theme.textSecondary} />
                <Text style={styles.emptyDesc}>No shared journal entries yet.</Text>
              </View>
            ) : (
              journalEntries.map((entry: any) => (
                <View key={entry.id} style={styles.sessionCard}>
                  <View style={styles.sessionIcon}>
                    <MaterialCommunityIcons name="notebook-outline" size={18} color={Theme.eyebrowGreen} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.sessionName}>{fmtDate(`${entry.entry_date}T00:00:00`)}</Text>
                    {entry.soreness_tags?.length > 0 && (
                      <View style={styles.chipRow}>
                        {entry.soreness_tags.map((t: string) => (
                          <View key={t} style={styles.chip}><Text style={styles.chipText}>{t}</Text></View>
                        ))}
                      </View>
                    )}
                    {entry.free_text && <Text style={styles.sessionMeta}>{entry.free_text}</Text>}

                    <TouchableOpacity style={styles.chatToggle} onPress={() => toggleJournalChat(entry)}>
                      <MaterialCommunityIcons name="message-outline" size={15} color={Theme.eyebrowGreen} />
                      <Text style={styles.chatToggleText}>{entry.messages.length > 0 ? `Messages (${entry.messages.length})` : 'Leave a message'}</Text>
                      <MaterialCommunityIcons name={expandedJournalChats[entry.id] ? 'chevron-up' : 'chevron-down'} size={16} color={Theme.textSecondary} />
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
                            {sendingJournalMsg[entry.id] ? <ActivityIndicator size="small" color={Theme.limeAccentDark} /> : <MaterialCommunityIcons name="send" size={16} color={Theme.limeAccentDark} />}
                          </TouchableOpacity>
                        </View>
                      </>
                    )}
                  </View>
                </View>
              ))
            )}
          </>
        )}
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Theme.background },
  content: { flex: 1, padding: 24, paddingTop: 60 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 20 },
  title: { fontFamily: Fonts.serifMedium, fontSize: 24, color: Theme.textPrimary },
  scroll: { paddingBottom: 60 },
  assignBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: Theme.limeAccent, borderRadius: 12, paddingVertical: 14, marginBottom: 16 },
  assignBtnText: { color: Theme.limeAccentDark, fontWeight: 'bold', fontSize: 15 },
  sectionLabel: { fontSize: 11, fontWeight: 'bold', color: Theme.eyebrowGreen, letterSpacing: 1, marginBottom: 12 },
  sectionDivider: { height: 1, backgroundColor: Theme.divider, marginVertical: 20 },

  // Top segmented tab bar
  topTabScroll: { flexGrow: 0, marginBottom: 16 },
  topTabRow: { flexDirection: 'row', gap: 8 },
  topTabPill: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingVertical: 9, borderRadius: 20, backgroundColor: Theme.cardWhite, borderWidth: 1, borderColor: Theme.divider },
  topTabPillActive: { backgroundColor: Theme.eyebrowGreen, borderColor: Theme.eyebrowGreen },
  topTabPillText: { fontSize: 13, fontWeight: '600', color: Theme.textSecondary },
  topTabPillTextActive: { color: '#FFFFFF' },
  topTabDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#FF3B30' },

  // Training sub-toggle (Assigned / Logged)
  subToggleRow: { flexDirection: 'row', backgroundColor: Theme.cardWhite, borderRadius: 10, padding: 4, marginBottom: 16, gap: 4 },
  subToggleBtn: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 8 },
  subToggleBtnActive: { backgroundColor: Theme.eyebrowGreen },
  subToggleText: { fontSize: 13, fontWeight: '600', color: Theme.textSecondary },
  subToggleTextActive: { color: '#FFFFFF' },

  // Progress snapshot
  snapshotCard: { backgroundColor: Theme.cardWhite, borderRadius: 16, padding: 16, marginBottom: 24, gap: 16 },
  snapshotRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 16 },
  snapshotStat: { flex: 1, gap: 4 },
  snapshotNum: { fontSize: 32, fontWeight: 'bold', color: Theme.textPrimary },
  snapshotLabel: { fontSize: 13, color: Theme.textSecondary },
  snapshotDivider: { width: 1, backgroundColor: Theme.divider, alignSelf: 'stretch' },
  weekDiffChip: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4, alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  weekDiffUp: { backgroundColor: 'rgba(46,204,113,0.15)' },
  weekDiffDown: { backgroundColor: 'rgba(231,76,60,0.15)' },
  weekDiffText: { fontSize: 12, fontWeight: '600' },
  consistencyBar: { height: 6, backgroundColor: Theme.background, borderRadius: 3, overflow: 'hidden', marginTop: 6 },
  consistencyFill: { height: '100%', borderRadius: 3 },

  // 7-day chart
  chartSection: { gap: 8 },
  chartLabel: { fontSize: 11, fontWeight: 'bold', color: Theme.textSecondary, letterSpacing: 1 },
  chartRow: { flexDirection: 'row', gap: 6, alignItems: 'flex-end', height: 50 },
  chartCol: { flex: 1, alignItems: 'center', gap: 4, justifyContent: 'flex-end' },
  chartBar: { width: '100%', height: 32, borderRadius: 6, backgroundColor: Theme.background },
  chartBarActive: { backgroundColor: Theme.eyebrowGreen },
  chartDayLabel: { fontSize: 12, color: Theme.textSecondary, fontWeight: '600' },
  chartDayLabelActive: { color: Theme.eyebrowGreen },

  // Category breakdown
  breakdownSection: { gap: 8 },
  breakdownRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  breakdownCat: { width: 72, fontSize: 13, color: Theme.textSecondary },
  breakdownTrack: { flex: 1, height: 8, backgroundColor: Theme.background, borderRadius: 4, overflow: 'hidden' },
  breakdownFill: { height: '100%', borderRadius: 4 },
  breakdownCount: { width: 24, fontSize: 13, color: Theme.textPrimary, fontWeight: '600', textAlign: 'right' },

  // Trends
  trendRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 5 },
  trendName: { flex: 1, fontSize: 13, color: Theme.textPrimary, fontWeight: '500' },
  trendBest: { fontSize: 13, fontWeight: '700', color: Theme.eyebrowGreen, minWidth: 40, textAlign: 'right' },
  trendChip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  trendUp: { backgroundColor: 'rgba(46,204,113,0.12)' },
  trendDown: { backgroundColor: 'rgba(231,76,60,0.12)' },
  trendFlat: { backgroundColor: Theme.background },
  trendChipText: { fontSize: 12, fontWeight: '600' },

  // Assigned workouts
  assignCard: { backgroundColor: Theme.cardWhite, borderRadius: 14, padding: 14, marginBottom: 12, gap: 10 },
  assignTopRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  assignTitle: { fontSize: 16, fontWeight: '600', color: Theme.textPrimary },
  assignSub: { fontSize: 13, color: Theme.textSecondary, marginTop: 2 },
  doneChip: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 4 },
  doneChipYes: { backgroundColor: Theme.cardTinted },
  doneChipCompleted: { backgroundColor: '#E3F8E3' },
  doneChipNo: { backgroundColor: Theme.background },
  doneChipText: { fontSize: 12, fontWeight: '600' },
  doneChipTextYes: { color: Theme.eyebrowGreen },
  doneChipTextCompleted: { color: '#1E8E3E' },
  doneChipTextNo: { color: Theme.textSecondary },
  proofSection: { gap: 6 },
  proofLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  proofLabel: { fontSize: 13, color: Theme.textSecondary, fontWeight: '600' },
  proofThumb: { width: '100%', height: 160, borderRadius: 10, backgroundColor: Theme.background },
  proofTap: { fontSize: 13, color: Theme.textSecondary, marginTop: 4, textAlign: 'center' },
  videoProof: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: Theme.cardTinted, borderRadius: 10, padding: 14 },
  videoProofText: { fontSize: 13, color: Theme.eyebrowGreen, fontWeight: '600' },
  chatToggle: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8, paddingHorizontal: 2, borderTopWidth: 1, borderTopColor: Theme.divider },
  chatToggleText: { flex: 1, fontSize: 13, color: Theme.eyebrowGreen, fontWeight: '600' },
  chatThread: { gap: 6 },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, marginTop: 4 },
  mediaBtn: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: Theme.background, borderWidth: 1, borderColor: Theme.divider },
  input: { flex: 1, backgroundColor: Theme.background, borderRadius: 10, padding: 10, color: Theme.textPrimary, fontSize: 14, borderWidth: 1, borderColor: Theme.divider, maxHeight: 80 },
  sendBtn: { backgroundColor: Theme.limeAccent, borderRadius: 10, width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  sendBtnDisabled: { opacity: 0.4 },

  // Private notes
  notesCard: { backgroundColor: Theme.cardWhite, borderRadius: 14, padding: 14, marginBottom: 4 },
  notesHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  notesHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  notesHeaderText: { fontSize: 13, color: Theme.textSecondary, fontWeight: '600' },
  savingText: { fontSize: 13, color: Theme.textSecondary, fontStyle: 'italic' },
  notesInput: { color: Theme.textPrimary, fontSize: 15, lineHeight: 20, minHeight: 220 },

  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { backgroundColor: Theme.background, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: Theme.divider },
  chipStrength: { backgroundColor: 'rgba(46,204,113,0.14)', borderColor: 'transparent' },
  chipWeakness: { backgroundColor: 'rgba(231,76,60,0.12)', borderColor: 'transparent' },
  chipText: { fontSize: 13, color: Theme.textPrimary },
  emptyState: { alignItems: 'center', paddingTop: 40, gap: 10 },
  emptyDesc: { fontSize: 15, color: Theme.textSecondary, textAlign: 'center' },
  sessionCard: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: Theme.cardWhite, borderRadius: 12, padding: 14, marginBottom: 10 },
  sessionIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: Theme.cardTinted, alignItems: 'center', justifyContent: 'center' },
  sessionName: { fontSize: 16, fontWeight: '600', color: Theme.textPrimary },
  sessionMeta: { fontSize: 13, color: Theme.textSecondary, marginTop: 1 },

  // Matches tab
  matchCard: { backgroundColor: Theme.cardWhite, borderRadius: 14, padding: 14, marginBottom: 12, gap: 10 },
  matchTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  matchDate: { fontSize: 13, color: Theme.textSecondary },
  matchScore: { fontSize: 16, fontWeight: '600', color: Theme.textPrimary },
  scoreResultRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  resultBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 },
  resultBadgeText: { fontSize: 13, fontWeight: '700' },
  logSection: { gap: 6, paddingTop: 6, borderTopWidth: 1, borderTopColor: Theme.divider },
  logSectionLabel: { fontSize: 11, fontWeight: 'bold', color: Theme.textSecondary, letterSpacing: 1 },
  videoLinkRow: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: Theme.cardTinted, borderRadius: 10, padding: 10 },
  videoLinkText: { fontSize: 13, color: Theme.eyebrowGreen, fontWeight: '600' },
});
