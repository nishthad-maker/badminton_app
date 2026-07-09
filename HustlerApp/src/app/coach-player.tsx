import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Image, TextInput, Linking, ActivityIndicator } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import { useState, useEffect, useRef } from 'react';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Colors } from '@/constants/theme';
import { supabase } from '../lib/supabase';
import { notifyCoachMessage } from '../lib/notifications';
import { pickChatMedia, sendChatMediaMessage } from '../lib/chatMedia';
import { showAlert } from '../lib/ui';
import { MessageBubble } from '@/components/MessageBubble';

const CATEGORY_LABELS: Record<string, string> = {
  strength: 'Strength', footwork: 'Footwork', endurance: 'Endurance', recovery: 'Recovery',
};
const CATEGORY_ICONS: Record<string, string> = {
  strength: 'dumbbell', footwork: 'badminton', endurance: 'lightning-bolt', recovery: 'heart-pulse',
};
const CATEGORY_COLORS: Record<string, string> = {
  strength: '#2ECC71', footwork: '#3498DB', endurance: '#E67E22', recovery: '#9B59B6',
};
const FEELINGS = ['😞 Bad', '😐 OK', '😄 Great'];
const LANDINGS = ['✅ Landed clean', '⚠️ A little shaky', '❌ Missed / stepped down'];

const logChips = (ld: any): string[] => {
  if (!ld) return [];
  const c: string[] = [];
  if (ld.weight) c.push(`⚖️ ${ld.weight}kg`);
  if (ld.sets) c.push(`🔁 ${ld.sets} sets`);
  if (ld.reps) c.push(`💪 ${ld.reps} reps`);
  if (ld.height) c.push(`📏 ${ld.height}in`);
  if (ld.time) c.push(`⏱ ${ld.time} sec`);
  if (ld.duration) c.push(`⏱ ${ld.duration} min`);
  if (ld.distance) c.push(`📍 ${ld.distance}km`);
  if (typeof ld.feeling === 'number' && ld.feeling >= 0) c.push(FEELINGS[ld.feeling] ?? '');
  if (typeof ld.landing === 'number' && ld.landing >= 0) c.push(LANDINGS[ld.landing] ?? '');
  return c.filter(Boolean);
};

const fmtTime = (d: string) => new Date(d).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
const fmtDate = (d: string) => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

type TabKey = 'overview' | 'sessions' | 'workouts' | 'notes';

const TABS: { key: TabKey; label: string; icon: string }[] = [
  { key: 'overview', label: 'Overview', icon: 'view-dashboard-outline' },
  { key: 'sessions', label: 'Sessions', icon: 'clipboard-list-outline' },
  { key: 'workouts', label: 'Workouts', icon: 'dumbbell' },
  { key: 'notes', label: 'Notes', icon: 'note-text-outline' },
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
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [playerId]);

  // Mark this player's activity as seen once the coach opens the Workouts tab
  useEffect(() => {
    if (activeTab !== 'workouts' || newActivity === 0) return;
    const coachId = myIdRef.current;
    if (!coachId || !playerId) return;
    supabase.from('notifications').update({ seen: true })
      .eq('user_id', coachId).eq('from_user_id', playerId as string).eq('seen', false);
    setNewActivity(0);
  }, [activeTab, newActivity]);

  const refreshUnseenActivity = async () => {
    const coachId = myIdRef.current;
    if (!coachId || !playerId) return;
    const { data } = await supabase
      .from('notifications').select('id').eq('user_id', coachId).eq('from_user_id', playerId as string).eq('seen', false);
    setNewActivity((data ?? []).length);
  };

  const goBack = () => {
    if (typeof window !== 'undefined') window.history.back();
    else router.back();
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

      refreshUnseenActivity();
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

  const toggleChat = (id: string) => setExpandedChats(prev => ({ ...prev, [id]: !prev[id] }));

  const weekDiff = weekSessions - lastWeekSessions;
  const totalRecent = Object.values(categoryBreakdown).reduce((a, b) => a + b, 0);

  return (
    <LinearGradient colors={[Colors.backgroundTop, Colors.backgroundBottom]} style={styles.container}>
      <View style={styles.content}>
        <View style={styles.titleRow}>
          <TouchableOpacity onPress={goBack}>
            <MaterialCommunityIcons name="arrow-left" size={24} color={Colors.accent} />
          </TouchableOpacity>
          <Text style={styles.title}>{playerName}</Text>
        </View>

        {!loading && (
          <TouchableOpacity
            style={styles.assignBtn}
            onPress={() => router.push({ pathname: '/assign-workout', params: { playerId: playerId as string, name: playerName } })}
          >
            <MaterialCommunityIcons name="clipboard-plus-outline" size={18} color="#FFFFFF" />
            <Text style={styles.assignBtnText}>Assign Workout</Text>
          </TouchableOpacity>
        )}

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        {loading ? (
          <ActivityIndicator color={Colors.accent} style={{ marginTop: 40 }} />
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
                        <View style={[styles.breakdownFill, { width: `${(count / totalRecent) * 100}%`, backgroundColor: CATEGORY_COLORS[cat] ?? Colors.accent }]} />
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
                          color={t.trend === 'up' ? '#2ECC71' : t.trend === 'down' ? '#FF6B6B' : Colors.textSecondary}
                        />
                        <Text style={[styles.trendChipText,
                          { color: t.trend === 'up' ? '#2ECC71' : t.trend === 'down' ? '#FF6B6B' : Colors.textSecondary }
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
        ) : activeTab === 'sessions' ? (
          <>
            {sessions.length === 0 ? (
              <View style={styles.emptyState}>
                <MaterialCommunityIcons name="clipboard-text-outline" size={40} color={Colors.textSecondary} />
                <Text style={styles.emptyDesc}>No sessions logged yet.</Text>
              </View>
            ) : (
              sessions.map((s: any, i: number) => (
                <View key={i} style={styles.sessionCard}>
                  <View style={styles.sessionIcon}>
                    <MaterialCommunityIcons name={(CATEGORY_ICONS[s.category] ?? 'run') as any} size={18} color={Colors.accent} />
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
              ))
            )}
          </>
        ) : activeTab === 'workouts' ? (
          <>
            {assignments.length === 0 ? (
              <View style={styles.emptyState}>
                <MaterialCommunityIcons name="clipboard-plus-outline" size={40} color={Colors.textSecondary} />
                <Text style={styles.emptyDesc}>No workouts assigned yet.</Text>
              </View>
            ) : (
              assignments.map((a: any) => (
                <View key={a.id} style={styles.assignCard}>
                  <View style={styles.assignTopRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.assignTitle}>{a.title}</Text>
                      <Text style={styles.assignSub}>{a.doneAt ? `Done · ${fmtDate(a.doneAt)}` : `Sent ${fmtDate(a.created_at)}`}</Text>
                    </View>
                    <View style={[styles.doneChip, a.doneAt ? styles.doneChipYes : styles.doneChipNo]}>
                      <MaterialCommunityIcons name={a.doneAt ? 'check-circle' : 'clock-outline'} size={14} color={a.doneAt ? Colors.accent : Colors.textSecondary} />
                      <Text style={[styles.doneChipText, a.doneAt ? styles.doneChipTextYes : styles.doneChipTextNo]}>{a.doneAt ? 'Done' : 'Not yet'}</Text>
                    </View>
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
                      <Text style={styles.proofLabel}>📎 Proof uploaded</Text>
                      {a.proof.media_type === 'photo' ? (
                        <TouchableOpacity onPress={() => Linking.openURL(a.proof.media_url)}>
                          <Image source={{ uri: a.proof.media_url }} style={styles.proofThumb} resizeMode="cover" />
                          <Text style={styles.proofTap}>Tap to view full size</Text>
                        </TouchableOpacity>
                      ) : (
                        <TouchableOpacity style={styles.videoProof} onPress={() => Linking.openURL(a.proof.media_url)}>
                          <MaterialCommunityIcons name="play-circle-outline" size={32} color={Colors.accent} />
                          <Text style={styles.videoProofText}>Tap to watch video</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  )}
                  <TouchableOpacity style={styles.chatToggle} onPress={() => toggleChat(a.id)}>
                    <MaterialCommunityIcons name="message-outline" size={15} color={Colors.accent} />
                    <Text style={styles.chatToggleText}>{a.messages.length > 0 ? `Messages (${a.messages.length})` : 'Leave feedback'}</Text>
                    <MaterialCommunityIcons name={expandedChats[a.id] ? 'chevron-up' : 'chevron-down'} size={16} color={Colors.textSecondary} />
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
                            />
                          ))}
                        </View>
                      )}
                      <View style={styles.inputRow}>
                        <TouchableOpacity style={styles.mediaBtn} onPress={() => pickAndSendMedia(a)} disabled={sendingMedia[a.id]}>
                          {sendingMedia[a.id] ? <ActivityIndicator size="small" color={Colors.accent} /> : <MaterialCommunityIcons name="image-multiple-outline" size={20} color={Colors.accent} />}
                        </TouchableOpacity>
                        <TextInput style={styles.input} placeholder="Leave feedback or reply..." placeholderTextColor={Colors.textSecondary} value={msgInputs[a.id] ?? ''} onChangeText={(t) => setMsgInputs(prev => ({ ...prev, [a.id]: t }))} multiline />
                        <TouchableOpacity style={[styles.sendBtn, (!msgInputs[a.id]?.trim() || sending[a.id]) && styles.sendBtnDisabled]} onPress={() => sendMessage(a)} disabled={!msgInputs[a.id]?.trim() || sending[a.id]}>
                          {sending[a.id] ? <ActivityIndicator size="small" color="#fff" /> : <MaterialCommunityIcons name="send" size={16} color="#fff" />}
                        </TouchableOpacity>
                      </View>
                    </>
                  )}
                </View>
              ))
            )}
          </>
        ) : (
          <View style={styles.notesCard}>
            <View style={styles.notesHeader}>
              <View style={styles.notesHeaderLeft}>
                <MaterialCommunityIcons name="lock-outline" size={16} color={Colors.textSecondary} />
                <Text style={styles.notesHeaderText}>Only you can see these</Text>
              </View>
              {savingNote && <Text style={styles.savingText}>Saving...</Text>}
            </View>
            <TextInput
              style={styles.notesInput}
              placeholder={`Notes about ${playerName}... (e.g. competing July 20, needs footwork focus, strong backhand)`}
              placeholderTextColor={Colors.textSecondary}
              value={privateNote}
              onChangeText={saveNote}
              multiline
              numberOfLines={10}
              textAlignVertical="top"
            />
          </View>
        )}
        </ScrollView>
      </View>

      {!loading && (
        <View style={styles.bottomTabBar}>
          {TABS.map(tab => {
            const badge = tab.key === 'workouts' ? newActivity : 0;
            const active = activeTab === tab.key;
            const color = active ? Colors.accent : Colors.textSecondary;
            return (
              <TouchableOpacity key={tab.key} style={styles.bottomTabBtn} onPress={() => setActiveTab(tab.key)}>
                <View>
                  <MaterialCommunityIcons name={tab.icon as any} size={24} color={color} />
                  {badge > 0 && (
                    <View style={styles.bottomTabBadge}>
                      <Text style={styles.bottomTabBadgeText}>{badge > 9 ? '9+' : badge}</Text>
                    </View>
                  )}
                </View>
                <Text style={[styles.bottomTabLabel, { color }]}>{tab.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      )}
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { flex: 1, padding: 24, paddingTop: 60 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 20 },
  title: { fontSize: 24, fontWeight: 'bold', color: Colors.textPrimary },
  scroll: { paddingBottom: 60 },
  assignBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: Colors.accent, borderRadius: 12, paddingVertical: 14, marginBottom: 16 },
  assignBtnText: { color: '#FFFFFF', fontWeight: 'bold', fontSize: 15 },
  sectionLabel: { fontSize: 11, fontWeight: 'bold', color: Colors.accent, letterSpacing: 1, marginBottom: 12 },

  // Bottom tab bar
  bottomTabBar: {
    flexDirection: 'row',
    backgroundColor: Colors.backgroundTop,
    borderTopColor: 'rgba(255,255,255,0.08)',
    borderTopWidth: 1,
    height: 80,
    paddingBottom: 16,
    paddingTop: 8,
  },
  bottomTabBtn: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 4 },
  bottomTabLabel: { fontSize: 11, fontWeight: '600' },
  bottomTabBadge: {
    position: 'absolute', top: -4, right: -8,
    minWidth: 16, height: 16, borderRadius: 8,
    backgroundColor: '#FF3B30', alignItems: 'center',
    justifyContent: 'center', paddingHorizontal: 3,
    borderWidth: 1.5, borderColor: Colors.backgroundTop as string,
  },
  bottomTabBadgeText: { color: '#fff', fontSize: 9, fontWeight: 'bold' },

  // Progress snapshot
  snapshotCard: { backgroundColor: Colors.backgroundCard, borderRadius: 16, padding: 16, marginBottom: 24, gap: 16 },
  snapshotRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 16 },
  snapshotStat: { flex: 1, gap: 4 },
  snapshotNum: { fontSize: 32, fontWeight: 'bold', color: Colors.textPrimary },
  snapshotLabel: { fontSize: 11, color: Colors.textSecondary },
  snapshotDivider: { width: 1, backgroundColor: Colors.border, alignSelf: 'stretch' },
  weekDiffChip: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4, alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  weekDiffUp: { backgroundColor: 'rgba(46,204,113,0.15)' },
  weekDiffDown: { backgroundColor: 'rgba(255,107,107,0.15)' },
  weekDiffText: { fontSize: 11, fontWeight: '600' },
  consistencyBar: { height: 6, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 3, overflow: 'hidden', marginTop: 6 },
  consistencyFill: { height: '100%', borderRadius: 3 },

  // 7-day chart
  chartSection: { gap: 8 },
  chartLabel: { fontSize: 10, fontWeight: 'bold', color: Colors.textSecondary, letterSpacing: 1 },
  chartRow: { flexDirection: 'row', gap: 6, alignItems: 'flex-end', height: 50 },
  chartCol: { flex: 1, alignItems: 'center', gap: 4, justifyContent: 'flex-end' },
  chartBar: { width: '100%', height: 32, borderRadius: 6, backgroundColor: 'rgba(255,255,255,0.08)' },
  chartBarActive: { backgroundColor: Colors.accent },
  chartDayLabel: { fontSize: 9, color: Colors.textSecondary, fontWeight: '600' },
  chartDayLabelActive: { color: Colors.accent },

  // Category breakdown
  breakdownSection: { gap: 8 },
  breakdownRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  breakdownCat: { width: 70, fontSize: 12, color: Colors.textSecondary },
  breakdownTrack: { flex: 1, height: 8, backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 4, overflow: 'hidden' },
  breakdownFill: { height: '100%', borderRadius: 4 },
  breakdownCount: { width: 20, fontSize: 12, color: Colors.textPrimary, fontWeight: '600', textAlign: 'right' },

  // Trends
  trendRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 5 },
  trendName: { flex: 1, fontSize: 12, color: Colors.textPrimary, fontWeight: '500' },
  trendBest: { fontSize: 12, fontWeight: '700', color: Colors.accent, minWidth: 40, textAlign: 'right' },
  trendChip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  trendUp: { backgroundColor: 'rgba(46,204,113,0.12)' },
  trendDown: { backgroundColor: 'rgba(255,107,107,0.12)' },
  trendFlat: { backgroundColor: 'rgba(255,255,255,0.06)' },
  trendChipText: { fontSize: 11, fontWeight: '600' },

  // Assigned workouts
  assignCard: { backgroundColor: Colors.backgroundCard, borderRadius: 14, padding: 14, marginBottom: 12, gap: 10 },
  assignTopRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  assignTitle: { fontSize: 14, fontWeight: '600', color: Colors.textPrimary },
  assignSub: { fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
  doneChip: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 4 },
  doneChipYes: { backgroundColor: Colors.accentMuted },
  doneChipNo: { backgroundColor: 'rgba(255,255,255,0.06)' },
  doneChipText: { fontSize: 11, fontWeight: '600' },
  doneChipTextYes: { color: Colors.accent },
  doneChipTextNo: { color: Colors.textSecondary },
  proofSection: { gap: 6 },
  proofLabel: { fontSize: 12, color: Colors.textSecondary, fontWeight: '600' },
  proofThumb: { width: '100%', height: 160, borderRadius: 10, backgroundColor: Colors.backgroundBottom },
  proofTap: { fontSize: 11, color: Colors.textSecondary, marginTop: 4, textAlign: 'center' },
  videoProof: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: Colors.accentMuted, borderRadius: 10, padding: 14 },
  videoProofText: { fontSize: 13, color: Colors.accent, fontWeight: '600' },
  chatToggle: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8, paddingHorizontal: 2, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.06)' },
  chatToggleText: { flex: 1, fontSize: 13, color: Colors.accent, fontWeight: '600' },
  chatThread: { gap: 6 },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, marginTop: 4 },
  mediaBtn: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.07)', borderWidth: 1, borderColor: Colors.border },
  input: { flex: 1, backgroundColor: 'rgba(255,255,255,0.07)', borderRadius: 10, padding: 10, color: Colors.textPrimary, fontSize: 13, borderWidth: 1, borderColor: Colors.border, maxHeight: 80 },
  sendBtn: { backgroundColor: Colors.accent, borderRadius: 10, width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  sendBtnDisabled: { opacity: 0.4 },

  // Private notes
  notesCard: { backgroundColor: Colors.backgroundCard, borderRadius: 14, padding: 14, marginBottom: 4 },
  notesHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  notesHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  notesHeaderText: { fontSize: 12, color: Colors.textSecondary, fontWeight: '600' },
  savingText: { fontSize: 11, color: Colors.textSecondary, fontStyle: 'italic' },
  notesInput: { color: Colors.textPrimary, fontSize: 13, lineHeight: 20, minHeight: 220 },

  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  chipText: { fontSize: 12, color: Colors.textPrimary },
  emptyState: { alignItems: 'center', paddingTop: 40, gap: 10 },
  emptyDesc: { fontSize: 13, color: Colors.textSecondary, textAlign: 'center' },
  sessionCard: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: Colors.backgroundCard, borderRadius: 12, padding: 14, marginBottom: 10 },
  sessionIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.accentMuted, alignItems: 'center', justifyContent: 'center' },
  sessionName: { fontSize: 14, fontWeight: '600', color: Colors.textPrimary },
  sessionMeta: { fontSize: 12, color: Colors.textSecondary, marginTop: 1 },
});
