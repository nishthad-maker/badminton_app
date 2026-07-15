import { View, StyleSheet, TouchableOpacity, ScrollView, TextInput, ActivityIndicator, Switch, Alert, Linking } from 'react-native';
import { Text } from '@/components/Text';
import { router, useLocalSearchParams } from 'expo-router';
import { useState, useEffect, useRef, useCallback } from 'react';
import { useFocusEffect } from 'expo-router';
import { Audio } from 'expo-av';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Theme, Fonts } from '@/constants/theme';
import { supabase } from '../lib/supabase';
import { notifyMatchShared, notifyPlayerMessage } from '../lib/notifications';
import { showAlert } from '../lib/ui';
import { MessageBubble } from '@/components/MessageBubble';

const fmtDate = (d: string) => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
const fmtTime = (d: string) => new Date(d).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

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

const topTagCounts = (logs: any[]) => {
  const counts: Record<string, { source: 'strength' | 'weakness'; count: number }> = {};
  logs.forEach(l => {
    (l.strengths_tags ?? []).forEach((tag: string) => {
      counts[tag] = counts[tag] ?? { source: 'strength', count: 0 };
      counts[tag].count += 1;
    });
    (l.weaknesses_tags ?? []).forEach((tag: string) => {
      counts[tag] = counts[tag] ?? { source: 'weakness', count: 0 };
      counts[tag].count += 1;
    });
  });
  return Object.entries(counts).sort((a, b) => b[1].count - a[1].count).map(([tag, v]) => ({ tag, source: v.source }));
};

export default function OpponentDetailScreen() {
  const { opponentId, name } = useLocalSearchParams();
  const [opponentName, setOpponentName] = useState((name as string) ?? 'Opponent');
  const [wins, setWins] = useState(0);
  const [losses, setLosses] = useState(0);
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [myId, setMyId] = useState<string | null>(null);
  const [myName, setMyName] = useState('Your player');

  const [playingId, setPlayingId] = useState<string | null>(null);
  const soundRef = useRef<Audio.Sound | null>(null);

  const [expandedChats, setExpandedChats] = useState<Record<string, boolean>>({});
  const [msgInputs, setMsgInputs] = useState<Record<string, string>>({});
  const [sendingMsg, setSendingMsg] = useState<Record<string, boolean>>({});

  const load = async () => {
    if (!opponentId) { setLoading(false); return; }
    setLoading(true);

    const { data: { session } } = await supabase.auth.getSession();
    let me: string | null = null;
    if (session?.user) {
      me = session.user.id;
      setMyId(me);
      const { data: prof } = await supabase.from('profiles').select('full_name').eq('id', me).single();
      if (prof?.full_name) setMyName(prof.full_name);
    }

    const { data: opp } = await supabase.from('opponents').select('*').eq('id', opponentId).single();
    if (opp) { setOpponentName(opp.name); setWins(opp.wins); setLosses(opp.losses); }

    const { data: logData } = await supabase.from('opponent_logs').select('*').eq('opponent_id', opponentId).order('created_at', { ascending: false });
    const rows = logData ?? [];

    const sharedIds = rows.filter(l => l.shared_with_coach).map(l => l.id);
    const { data: msgs } = sharedIds.length
      ? await supabase.from('opponent_log_messages').select('*').in('opponent_log_id', sharedIds).order('created_at', { ascending: true })
      : { data: [] };
    const msgMap: Record<string, any[]> = {};
    (msgs ?? []).forEach((m: any) => {
      if (!msgMap[m.opponent_log_id]) msgMap[m.opponent_log_id] = [];
      msgMap[m.opponent_log_id].push(m);
    });

    setLogs(rows.map(l => ({ ...l, messages: msgMap[l.id] ?? [] })));
    setLoading(false);
  };

  useFocusEffect(useCallback(() => { load(); }, [opponentId]));

  useEffect(() => () => { if (soundRef.current) soundRef.current.unloadAsync(); }, []);

  const goBack = () => {
    if (typeof window !== 'undefined') window.history.back();
    else router.back();
  };

  const playVoiceNote = async (log: any) => {
    if (soundRef.current) {
      await soundRef.current.stopAsync();
      await soundRef.current.unloadAsync();
      soundRef.current = null;
    }
    if (playingId === log.id) { setPlayingId(null); return; }
    const { sound } = await Audio.Sound.createAsync({ uri: log.voice_note_url }, { shouldPlay: true });
    soundRef.current = sound;
    setPlayingId(log.id);
    sound.setOnPlaybackStatusUpdate(status => {
      if (status.isLoaded && status.didJustFinish) { setPlayingId(null); }
    });
  };

  const editLog = (log: any) => {
    router.push({ pathname: '/log-match', params: { opponentId: opponentId as string, name: opponentName, logId: log.id } });
  };

  const deleteLog = (log: any) => {
    showConfirm('Delete this log?', 'This will permanently remove this match log.', async () => {
      await supabase.from('opponent_logs').delete().eq('id', log.id);
      if (log.result === 'win' || log.result === 'loss') {
        const { data: opp } = await supabase.from('opponents').select('wins, losses').eq('id', opponentId).single();
        if (opp) {
          await supabase.from('opponents').update({
            wins: log.result === 'win' ? Math.max(0, opp.wins - 1) : opp.wins,
            losses: log.result === 'loss' ? Math.max(0, opp.losses - 1) : opp.losses,
            updated_at: new Date().toISOString(),
          }).eq('id', opponentId);
        }
      }
      load();
    });
  };

  const toggleShare = async (log: any, next: boolean) => {
    setLogs(prev => prev.map(l => l.id === log.id ? { ...l, shared_with_coach: next } : l));
    await supabase.from('opponent_logs').update({ shared_with_coach: next, updated_at: new Date().toISOString() }).eq('id', log.id);
    if (next && myId) {
      const { data: conns } = await supabase.from('coach_connections').select('coach_id').eq('player_id', myId).eq('status', 'accepted');
      for (const c of conns ?? []) {
        await notifyMatchShared(c.coach_id, myName, opponentName);
      }
    }
  };

  const toggleChat = (id: string) => setExpandedChats(prev => ({ ...prev, [id]: !prev[id] }));

  const sendMessage = async (log: any) => {
    const msg = (msgInputs[log.id] ?? '').trim();
    if (!msg || !myId) return;
    setSendingMsg(prev => ({ ...prev, [log.id]: true }));
    const { data: inserted, error } = await supabase
      .from('opponent_log_messages').insert({ opponent_log_id: log.id, sender_id: myId, message: msg }).select().single();
    setSendingMsg(prev => ({ ...prev, [log.id]: false }));
    if (error) { showAlert('Error', 'Could not send your message. Please try again.'); return; }
    setMsgInputs(prev => ({ ...prev, [log.id]: '' }));
    setLogs(prev => prev.map(l => l.id === log.id ? { ...l, messages: [...l.messages, inserted] } : l));

    const { data: conns } = await supabase.from('coach_connections').select('coach_id').eq('player_id', myId).eq('status', 'accepted');
    for (const c of conns ?? []) { await notifyPlayerMessage(c.coach_id, myName, msg); }
  };

  const topTags = topTagCounts(logs);

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <View style={styles.titleRow}>
          <TouchableOpacity onPress={goBack}>
            <MaterialCommunityIcons name="arrow-left" size={24} color={Theme.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.title}>{opponentName}</Text>
        </View>

        {loading ? (
          <ActivityIndicator color={Theme.eyebrowGreen} style={{ marginTop: 40 }} />
        ) : (
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
            <View style={styles.headerCard}>
              <Text style={styles.record}>{wins}-{losses}</Text>
              <Text style={styles.recordLabel}>Record</Text>
              {topTags.length > 0 && (
                <View style={styles.chipRow}>
                  {topTags.map(t => (
                    <View key={t.tag} style={[styles.chip, t.source === 'weakness' ? styles.chipWeakness : styles.chipStrength]}>
                      <Text style={styles.chipText}>{t.tag}</Text>
                    </View>
                  ))}
                </View>
              )}
            </View>

            <TouchableOpacity
              style={styles.logAgainBtn}
              onPress={() => router.push({ pathname: '/log-match', params: { opponentId: opponentId as string, name: opponentName } })}
            >
              <MaterialCommunityIcons name="plus" size={18} color={Theme.limeAccentDark} />
              <Text style={styles.logAgainText}>Log another match vs {opponentName}</Text>
            </TouchableOpacity>

            <Text style={styles.sectionLabel}>HISTORY ({logs.length})</Text>
            {logs.length === 0 ? (
              <View style={styles.emptyState}>
                <MaterialCommunityIcons name="clipboard-text-outline" size={40} color={Theme.textSecondary} />
                <Text style={styles.emptyDesc}>No logs yet.</Text>
              </View>
            ) : (
              logs.map(log => (
                <View key={log.id} style={styles.logCard}>
                  <View style={styles.logTopRow}>
                    <Text style={styles.logDate}>{fmtDate(log.created_at)}</Text>
                    <View style={styles.logTopRowRight}>
                      {log.is_quick_log && <View style={styles.quickBadge}><Text style={styles.quickBadgeText}>Quick log</Text></View>}
                      <TouchableOpacity onPress={() => editLog(log)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                        <MaterialCommunityIcons name="pencil-outline" size={18} color={Theme.textSecondary} />
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => deleteLog(log)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                        <MaterialCommunityIcons name="trash-can-outline" size={18} color="#FF6B6B" />
                      </TouchableOpacity>
                    </View>
                  </View>

                  <View style={styles.scoreResultRow}>
                    {log.score && <Text style={styles.logScore}>{log.score}</Text>}
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
                      {log.strengths_text && <Text style={styles.logNote}>{log.strengths_text}</Text>}
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
                      {log.weaknesses_text && <Text style={styles.logNote}>{log.weaknesses_text}</Text>}
                    </View>
                  )}

                  {log.next_time_text && (
                    <View style={styles.logSection}>
                      <Text style={styles.logSectionLabel}>NEXT TIME</Text>
                      <Text style={styles.logNote}>{log.next_time_text}</Text>
                    </View>
                  )}

                  {log.video_url && (
                    <TouchableOpacity style={styles.voiceRow} onPress={() => Linking.openURL(log.video_url)}>
                      <MaterialCommunityIcons name="link-variant" size={20} color={Theme.eyebrowGreen} />
                      <Text style={styles.voiceText}>Watch match video</Text>
                    </TouchableOpacity>
                  )}
                  {log.voice_note_url && (
                    <TouchableOpacity style={styles.voiceRow} onPress={() => playVoiceNote(log)}>
                      <MaterialCommunityIcons name={playingId === log.id ? 'pause-circle' : 'play-circle'} size={22} color={Theme.eyebrowGreen} />
                      <Text style={styles.voiceText}>Voice note{log.voice_note_duration_seconds ? ` · ${log.voice_note_duration_seconds}s` : ''}</Text>
                    </TouchableOpacity>
                  )}

                  <View style={styles.shareRow}>
                    <Text style={styles.shareLabel}>Share with coach</Text>
                    <Switch
                      value={log.shared_with_coach}
                      onValueChange={(v) => toggleShare(log, v)}
                      trackColor={{ false: Theme.divider, true: Theme.eyebrowGreen }}
                      thumbColor="#FFFFFF"
                    />
                  </View>

                  {log.shared_with_coach && (
                    <View style={styles.chatSection}>
                      <TouchableOpacity style={styles.chatToggle} onPress={() => toggleChat(log.id)}>
                        <MaterialCommunityIcons name="message-outline" size={15} color={Theme.eyebrowGreen} />
                        <Text style={styles.chatToggleText}>{log.messages.length > 0 ? `Coach feedback (${log.messages.length})` : 'No feedback yet'}</Text>
                        <MaterialCommunityIcons name={expandedChats[log.id] ? 'chevron-up' : 'chevron-down'} size={16} color={Theme.textSecondary} />
                      </TouchableOpacity>
                      {expandedChats[log.id] && (
                        <>
                          {log.messages.length > 0 && (
                            <View style={styles.chatThread}>
                              {log.messages.map((m: any) => (
                                <MessageBubble
                                  key={m.id}
                                  isMine={m.sender_id === myId}
                                  senderLabel="Coach"
                                  message={m.message}
                                  mediaUrl={null}
                                  mediaType={null}
                                  timeLabel={fmtTime(m.created_at)}
                                />
                              ))}
                            </View>
                          )}
                          <View style={styles.inputRow}>
                            <TextInput
                              style={styles.input}
                              placeholder="Reply to your coach..."
                              placeholderTextColor={Theme.textSecondary}
                              value={msgInputs[log.id] ?? ''}
                              onChangeText={(t) => setMsgInputs(prev => ({ ...prev, [log.id]: t }))}
                              multiline
                            />
                            <TouchableOpacity
                              style={[styles.sendBtn, (!msgInputs[log.id]?.trim() || sendingMsg[log.id]) && styles.sendBtnDisabled]}
                              onPress={() => sendMessage(log)}
                              disabled={!msgInputs[log.id]?.trim() || sendingMsg[log.id]}
                            >
                              {sendingMsg[log.id] ? <ActivityIndicator size="small" color={Theme.limeAccentDark} /> : <MaterialCommunityIcons name="send" size={16} color={Theme.limeAccentDark} />}
                            </TouchableOpacity>
                          </View>
                        </>
                      )}
                    </View>
                  )}
                </View>
              ))
            )}
          </ScrollView>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Theme.background },
  content: { flex: 1, padding: 24, paddingTop: 60 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 20 },
  title: { fontFamily: Fonts.serifMedium, fontSize: 26, color: Theme.textPrimary },
  scroll: { paddingBottom: 60 },
  headerCard: { backgroundColor: Theme.cardWhite, borderRadius: 16, padding: 16, marginBottom: 16, alignItems: 'center' },
  record: { fontSize: 32, fontWeight: 'bold', color: Theme.textPrimary },
  recordLabel: { fontSize: 13, color: Theme.textSecondary, marginBottom: 10 },
  logAgainBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: Theme.limeAccent, borderRadius: 12, paddingVertical: 14, marginBottom: 20 },
  logAgainText: { color: Theme.limeAccentDark, fontWeight: 'bold', fontSize: 14 },
  sectionLabel: { fontSize: 11, fontWeight: 'bold', color: Theme.eyebrowGreen, letterSpacing: 1, marginBottom: 12 },
  logCard: { backgroundColor: Theme.cardWhite, borderRadius: 14, padding: 14, marginBottom: 12, gap: 10 },
  logTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  logTopRowRight: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  logDate: { fontSize: 13, color: Theme.textSecondary },
  quickBadge: { backgroundColor: Theme.background, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  quickBadgeText: { fontSize: 12, color: Theme.textSecondary, fontWeight: '600' },
  scoreResultRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  logScore: { fontSize: 16, fontWeight: '600', color: Theme.textPrimary },
  resultBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 },
  resultBadgeText: { fontSize: 13, fontWeight: '700' },
  logSection: { gap: 6, paddingTop: 6, borderTopWidth: 1, borderTopColor: Theme.divider },
  logSectionLabel: { fontSize: 11, fontWeight: 'bold', color: Theme.textSecondary, letterSpacing: 1 },
  logNote: { fontSize: 14, color: Theme.textSecondary, lineHeight: 19 },
  voiceRow: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: Theme.cardTinted, borderRadius: 10, padding: 10 },
  voiceText: { fontSize: 13, color: Theme.eyebrowGreen, fontWeight: '600' },
  shareRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 6, borderTopWidth: 1, borderTopColor: Theme.divider },
  shareLabel: { fontSize: 13, color: Theme.textSecondary, fontWeight: '600' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  chipStrength: { backgroundColor: 'rgba(46,204,113,0.14)' },
  chipWeakness: { backgroundColor: 'rgba(231,76,60,0.12)' },
  chipText: { fontSize: 13, color: Theme.textPrimary },
  emptyState: { alignItems: 'center', paddingTop: 40, gap: 10 },
  emptyDesc: { fontSize: 15, color: Theme.textSecondary, textAlign: 'center' },
  chatSection: { gap: 8, paddingTop: 6, borderTopWidth: 1, borderTopColor: Theme.divider },
  chatToggle: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 4 },
  chatToggleText: { flex: 1, fontSize: 13, color: Theme.eyebrowGreen, fontWeight: '600' },
  chatThread: { gap: 6 },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, marginTop: 4 },
  input: { flex: 1, backgroundColor: Theme.background, borderRadius: 10, padding: 10, color: Theme.textPrimary, fontSize: 14, borderWidth: 1, borderColor: Theme.divider, maxHeight: 80 },
  sendBtn: { backgroundColor: Theme.limeAccent, borderRadius: 10, width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  sendBtnDisabled: { opacity: 0.4 },
});
