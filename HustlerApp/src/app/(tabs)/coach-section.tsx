import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image, Linking, ActivityIndicator } from 'react-native';
import { TextInput } from '@/components/TextInput';
import { useFocusEffect, router, useLocalSearchParams } from 'expo-router';
import { useState, useCallback, useRef, useEffect } from 'react';
import * as ImagePicker from 'expo-image-picker';
import { Icon } from '@/components/icons/Icon';
import { Theme, CategoryTheme, Fonts } from '@/constants/theme';
import { supabase } from '../../lib/supabase';
import { notifyPlayerMessage, notifyProofUploaded } from '../../lib/notifications';
import { uploadToCloudinary } from '../../lib/cloudinary';
import { pickChatMedia, sendChatMediaMessage } from '../../lib/chatMedia';
import { showAlert, showConfirm } from '../../lib/ui';
import { MessageBubble } from '@/components/MessageBubble';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

const CATEGORY_ICONS: Record<string, string> = {
  strength: 'dumbbell', footwork: 'footprints', endurance: 'lightning-bolt', recovery: 'heart-pulse',
};

const fmtDate = (d: string) =>
  new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

const fmtTime = (d: string) =>
  new Date(d).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

const fmtNoteDate = (d: string) =>
  new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

export default function CoachSectionScreen() {
  const { tab: initialTab } = useLocalSearchParams<{ tab?: string }>();
  const [activeTab, setActiveTab] = useState<'workouts' | 'plans' | 'notes'>(
    initialTab === 'plans' ? 'plans' : initialTab === 'notes' ? 'notes' : 'workouts'
  );

  // Re-sync when navigated here again with a different ?tab= (e.g. from the
  // notifications page) while this screen is already mounted in the tab bar.
  useEffect(() => {
    if (initialTab === 'plans' || initialTab === 'workouts' || initialTab === 'notes') setActiveTab(initialTab);
  }, [initialTab]);

  // ── Coach notes state ──
  const [notes, setNotes] = useState<any[]>([]);
  const [loadingNotes, setLoadingNotes] = useState(true);

  // ── Assigned workouts state ──
  const [grouped, setGrouped] = useState<Record<string, { coachName: string; assignments: any[] }>>({});
  const [hasCoachConnection, setHasCoachConnection] = useState(true);
  const [loadingWorkouts, setLoadingWorkouts] = useState(true);
  const [myId, setMyId] = useState<string | null>(null);
  const myIdRef = useRef<string | null>(null);
  const [msgInputs, setMsgInputs] = useState<Record<string, string>>({});
  const [sending, setSending] = useState<Record<string, boolean>>({});
  const [sendingMedia, setSendingMedia] = useState<Record<string, boolean>>({});
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
    loadNotes();

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

    const { data: conns } = await supabase.from('coach_connections').select('id').eq('player_id', userId).limit(1);
    setHasCoachConnection((conns ?? []).length > 0);

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

  // ── Coach notes load ──
  const loadNotes = async () => {
    setLoadingNotes(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) { setLoadingNotes(false); return; }
    const { data } = await supabase
      .from('coach_shared_notes')
      .select('*')
      .eq('player_id', session.user.id)
      .order('created_at', { ascending: false });
    const rows = data ?? [];
    const coachIds = [...new Set(rows.map((n: any) => n.coach_id))] as string[];
    const { data: coaches } = coachIds.length
      ? await supabase.from('profiles').select('id, full_name').in('id', coachIds)
      : { data: [] };
    const coachMap: Record<string, string> = {};
    (coaches ?? []).forEach((c: any) => { coachMap[c.id] = c.full_name ?? 'Coach'; });
    setNotes(rows.map((n: any) => ({ ...n, coachName: coachMap[n.coach_id] ?? 'Coach' })));
    setLoadingNotes(false);
  };

  // ── Proof upload ──
  const uploadProof = async (assignment: any) => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') { showAlert('Permission needed', 'Please allow library access.'); return; }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images', 'videos'], quality: 0.7 });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    const kind = asset.type === 'video' ? 'video' : 'image';
    setUploadingProof(prev => ({ ...prev, [assignment.id]: true }));
    const url = await uploadToCloudinary(asset.uri, kind, 'hustler_proof');
    if (!url || !myIdRef.current) { setUploadingProof(prev => ({ ...prev, [assignment.id]: false })); showAlert('Upload failed', 'Please try again.'); return; }
    await supabase.from('assignment_proof').insert({ assignment_id: assignment.id, player_id: myIdRef.current, media_url: url, media_type: kind === 'image' ? 'photo' : 'video' });
    setUploadingProof(prev => ({ ...prev, [assignment.id]: false }));

    // Notify coach that proof was uploaded
    const { data: playerProfile } = await supabase.from('profiles').select('full_name').eq('id', myIdRef.current).single();
    await notifyProofUploaded(assignment.coach_id, playerProfile?.full_name ?? 'Your player', assignment.title);

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

    // Push notification to coach
    const { data: playerProfile } = await supabase.from('profiles').select('full_name').eq('id', userId).single();
    await notifyPlayerMessage(assignment.coach_id, playerProfile?.full_name ?? 'Your player', msg);
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

  // ── Send photo/video message ──
  const pickAndSendMedia = async (assignment: any) => {
    const userId = myIdRef.current;
    if (!userId) return;
    const picked = await pickChatMedia();
    if (picked.status === 'permission-denied') { showAlert('Permission needed', 'Please allow library access.'); return; }
    if (picked.status === 'cancelled') return;

    setSendingMedia(prev => ({ ...prev, [assignment.id]: true }));
    const result = await sendChatMediaMessage({ assignmentId: assignment.id, senderId: userId, uri: picked.uri, kind: picked.kind });
    if (!result) { setSendingMedia(prev => ({ ...prev, [assignment.id]: false })); showAlert('Upload failed', 'Please try again.'); return; }
    const { url, mediaType } = result;
    await supabase.from('notifications').insert({ user_id: assignment.coach_id, type: 'player_message', assignment_id: assignment.id, from_user_id: userId });

    const { data: playerProfile } = await supabase.from('profiles').select('full_name').eq('id', userId).single();
    await notifyPlayerMessage(assignment.coach_id, playerProfile?.full_name ?? 'Your player', mediaType === 'photo' ? '📷 Sent a photo' : '🎥 Sent a video');
    setSendingMedia(prev => ({ ...prev, [assignment.id]: false }));
    setGrouped(prev => {
      const updated = { ...prev };
      Object.keys(updated).forEach(coachId => {
        updated[coachId] = {
          ...updated[coachId],
          assignments: updated[coachId].assignments.map(a =>
            a.id === assignment.id
              ? { ...a, messages: [...a.messages, { id: Date.now().toString(), assignment_id: a.id, sender_id: userId, message: '', media_url: url, media_type: mediaType, created_at: new Date().toISOString() }] }
              : a
          ),
        };
      });
      return updated;
    });
  };

  // ── Delete message ──
  const deleteMessage = (assignment: any, messageId: string) => {
    const userId = myIdRef.current;
    if (!userId) return;
    showConfirm('Delete message', 'Delete this message? This can\'t be undone.', async () => {
      await supabase.from('assignment_messages').delete().eq('id', messageId).eq('sender_id', userId);
      setGrouped(prev => {
        const updated = { ...prev };
        Object.keys(updated).forEach(coachId => {
          updated[coachId] = {
            ...updated[coachId],
            assignments: updated[coachId].assignments.map(a =>
              a.id === assignment.id
                ? { ...a, messages: a.messages.filter((m: any) => m.id !== messageId) }
                : a
            ),
          };
        });
        return updated;
      });
    });
  };

  const toggleChat = (assignment: any) => {
    setExpandedChats(prev => ({ ...prev, [assignment.id]: !prev[assignment.id] }));
    markMessagesSeen(assignment);
  };

  // ── Mark the other person's messages as seen so they can no longer delete them ──
  const markMessagesSeen = (assignment: any) => {
    const userId = myIdRef.current;
    if (!userId) return;
    const unseenIds = (assignment.messages ?? [])
      .filter((m: any) => m.sender_id !== userId && !m.seen_at)
      .map((m: any) => m.id);
    if (!unseenIds.length) return;
    const seenAt = new Date().toISOString();
    supabase.from('assignment_messages').update({ seen_at: seenAt }).in('id', unseenIds).then(() => {});
    setGrouped(prev => {
      const updated = { ...prev };
      Object.keys(updated).forEach(coachId => {
        updated[coachId] = {
          ...updated[coachId],
          assignments: updated[coachId].assignments.map(a =>
            a.id === assignment.id
              ? { ...a, messages: a.messages.map((m: any) => unseenIds.includes(m.id) ? { ...m, seen_at: seenAt } : m) }
              : a
          ),
        };
      });
      return updated;
    });
  };

  const renderNoCoachState = () => (
    <View style={styles.emptyState}>
      <Icon name="whistle-outline" size={56} color={Theme.textSecondary} />
      <Text style={styles.emptyTitle}>No coach yet</Text>
      <Text style={styles.emptyDesc}>Join a club to get assigned workouts, weekly plans, and feedback from a coach.</Text>
    </View>
  );

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
    <View style={styles.container}>

      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Coach</Text>
      </View>

      {/* Tab toggle — icon stacked above a short label. Side-by-side icon+text
          stopped fitting once a third tab was added ("Assigned Workouts" wrapped
          to two lines and looked cramped), so this switches to a vertical
          layout that stays compact and clean at 3 (or more) tabs. */}
      <View style={styles.tabToggle}>
        <TouchableOpacity
          style={[styles.tabBtn, activeTab === 'workouts' && styles.tabBtnActive]}
          onPress={() => setActiveTab('workouts')}
        >
          <Icon name="clipboard-text-outline" size={20} color={activeTab === 'workouts' ? '#fff' : Theme.textSecondary} />
          <Text style={[styles.tabBtnText, activeTab === 'workouts' && styles.tabBtnTextActive]} numberOfLines={1}>Workouts</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tabBtn, activeTab === 'plans' && styles.tabBtnActive]}
          onPress={() => setActiveTab('plans')}
        >
          <Icon name="calendar-week" size={20} color={activeTab === 'plans' ? '#fff' : Theme.textSecondary} />
          <Text style={[styles.tabBtnText, activeTab === 'plans' && styles.tabBtnTextActive]} numberOfLines={1}>Plans</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tabBtn, activeTab === 'notes' && styles.tabBtnActive]}
          onPress={() => setActiveTab('notes')}
        >
          <Icon name="notebook-outline" size={20} color={activeTab === 'notes' ? '#fff' : Theme.textSecondary} />
          <Text style={[styles.tabBtnText, activeTab === 'notes' && styles.tabBtnTextActive]} numberOfLines={1}>Notes</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* ── ASSIGNED WORKOUTS TAB ── */}
        {activeTab === 'workouts' && (
          loadingWorkouts ? (
            <ActivityIndicator color={'#123C35'} style={{ marginTop: 40 }} />
          ) : !hasCoachConnection ? (
            renderNoCoachState()
          ) :coachIds.length === 0 ? (
            <View style={styles.emptyState}>
              <Icon name="clipboard-text-outline" size={56} color={Theme.textSecondary} />
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
                      <View style={styles.coachNameRow}>
                        <Text style={styles.coachName}>{coachName}</Text>
                        <View style={styles.coachBadge}>
                          <Text style={styles.coachBadgeText}>COACH</Text>
                        </View>
                      </View>
                      <Text style={styles.coachCount}>{assignments.length} workout{assignments.length !== 1 ? 's' : ''}</Text>
                    </View>
                  </View>

                  {assignments.map((a: any) => (
                    <View key={a.id} style={styles.assignCard}>
                      {/* Title + status */}
                      <View style={styles.assignTopRow}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.assignTitle}>{a.title}</Text>
                          <Text style={styles.assignSub}>
                            {a.doneAt ? `Completed · ${fmtDate(a.doneAt)}` : a.proof ? 'Proof submitted' : `Assigned ${fmtDate(a.created_at)}`}
                          </Text>
                        </View>
                        {a.doneAt ? (
                          <View style={[styles.statusChip, styles.statusDone]}>
                            <Icon name="check-circle" size={13} color={'#123C35'} />
                            <Text style={[styles.statusText, styles.statusTextDone]}>Done</Text>
                          </View>
                        ) : a.proof ? (
                          <View style={[styles.statusChip, styles.statusCompleted]}>
                            <Icon name="check-decagram" size={13} color="#1E8E3E" />
                            <Text style={[styles.statusText, styles.statusTextCompleted]}>Completed</Text>
                          </View>
                        ) : (
                          <View style={[styles.statusChip, styles.statusPending]}>
                            <Icon name="clock-outline" size={13} color={Theme.textSecondary} />
                            <Text style={[styles.statusText, styles.statusTextPending]}>Not yet</Text>
                          </View>
                        )}
                      </View>

                      {a.instructions ? <Text style={styles.instructions}>{a.instructions}</Text> : null}

                      {/* Proof */}
                      {a.requires_proof && (
                        <View style={styles.proofSection}>
                          {a.proof ? (
                            <View>
                              <View style={styles.proofLabelRow}>
                                <Text style={styles.proofLabel}>Proof uploaded</Text>
                                <TouchableOpacity onPress={() => deleteProof(a)}>
                                  <Icon name="trash-can-outline" size={18} color="#E74C3C" />
                                </TouchableOpacity>
                              </View>
                              {a.proof.media_type === 'photo' ? (
                                <TouchableOpacity onPress={() => Linking.openURL(a.proof.media_url)}>
                                  <Image source={{ uri: a.proof.media_url }} style={styles.proofThumb} resizeMode="cover" />
                                  <Text style={styles.proofTap}>Tap to view full size</Text>
                                </TouchableOpacity>
                              ) : (
                                <TouchableOpacity style={styles.videoProof} onPress={() => Linking.openURL(a.proof.media_url)}>
                                  <Icon name="play-circle-outline" size={28} color={'#123C35'} />
                                  <Text style={styles.videoProofText}>Tap to watch your video</Text>
                                </TouchableOpacity>
                              )}
                            </View>
                          ) : uploadingProof[a.id] ? (
                            <View style={styles.uploadingRow}>
                              <ActivityIndicator size="small" color={'#123C35'} />
                              <Text style={styles.uploadingText}>Uploading...</Text>
                            </View>
                          ) : (
                            <TouchableOpacity style={styles.uploadProofBtn} onPress={() => uploadProof(a)}>
                              <Icon name="camera-plus-outline" size={18} color={'#123C35'} />
                              <Text style={styles.uploadProofText}>Upload proof of completion</Text>
                            </TouchableOpacity>
                          )}
                        </View>
                      )}

                      {/* Chat toggle */}
                      <TouchableOpacity style={styles.chatToggle} onPress={() => toggleChat(a)}>
                        <Icon name="message-outline" size={15} color={'#123C35'} />
                        <Text style={styles.chatToggleText}>{a.messages.length > 0 ? `Messages (${a.messages.length})` : 'Ask your coach a question'}</Text>
                        <Icon name={expandedChats[a.id] ? 'chevron-up' : 'chevron-down'} size={16} color={Theme.textSecondary} />
                      </TouchableOpacity>

                      {/* Expanded chat */}
                      {expandedChats[a.id] && (
                        <>
                          {a.messages.length > 0 && (
                            <View style={styles.chatThread}>
                              {a.messages.map((m: any) => (
                                <MessageBubble
                                  key={m.id}
                                  isMine={m.sender_id === myIdRef.current}
                                  senderLabel={`Coach ${coachName}`}
                                  message={m.message}
                                  mediaUrl={m.media_url}
                                  mediaType={m.media_type}
                                  timeLabel={fmtTime(m.created_at)}
                                  onDelete={() => deleteMessage(a, m.id)}
                                  deletable={!m.seen_at}
                                />
                              ))}
                            </View>
                          )}
                          <View style={styles.inputRow}>
                            <TouchableOpacity
                              style={styles.mediaBtn}
                              onPress={() => pickAndSendMedia(a)}
                              disabled={sendingMedia[a.id]}
                            >
                              {sendingMedia[a.id] ? <ActivityIndicator size="small" color={'#123C35'} /> : <Icon name="image-multiple-outline" size={20} color={'#123C35'} />}
                            </TouchableOpacity>
                            <TextInput
                              style={styles.textInput}
                              placeholder="Type a message..."
                              placeholderTextColor={Theme.textSecondary}
                              value={msgInputs[a.id] ?? ''}
                              onChangeText={(t) => setMsgInputs(prev => ({ ...prev, [a.id]: t }))}
                              multiline
                            />
                            <TouchableOpacity
                              style={[styles.sendBtn, (!msgInputs[a.id]?.trim() || sending[a.id]) && styles.sendBtnDisabled]}
                              onPress={() => sendMessage(a)}
                              disabled={!msgInputs[a.id]?.trim() || sending[a.id]}
                            >
                              {sending[a.id] ? <ActivityIndicator size="small" color={Theme.limeAccentDark} /> : <Icon name="send" size={15} color={Theme.limeAccentDark} />}
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
            <ActivityIndicator color={'#123C35'} style={{ marginTop: 40 }} />
          ) : !hasCoachConnection ? (
            renderNoCoachState()
          ) :plans.length === 0 ? (
            <View style={styles.emptyState}>
              <Icon name="calendar-blank-outline" size={56} color={Theme.textSecondary} />
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
                            <Icon name="bed-outline" size={20} color={Theme.textSecondary} />
                            <Text style={styles.restDayText}>Rest day</Text>
                          </View>
                        ) : (
                          dayExs.map((ex: any, ei: number) => {
                            const cat = CategoryTheme[ex.category as keyof typeof CategoryTheme] ?? { bg: '#E1F3EE', fg: '#123C35' };
                            return (
                              <TouchableOpacity key={ei} style={styles.planExCard} onPress={() => openExercise(ex)}>
                                <View style={[styles.planExIcon, { backgroundColor: cat.bg }]}>
                                  <Icon name={(CATEGORY_ICONS[ex.category] ?? 'dumbbell') as any} size={18} color={cat.fg} />
                                </View>
                                <View style={{ flex: 1 }}>
                                  <Text style={styles.planExName}>{ex.name}</Text>
                                  <Text style={styles.planExCat}>{ex.category.charAt(0).toUpperCase() + ex.category.slice(1)}</Text>
                                </View>
                                <Icon name="chevron-right" size={18} color={Theme.textMuted} />
                              </TouchableOpacity>
                            );
                          })
                        )}
                      </View>
                    );
                  })}
                </View>
              );
            })
          )
        )}

        {/* ── NOTES TAB ── */}
        {activeTab === 'notes' && (
          loadingNotes ? (
            <ActivityIndicator color={'#123C35'} style={{ marginTop: 40 }} />
          ) : !hasCoachConnection && notes.length === 0 ? (
            renderNoCoachState()
          ) : notes.length === 0 ? (
            <View style={styles.emptyState}>
              <Icon name="notebook-outline" size={56} color={Theme.textSecondary} />
              <Text style={styles.emptyTitle}>No notes yet</Text>
              <Text style={styles.emptyDesc}>Notes your coach shares with you will show up here.</Text>
            </View>
          ) : (
            notes.map((n: any) => (
              <View key={n.id} style={styles.noteCard}>
                <Text style={styles.noteText}>{n.note}</Text>
                <View style={styles.noteFooter}>
                  <Text style={styles.noteFrom}>— {n.coachName}</Text>
                  <Text style={styles.noteDate}>{fmtNoteDate(n.created_at)}</Text>
                </View>
              </View>
            ))
          )
        )}

      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Theme.background },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 24, paddingTop: 60, paddingBottom: 12 },
  title: { fontFamily: Fonts.serifMedium, fontSize: 34, color: Theme.textPrimary },

  // Tab toggle
  tabToggle: { flexDirection: 'row', marginHorizontal: 24, marginBottom: 20, backgroundColor: Theme.cardWhite, borderRadius: 14, padding: 5, gap: 5 },
  tabBtn: { flex: 1, flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 12, borderRadius: 11 },
  tabBtnActive: { backgroundColor: '#123C35' },
  tabBtnText: { fontSize: 12.5, fontWeight: '600', color: Theme.textSecondary },
  tabBtnTextActive: { color: '#fff' },

  scroll: { padding: 24, paddingTop: 4, paddingBottom: 120 },

  emptyState: { alignItems: 'center', paddingTop: 60, gap: 14 },
  emptyTitle: { fontSize: 19, fontWeight: 'bold', color: Theme.textPrimary },
  emptyDesc: { fontSize: 16, color: Theme.textSecondary, textAlign: 'center', lineHeight: 23 },

  // Coach section
  coachSection: { marginBottom: 28 },
  coachHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  coachAvatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#123C35', alignItems: 'center', justifyContent: 'center' },
  coachAvatarText: { fontSize: 16, fontWeight: 'bold', color: '#fff' },
  coachNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  coachName: { fontSize: 16, fontWeight: 'bold', color: Theme.textPrimary },
  coachBadge: { backgroundColor: '#123C35', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  coachBadgeText: { fontSize: 10, fontWeight: '800', color: '#fff', letterSpacing: 0.5 },
  coachCount: { fontSize: 13, color: Theme.textSecondary },

  // Assignment cards
  assignCard: { backgroundColor: Theme.cardWhite, borderRadius: 14, padding: 14, marginBottom: 10, gap: 10 },
  assignTopRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  assignTitle: { fontSize: 16, fontWeight: '700', color: Theme.textPrimary },
  assignSub: { fontSize: 13, color: Theme.textSecondary, marginTop: 2 },
  statusChip: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 4 },
  statusDone: { backgroundColor: '#E1F3EE' },
  statusCompleted: { backgroundColor: '#E3F8E3' },
  statusPending: { backgroundColor: Theme.background },
  statusText: { fontSize: 12, fontWeight: '600' },
  statusTextDone: { color: '#123C35' },
  statusTextCompleted: { color: '#1E8E3E' },
  statusTextPending: { color: Theme.textSecondary },
  instructions: { fontSize: 14, color: Theme.textSecondary, lineHeight: 19 },

  // Proof
  proofSection: { gap: 6 },
  proofLabelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  proofLabel: { fontSize: 13, color: Theme.textSecondary, fontWeight: '600' },
  proofThumb: { width: '100%', height: 160, borderRadius: 10, backgroundColor: Theme.background },
  proofTap: { fontSize: 13, color: Theme.textSecondary, marginTop: 4, textAlign: 'center' },
  videoProof: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#E1F3EE', borderRadius: 10, padding: 12 },
  videoProofText: { fontSize: 13, color: '#123C35', fontWeight: '600' },
  uploadProofBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#E1F3EE', borderRadius: 10, padding: 12, borderWidth: 1, borderColor: '#123C35', borderStyle: 'dashed' },
  uploadProofText: { fontSize: 13, color: '#123C35', fontWeight: '600' },
  uploadingRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12 },
  uploadingText: { fontSize: 13, color: '#123C35' },

  // Chat
  chatToggle: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8, borderTopWidth: 1, borderTopColor: Theme.divider },
  chatToggleText: { flex: 1, fontSize: 13, color: '#123C35', fontWeight: '600' },
  chatThread: { gap: 6 },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, marginTop: 4 },
  mediaBtn: { width: 38, height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: Theme.background, borderWidth: 1, borderColor: Theme.divider },
  textInput: { flex: 1, backgroundColor: Theme.background, borderRadius: 10, padding: 10, color: Theme.textPrimary, fontSize: 14, borderWidth: 1, borderColor: Theme.divider, maxHeight: 80 },
  sendBtn: { backgroundColor: Theme.limeAccent, borderRadius: 10, width: 38, height: 38, alignItems: 'center', justifyContent: 'center' },
  sendBtnDisabled: { opacity: 0.4 },

  // Weekly plan cards
  planCard: { backgroundColor: Theme.cardWhite, borderRadius: 16, padding: 16, marginBottom: 20 },
  planHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
  weekLabel: { fontSize: 13, color: Theme.textSecondary, marginTop: 1 },
  latestBadge: { backgroundColor: '#E1F3EE', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 },
  latestBadgeText: { fontSize: 12, color: '#123C35', fontWeight: '700' },
  dayTab: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, backgroundColor: Theme.background, borderWidth: 1, borderColor: 'transparent', flexDirection: 'row', alignItems: 'center', gap: 5 },
  dayTabActive: { backgroundColor: '#123C35', borderColor: '#123C35' },
  dayTabToday: { borderColor: '#123C35' },
  dayTabText: { fontSize: 13, color: Theme.textSecondary, fontWeight: '600' },
  dayTabTextActive: { color: '#fff' },
  dayTabCount: { backgroundColor: 'rgba(0,0,0,0.08)', borderRadius: 8, minWidth: 16, height: 16, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 },
  dayTabCountActive: { backgroundColor: 'rgba(255,255,255,0.3)' },
  dayTabCountText: { fontSize: 10, color: '#fff', fontWeight: 'bold' },
  todayDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: '#123C35' },
  dayTitle: { fontSize: 15, fontWeight: '700', color: Theme.textPrimary, marginBottom: 10 },
  restDayCard: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 14, backgroundColor: Theme.background, borderRadius: 10 },
  restDayText: { fontSize: 14, color: Theme.textSecondary },
  planExCard: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: Theme.background, borderRadius: 10, padding: 12, marginBottom: 8 },
  planExIcon: { width: 36, height: 36, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  planExName: { fontSize: 15, fontWeight: '600', color: Theme.textPrimary },
  planExCat: { fontSize: 13, color: Theme.textSecondary, marginTop: 2 },

  // Notes tab
  noteCard: { backgroundColor: Theme.cardWhite, borderRadius: 14, padding: 16, marginBottom: 12, gap: 10 },
  noteText: { fontSize: 16, color: Theme.textPrimary, lineHeight: 22 },
  noteFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  noteFrom: { fontSize: 13, color: '#123C35', fontWeight: '600' },
  noteDate: { fontSize: 13, color: Theme.textSecondary },
});
