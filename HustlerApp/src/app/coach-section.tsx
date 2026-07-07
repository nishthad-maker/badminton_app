import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Image, Linking, ActivityIndicator, Alert, Platform
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, router } from 'expo-router';
import { useState, useCallback, useRef } from 'react';
import * as ImagePicker from 'expo-image-picker';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Colors } from '@/constants/theme';
import { supabase } from '../lib/supabase';

const CLOUDINARY_CLOUD = 'pyqqwrax';
const CLOUDINARY_PRESET = 'hustler_videos';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

const CATEGORY_COLORS: Record<string, string> = {
  strength: '#2ECC71', footwork: '#3498DB', endurance: '#E67E22', recovery: '#9B59B6',
};
const CATEGORY_ICONS: Record<string, string> = {
  strength: 'dumbbell', footwork: 'badminton', endurance: 'lightning-bolt', recovery: 'heart-pulse',
};

const showAlert = (title: string, message: string) => {
  if (typeof window !== 'undefined') window.alert(`${title}\n\n${message}`);
  else Alert.alert(title, message);
};

const fmtDate = (d: string) =>
  new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

const fmtTime = (d: string) =>
  new Date(d).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

export default function CoachSectionScreen() {
  const [activeTab, setActiveTab] = useState<'workouts' | 'plans'>('workouts');

  // ── Assigned workouts state ──
  const [grouped, setGrouped] = useState<Record<string, { coachName: string; assignments: any[] }>>({});
  const [loadingWorkouts, setLoadingWorkouts] = useState(true);
  const [myId, setMyId] = useState<string | null>(null);
  const myIdRef = useRef<string | null>(null);
  const [msgInputs, setMsgInputs] = useState<Record<string, string>>({});
  const [sending, setSending] = useState<Record<string, boolean>>({});
  const [uploadingProof, setUploadingProof] = useState<Record<string, boolean>>({});
  const [expandedChats, setExpandedChats] = useState<Record<string, boolean>>({});

  // ── Weekly plans state ──
  const [plans, setPlans] = useState<any[]>([]);
  const [loadingPlans, setLoadingPlans] = useState(true);
  const [activeDay, setActiveDay] = useState<string>('');
  const todayKey = DAY_KEYS[new Date().getDay() === 0 ? 6 : new Date().getDay() - 1];

  useFocusEffect(useCallback(() => {
    loadWorkouts();
    loadPlans();

    const channel = supabase
      .channel('assignment_messages_player')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'assignment_messages' }, (payload) => {
        if (payload.new.sender_id !== myIdRef.current) loadMessagesOnly();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []));

  // ── Workouts load ──
  const loadWorkouts = async () => {
    setLoadingWorkouts(true);
    const { data: { session } } = await supabase.auth.getSession();
    const userId = session?.user?.id;
    if (!userId) { setLoadingWorkouts(false); return; }
    setMyId(userId);
    myIdRef.current = userId;

    await supabase.from('assignments').update({ seen: true }).eq('player_id', userId).eq('seen', false);
    await supabase.from('notifications').update({ seen: true }).eq('user_id', userId).eq('type', 'coach_feedback').eq('seen', false);

    const { data: asgs } = await supabase
      .from('assignments').select('*').eq('player_id', userId).order('created_at', { ascending: false });

    if (!asgs || asgs.length === 0) { setGrouped({}); setLoadingWorkouts(false); return; }

    const asgIds = asgs.map((a: any) => a.id);
    const coachIds = [...new Set(asgs.map((a: any) => a.coach_id))] as string[];

    const { data: coaches } = await supabase.from('profiles').select('id, full_name').in('id', coachIds);
    const coachMap: Record<string, string> = {};
    (coaches ?? []).forEach((c: any) => { coachMap[c.id] = c.full_name ?? 'Coach'; });

    const { data: proofs } = await supabase.from('assignment_proof').select('*').in('assignment_id', asgIds);
    const { data: allMessages } = await supabase
      .from('assignment_messages').select('*').in('assignment_id', asgIds).order('created_at', { ascending: true });
    const { data: logs } = await supabase
      .from('session_logs').select('exercise_name, created_at, log_data').eq('user_id', userId);

    const proofMap: Record<string, any> = {};
    (proofs ?? []).forEach((p: any) => { proofMap[p.assignment_id] = p; });
    const messagesMap: Record<string, any[]> = {};
    (allMessages ?? []).forEach((m: any) => {
      if (!messagesMap[m.assignment_id]) messagesMap[m.assignment_id] = [];
      messagesMap[m.assignment_id].push(m);
    });

    const result: Record<string, { coachName: string; assignments: any[] }> = {};
    asgs.forEach((a: any) => {
      const doneLog = (logs ?? []).find((s: any) =>
        s.exercise_name === a.title && new Date(s.created_at) >= new Date(a.created_at)
      );
      const enriched = { ...a, doneAt: doneLog ? doneLog.created_at : null, proof: proofMap[a.id] ?? null, messages: messagesMap[a.id] ?? [] };
      if (!result[a.coach_id]) result[a.coach_id] = { coachName: coachMap[a.coach_id] ?? 'Coach', assignments: [] };
      result[a.coach_id].assignments.push(enriched);
    });

    setGrouped(result);
    setLoadingWorkouts(false);
  };

  const loadMessagesOnly = async () => {
    const userId = myIdRef.current;
    if (!userId) return;
    const { data: asgs } = await supabase.from('assignments').select('id').eq('player_id', userId);
    const asgIds = (asgs ?? []).map((a: any) => a.id);
    if (!asgIds.length) return;
    const { data: allMessages } = await supabase
      .from('assignment_messages').select('*').in('assignment_id', asgIds).order('created_at', { ascending: true });
    const messagesMap: Record<string, any[]> = {};
    (allMessages ?? []).forEach((m: any) => {
      if (!messagesMap[m.assignment_id]) messagesMap[m.assignment_id] = [];
      messagesMap[m.assignment_id].push(m);
    });
    setGrouped(prev => {
      const updated = { ...prev };
      Object.keys(updated).forEach(coachId => {
        updated[coachId] = {
          ...updated[coachId],
          assignments: updated[coachId].assignments.map(a => ({ ...a, messages: messagesMap[a.id] ?? a.messages })),
        };
      });
      return updated;
    });
  };

  // ── Plans load ──
  const loadPlans = async () => {
    setLoadingPlans(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) { setLoadingPlans(false); return; }
    const { data } = await supabase
      .from('weekly_plans')
      .select('*, profiles!weekly_plans_coach_id_fkey(full_name)')
      .eq('player_id', session.user.id)
      .order('created_at', { ascending: false })
      .limit(4);
    setPlans(data ?? []);
    setLoadingPlans(false);
  };

  // ── Proof upload ──
  const uploadToCloudinary = async (uri: string, kind: 'image' | 'video'): Promise<string | null> => {
    try {
      const formData = new FormData();
      if (Platform.OS === 'web') {
        const resp = await fetch(uri); const blob = await resp.blob();
        formData.append('file', blob, kind === 'video' ? 'clip.mp4' : 'photo.jpg');
      } else {
        formData.append('file', { uri, type: kind === 'video' ? 'video/mp4' : 'image/jpeg', name: kind === 'video' ? 'clip.mp4' : 'photo.jpg' } as any);
      }
      formData.append('upload_preset', CLOUDINARY_PRESET);
      formData.append('folder', 'hustler_proof');
      const endpoint = kind === 'video' ? 'video' : 'image';
      const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD}/${endpoint}/upload`, { method: 'POST', body: formData });
      const data = await res.json();
      return data.secure_url ?? null;
    } catch (e) { return null; }
  };

  const uploadProof = async (assignment: any) => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') { showAlert('Permission needed', 'Please allow library access.'); return; }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images', 'videos'], quality: 0.7 });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    const kind = asset.type === 'video' ? 'video' : 'image';
    setUploadingProof(prev => ({ ...prev, [assignment.id]: true }));
    const url = await uploadToCloudinary(asset.uri, kind);
    if (!url || !myIdRef.current) { setUploadingProof(prev => ({ ...prev, [assignment.id]: false })); showAlert('Upload failed', 'Please try again.'); return; }
    await supabase.from('assignment_proof').insert({ assignment_id: assignment.id, player_id: myIdRef.current, media_url: url, media_type: kind === 'image' ? 'photo' : 'video' });
    setUploadingProof(prev => ({ ...prev, [assignment.id]: false }));
    await loadWorkouts();
  };

  const deleteProof = async (assignment: any) => {
    if (!myIdRef.current) return;
    await supabase
      .from('assignment_proof')
      .delete()
      .eq('assignment_id', assignment.id)
      .eq('player_id', myIdRef.current);
    await loadWorkouts();
  };

  // ── Send message ──
  const sendMessage = async (assignment: any) => {
    const msg = (msgInputs[assignment.id] ?? '').trim();
    const userId = myIdRef.current;
    if (!msg || !userId) return;
    setSending(prev => ({ ...prev, [assignment.id]: true }));
    await supabase.from('assignment_messages').insert({ assignment_id: assignment.id, sender_id: userId, message: msg });
    await supabase.from('notifications').insert({ user_id: assignment.coach_id, type: 'player_message', assignment_id: assignment.id, from_user_id: userId });
    setMsgInputs(prev => ({ ...prev, [assignment.id]: '' }));
    setSending(prev => ({ ...prev, [assignment.id]: false }));
    setGrouped(prev => {
      const updated = { ...prev };
      Object.keys(updated).forEach(coachId => {
        updated[coachId] = {
          ...updated[coachId],
          assignments: updated[coachId].assignments.map(a =>
            a.id === assignment.id
              ? { ...a, messages: [...a.messages, { id: Date.now().toString(), assignment_id: a.id, sender_id: userId, message: msg, created_at: new Date().toISOString() }] }
              : a
          ),
        };
      });
      return updated;
    });
  };

  const toggleChat = (id: string) => setExpandedChats(prev => ({ ...prev, [id]: !prev[id] }));

  // ── Open exercise from weekly plan ──
  const openExercise = (ex: any) => {
    router.push({
      pathname: '/exercise',
      params: {
        name: ex.name, description: ex.description ?? '',
        steps: JSON.stringify(ex.steps ?? []), muscles: JSON.stringify(ex.muscles ?? []),
        category: ex.category, videoUrl: ex.videoUrl ?? '',
        imageUrl: ex.imageUrl ?? '', logType: ex.logType ?? ex.category,
      },
    });
  };

  const coachIds = Object.keys(grouped);

  return (
    <LinearGradient colors={[Colors.backgroundTop, Colors.backgroundBottom]} style={styles.container}>

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.push('/(tabs)/workouts' as any)}>
          <MaterialCommunityIcons name="arrow-left" size={24} color={Colors.accent} />
        </TouchableOpacity>
        <Text style={styles.title}>Coach</Text>
      </View>

      {/* Tab toggle */}
      <View style={styles.tabToggle}>
        <TouchableOpacity
          style={[styles.tabBtn, activeTab === 'workouts' && styles.tabBtnActive]}
          onPress={() => setActiveTab('workouts')}
        >
          <MaterialCommunityIcons name="clipboard-text-outline" size={16} color={activeTab === 'workouts' ? '#fff' : Colors.textSecondary} />
          <Text style={[styles.tabBtnText, activeTab === 'workouts' && styles.tabBtnTextActive]}>Assigned Workouts</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tabBtn, activeTab === 'plans' && styles.tabBtnActive]}
          onPress={() => setActiveTab('plans')}
        >
          <MaterialCommunityIcons name="calendar-week" size={16} color={activeTab === 'plans' ? '#fff' : Colors.textSecondary} />
          <Text style={[styles.tabBtnText, activeTab === 'plans' && styles.tabBtnTextActive]}>Weekly Plans</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* ── ASSIGNED WORKOUTS TAB ── */}
        {activeTab === 'workouts' && (
          loadingWorkouts ? (
            <ActivityIndicator color={Colors.accent} style={{ marginTop: 40 }} />
          ) : coachIds.length === 0 ? (
            <View style={styles.emptyState}>
              <MaterialCommunityIcons name="clipboard-text-outline" size={48} color={Colors.textSecondary} />
              <Text style={styles.emptyTitle}>No workouts yet</Text>
              <Text style={styles.emptyDesc}>When a coach assigns you a workout, it'll appear here.</Text>
            </View>
          ) : (
            coachIds.map((coachId) => {
              const { coachName, assignments } = grouped[coachId];
              return (
                <View key={coachId} style={styles.coachSection}>
                  <View style={styles.coachHeader}>
                    <View style={styles.coachAvatar}>
                      <Text style={styles.coachAvatarText}>{coachName.charAt(0).toUpperCase()}</Text>
                    </View>
                    <View>
                      <Text style={styles.coachName}>{coachName}</Text>
                      <Text style={styles.coachCount}>{assignments.length} workout{assignments.length !== 1 ? 's' : ''}</Text>
                    </View>
                  </View>

                  {assignments.map((a: any) => (
                    <View key={a.id} style={styles.assignCard}>
                      {/* Title + status */}
                      <View style={styles.assignTopRow}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.assignTitle}>{a.title}</Text>
                          <Text style={styles.assignSub}>{a.doneAt ? `Completed · ${fmtDate(a.doneAt)}` : `Assigned ${fmtDate(a.created_at)}`}</Text>
                        </View>
                        <View style={[styles.statusChip, a.doneAt ? styles.statusDone : styles.statusPending]}>
                          <MaterialCommunityIcons name={a.doneAt ? 'check-circle' : 'clock-outline'} size={13} color={a.doneAt ? Colors.accent : Colors.textSecondary} />
                          <Text style={[styles.statusText, a.doneAt ? styles.statusTextDone : styles.statusTextPending]}>{a.doneAt ? 'Done' : 'Not yet'}</Text>
                        </View>
                      </View>

                      {a.instructions ? <Text style={styles.instructions}>{a.instructions}</Text> : null}

                      {/* Proof */}
                      {a.requires_proof && (
                        <View style={styles.proofSection}>
                          {a.proof ? (
                            <View>
                              <View style={styles.proofLabelRow}>
                                <Text style={styles.proofLabel}>✅ Proof uploaded</Text>
                                <TouchableOpacity onPress={() => deleteProof(a)}>
                                  <MaterialCommunityIcons name="trash-can-outline" size={18} color="#FF6B6B" />
                                </TouchableOpacity>
                              </View>
                              {a.proof.media_type === 'photo' ? (
                                <TouchableOpacity onPress={() => Linking.openURL(a.proof.media_url)}>
                                  <Image source={{ uri: a.proof.media_url }} style={styles.proofThumb} resizeMode="cover" />
                                  <Text style={styles.proofTap}>Tap to view full size</Text>
                                </TouchableOpacity>
                              ) : (
                                <TouchableOpacity style={styles.videoProof} onPress={() => Linking.openURL(a.proof.media_url)}>
                                  <MaterialCommunityIcons name="play-circle-outline" size={28} color={Colors.accent} />
                                  <Text style={styles.videoProofText}>Tap to watch your video</Text>
                                </TouchableOpacity>
                              )}
                            </View>
                          ) : uploadingProof[a.id] ? (
                            <View style={styles.uploadingRow}>
                              <ActivityIndicator size="small" color={Colors.accent} />
                              <Text style={styles.uploadingText}>Uploading...</Text>
                            </View>
                          ) : (
                            <TouchableOpacity style={styles.uploadProofBtn} onPress={() => uploadProof(a)}>
                              <MaterialCommunityIcons name="camera-plus-outline" size={18} color={Colors.accent} />
                              <Text style={styles.uploadProofText}>Upload proof of completion</Text>
                            </TouchableOpacity>
                          )}
                        </View>
                      )}

                      {/* Chat toggle */}
                      <TouchableOpacity style={styles.chatToggle} onPress={() => toggleChat(a.id)}>
                        <MaterialCommunityIcons name="message-outline" size={15} color={Colors.accent} />
                        <Text style={styles.chatToggleText}>{a.messages.length > 0 ? `Messages (${a.messages.length})` : 'Ask your coach a question'}</Text>
                        <MaterialCommunityIcons name={expandedChats[a.id] ? 'chevron-up' : 'chevron-down'} size={16} color={Colors.textSecondary} />
                      </TouchableOpacity>

                      {/* Expanded chat */}
                      {expandedChats[a.id] && (
                        <>
                          {a.messages.length > 0 && (
                            <View style={styles.chatThread}>
                              {a.messages.map((m: any) => {
                                const isMe = m.sender_id === myIdRef.current;
                                return (
                                  <View key={m.id} style={[styles.bubble, isMe ? styles.bubbleMe : styles.bubbleCoach]}>
                                    {!isMe && <Text style={styles.bubbleSender}>{coachName}</Text>}
                                    <Text style={[styles.bubbleText, isMe ? styles.bubbleTextMe : styles.bubbleTextCoach]}>{m.message}</Text>
                                    <Text style={[styles.bubbleTime, isMe ? styles.bubbleTimeMe : styles.bubbleTimeCoach]}>{fmtTime(m.created_at)}</Text>
                                  </View>
                                );
                              })}
                            </View>
                          )}
                          <View style={styles.inputRow}>
                            <TextInput
                              style={styles.textInput}
                              placeholder="Type a message..."
                              placeholderTextColor={Colors.textSecondary}
                              value={msgInputs[a.id] ?? ''}
                              onChangeText={(t) => setMsgInputs(prev => ({ ...prev, [a.id]: t }))}
                              multiline
                            />
                            <TouchableOpacity
                              style={[styles.sendBtn, (!msgInputs[a.id]?.trim() || sending[a.id]) && styles.sendBtnDisabled]}
                              onPress={() => sendMessage(a)}
                              disabled={!msgInputs[a.id]?.trim() || sending[a.id]}
                            >
                              {sending[a.id] ? <ActivityIndicator size="small" color="#fff" /> : <MaterialCommunityIcons name="send" size={15} color="#fff" />}
                            </TouchableOpacity>
                          </View>
                        </>
                      )}
                    </View>
                  ))}
                </View>
              );
            })
          )
        )}

        {/* ── WEEKLY PLANS TAB ── */}
        {activeTab === 'plans' && (
          loadingPlans ? (
            <ActivityIndicator color={Colors.accent} style={{ marginTop: 40 }} />
          ) : plans.length === 0 ? (
            <View style={styles.emptyState}>
              <MaterialCommunityIcons name="calendar-blank-outline" size={48} color={Colors.textSecondary} />
              <Text style={styles.emptyTitle}>No weekly plans yet</Text>
              <Text style={styles.emptyDesc}>Your coach will send you a weekly training schedule here.</Text>
            </View>
          ) : (
            plans.map((plan: any, pi: number) => {
              const coachName = plan.profiles?.full_name ?? 'Coach';
              const weekStart = new Date(plan.week_start);
              const weekEnd = new Date(weekStart); weekEnd.setDate(weekEnd.getDate() + 6);
              const fmtWeek = `${weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${weekEnd.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;

              return (
                <View key={plan.id} style={styles.planCard}>
                  {/* Plan header */}
                  <View style={styles.planHeader}>
                    <View style={styles.coachAvatar}>
                      <Text style={styles.coachAvatarText}>{coachName.charAt(0).toUpperCase()}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.coachName}>{coachName}</Text>
                      <Text style={styles.weekLabel}>{fmtWeek}</Text>
                    </View>
                    {pi === 0 && <View style={styles.latestBadge}><Text style={styles.latestBadgeText}>Latest</Text></View>}
                  </View>

                  {/* Day tabs */}
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 14 }} contentContainerStyle={{ gap: 6 }}>
                    {DAY_KEYS.map((key, i) => {
                      const dayExs = plan.plan[key] ?? [];
                      const isToday = key === todayKey && pi === 0;
                      const isActive = activeDay === `${plan.id}_${key}`;
                      return (
                        <TouchableOpacity
                          key={key}
                          style={[styles.dayTab, isActive && styles.dayTabActive, isToday && !isActive && styles.dayTabToday]}
                          onPress={() => setActiveDay(isActive ? '' : `${plan.id}_${key}`)}
                        >
                          <Text style={[styles.dayTabText, isActive && styles.dayTabTextActive]}>{DAYS[i].slice(0, 3)}</Text>
                          {dayExs.length > 0 && (
                            <View style={[styles.dayTabCount, isActive && styles.dayTabCountActive]}>
                              <Text style={styles.dayTabCountText}>{dayExs.length}</Text>
                            </View>
                          )}
                          {isToday && !isActive && <View style={styles.todayDot} />}
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>

                  {/* Exercises for selected day */}
                  {DAY_KEYS.map((key, i) => {
                    if (activeDay !== `${plan.id}_${key}`) return null;
                    const dayExs = plan.plan[key] ?? [];
                    return (
                      <View key={key}>
                        <Text style={styles.dayTitle}>{DAYS[i]}</Text>
                        {dayExs.length === 0 ? (
                          <View style={styles.restDayCard}>
                            <MaterialCommunityIcons name="bed-outline" size={20} color={Colors.textSecondary} />
                            <Text style={styles.restDayText}>Rest day</Text>
                          </View>
                        ) : (
                          dayExs.map((ex: any, ei: number) => (
                            <TouchableOpacity key={ei} style={styles.planExCard} onPress={() => openExercise(ex)}>
                              <View style={[styles.planExIcon, { backgroundColor: `${CATEGORY_COLORS[ex.category] ?? Colors.accent}20` }]}>
                                <MaterialCommunityIcons name={(CATEGORY_ICONS[ex.category] ?? 'dumbbell') as any} size={18} color={CATEGORY_COLORS[ex.category] ?? Colors.accent} />
                              </View>
                              <View style={{ flex: 1 }}>
                                <Text style={styles.planExName}>{ex.name}</Text>
                                <Text style={styles.planExCat}>{ex.category.charAt(0).toUpperCase() + ex.category.slice(1)}</Text>
                              </View>
                              <MaterialCommunityIcons name="chevron-right" size={18} color={Colors.textSecondary} />
                            </TouchableOpacity>
                          ))
                        )}
                      </View>
                    );
                  })}
                </View>
              );
            })
          )
        )}

      </ScrollView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 24, paddingTop: 60, paddingBottom: 8 },
  title: { fontSize: 26, fontWeight: 'bold', color: Colors.textPrimary },

  // Tab toggle
  tabToggle: { flexDirection: 'row', marginHorizontal: 24, marginBottom: 16, backgroundColor: Colors.backgroundCard, borderRadius: 12, padding: 4, gap: 4 },
  tabBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: 10 },
  tabBtnActive: { backgroundColor: Colors.accent },
  tabBtnText: { fontSize: 12, fontWeight: '600', color: Colors.textSecondary },
  tabBtnTextActive: { color: '#fff' },

  scroll: { padding: 24, paddingTop: 4, paddingBottom: 100 },

  emptyState: { alignItems: 'center', paddingTop: 60, gap: 12 },
  emptyTitle: { fontSize: 16, fontWeight: 'bold', color: Colors.textPrimary },
  emptyDesc: { fontSize: 13, color: Colors.textSecondary, textAlign: 'center', lineHeight: 20 },

  // Coach section
  coachSection: { marginBottom: 28 },
  coachHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  coachAvatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.accent, alignItems: 'center', justifyContent: 'center' },
  coachAvatarText: { fontSize: 16, fontWeight: 'bold', color: '#fff' },
  coachName: { fontSize: 15, fontWeight: 'bold', color: Colors.textPrimary },
  coachCount: { fontSize: 12, color: Colors.textSecondary },

  // Assignment cards
  assignCard: { backgroundColor: Colors.backgroundCard, borderRadius: 14, padding: 14, marginBottom: 10, gap: 10 },
  assignTopRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  assignTitle: { fontSize: 15, fontWeight: '700', color: Colors.textPrimary },
  assignSub: { fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
  statusChip: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 4 },
  statusDone: { backgroundColor: Colors.accentMuted },
  statusPending: { backgroundColor: 'rgba(255,255,255,0.06)' },
  statusText: { fontSize: 11, fontWeight: '600' },
  statusTextDone: { color: Colors.accent },
  statusTextPending: { color: Colors.textSecondary },
  instructions: { fontSize: 13, color: Colors.textSecondary, lineHeight: 19 },

  // Proof
  proofSection: { gap: 6 },
  proofLabelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  proofLabel: { fontSize: 12, color: Colors.textSecondary, fontWeight: '600' },
  proofThumb: { width: '100%', height: 160, borderRadius: 10, backgroundColor: Colors.backgroundBottom },
  proofTap: { fontSize: 11, color: Colors.textSecondary, marginTop: 4, textAlign: 'center' },
  videoProof: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: Colors.accentMuted, borderRadius: 10, padding: 12 },
  videoProofText: { fontSize: 13, color: Colors.accent, fontWeight: '600' },
  uploadProofBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: Colors.accentMuted, borderRadius: 10, padding: 12, borderWidth: 1, borderColor: Colors.accent, borderStyle: 'dashed' },
  uploadProofText: { fontSize: 13, color: Colors.accent, fontWeight: '600' },
  uploadingRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12 },
  uploadingText: { fontSize: 13, color: Colors.accent },

  // Chat
  chatToggle: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.06)' },
  chatToggleText: { flex: 1, fontSize: 13, color: Colors.accent, fontWeight: '600' },
  chatThread: { gap: 6 },
  bubble: { maxWidth: '80%', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, gap: 2 },
  bubbleMe: { backgroundColor: Colors.accent, alignSelf: 'flex-end', borderBottomRightRadius: 4 },
  bubbleCoach: { backgroundColor: 'rgba(255,255,255,0.08)', alignSelf: 'flex-start', borderBottomLeftRadius: 4 },
  bubbleSender: { fontSize: 10, color: Colors.accent, fontWeight: '700', marginBottom: 2 },
  bubbleText: { fontSize: 13, lineHeight: 18 },
  bubbleTextMe: { color: '#fff' },
  bubbleTextCoach: { color: Colors.textPrimary },
  bubbleTime: { fontSize: 10 },
  bubbleTimeMe: { color: 'rgba(255,255,255,0.6)', textAlign: 'right' },
  bubbleTimeCoach: { color: Colors.textSecondary },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, marginTop: 4 },
  textInput: { flex: 1, backgroundColor: 'rgba(255,255,255,0.07)', borderRadius: 10, padding: 10, color: Colors.textPrimary, fontSize: 13, borderWidth: 1, borderColor: Colors.border, maxHeight: 80 },
  sendBtn: { backgroundColor: Colors.accent, borderRadius: 10, width: 38, height: 38, alignItems: 'center', justifyContent: 'center' },
  sendBtnDisabled: { opacity: 0.4 },

  // Weekly plan cards
  planCard: { backgroundColor: Colors.backgroundCard, borderRadius: 16, padding: 16, marginBottom: 20 },
  planHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
  weekLabel: { fontSize: 11, color: Colors.textSecondary, marginTop: 1 },
  latestBadge: { backgroundColor: Colors.accentMuted, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 },
  latestBadgeText: { fontSize: 10, color: Colors.accent, fontWeight: '700' },
  dayTab: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1, borderColor: 'transparent', flexDirection: 'row', alignItems: 'center', gap: 5 },
  dayTabActive: { backgroundColor: Colors.accent, borderColor: Colors.accent },
  dayTabToday: { borderColor: Colors.accent },
  dayTabText: { fontSize: 12, color: Colors.textSecondary, fontWeight: '600' },
  dayTabTextActive: { color: '#fff' },
  dayTabCount: { backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 8, minWidth: 16, height: 16, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 },
  dayTabCountActive: { backgroundColor: 'rgba(255,255,255,0.3)' },
  dayTabCountText: { fontSize: 9, color: '#fff', fontWeight: 'bold' },
  todayDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: Colors.accent },
  dayTitle: { fontSize: 14, fontWeight: '700', color: Colors.textPrimary, marginBottom: 10 },
  restDayCard: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 14, backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 10 },
  restDayText: { fontSize: 13, color: Colors.textSecondary },
  planExCard: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 10, padding: 12, marginBottom: 8 },
  planExIcon: { width: 36, height: 36, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  planExName: { fontSize: 14, fontWeight: '600', color: Colors.textPrimary },
  planExCat: { fontSize: 11, color: Colors.textSecondary, marginTop: 2 },
});
