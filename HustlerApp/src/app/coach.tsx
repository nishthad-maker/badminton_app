import { View, Text, StyleSheet, TouchableOpacity, ScrollView, RefreshControl, Alert } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useFocusEffect } from 'expo-router';
import { useState, useEffect, useCallback } from 'react';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Colors } from '@/constants/theme';
import { supabase } from '../lib/supabase';

const showConfirm = (title: string, message: string, onConfirm: () => void) => {
  if (typeof window !== 'undefined') {
    if (window.confirm(`${title}\n\n${message}`)) onConfirm();
  } else {
    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'OK', style: 'destructive', onPress: onConfirm },
    ]);
  }
};

const timeAgo = (dateStr: string | null): string => {
  if (!dateStr) return 'No sessions yet';
  const then = new Date(dateStr).getTime();
  const mins = Math.floor((Date.now() - then) / 60000);
  if (mins < 1) return 'Active just now';
  if (mins < 60) return `Active ${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `Active ${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days === 1) return 'Active yesterday';
  if (days < 7) return `Active ${days} days ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `Active ${weeks}w ago`;
  return `Active ${Math.floor(days / 30)}mo ago`;
};

type PendingRow = { id: string; player_id: string; name: string; created_at: string };
type PlayerRow = {
  id: string;
  player_id: string;
  name: string;
  lastActive: string | null;
  unread: number;
  weekSessions: number;
  latestAssignment: { title: string; done: boolean } | null;
};

export default function CoachHomeScreen() {
  const [coachUsername, setCoachUsername] = useState('');
  const [pending, setPending] = useState<PendingRow[]>([]);
  const [players, setPlayers] = useState<PlayerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [myId, setMyId] = useState<string | null>(null);

  const load = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) { router.replace('/login' as any); return; }
    const me = session.user.id;
    setMyId(me);

    const { data: myProfile } = await supabase
      .from('profiles').select('coach_username, is_coach').eq('id', me).single();
    if (myProfile && myProfile.is_coach === false) { router.replace('/(tabs)' as any); return; }
    setCoachUsername(myProfile?.coach_username ?? '');

    const { data: conns } = await supabase
      .from('coach_connections').select('id, player_id, status, created_at').eq('coach_id', me);

    const pend = (conns ?? []).filter((c: any) => c.status === 'pending');
    const acc = (conns ?? []).filter((c: any) => c.status === 'accepted');
    const accIds = acc.map((c: any) => c.player_id);

    // Names
    const ids = [...new Set([...pend, ...acc].map((c: any) => c.player_id))];
    const nameMap: Record<string, string> = {};
    if (ids.length) {
      const { data: profs } = await supabase.from('profiles').select('id, full_name').in('id', ids);
      (profs ?? []).forEach((p: any) => { nameMap[p.id] = p.full_name; });
    }

    // Last active
    const activeMap: Record<string, string> = {};
    if (accIds.length) {
      const { data: sess } = await supabase
        .from('session_logs').select('user_id, created_at').in('user_id', accIds).order('created_at', { ascending: false });
      (sess ?? []).forEach((s: any) => { if (!activeMap[s.user_id]) activeMap[s.user_id] = s.created_at; });
    }

    // Sessions this week per player
    const weekStart = new Date();
    weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() + 6) % 7));
    weekStart.setHours(0, 0, 0, 0);
    const weekSessionMap: Record<string, number> = {};
    if (accIds.length) {
      const { data: weekSess } = await supabase
        .from('session_logs').select('user_id, created_at').in('user_id', accIds)
        .gte('created_at', weekStart.toISOString());
      (weekSess ?? []).forEach((s: any) => {
        weekSessionMap[s.user_id] = (weekSessionMap[s.user_id] || 0) + 1;
      });
    }

    // Latest assignment per player + whether it's done
    const latestAsgMap: Record<string, { title: string; done: boolean }> = {};
    if (accIds.length) {
      const { data: asgs } = await supabase
        .from('assignments').select('*').eq('coach_id', me).in('player_id', accIds)
        .order('created_at', { ascending: false });

      // Get all session logs to check done status
      const { data: allLogs } = await supabase
        .from('session_logs').select('user_id, exercise_name, created_at').in('user_id', accIds);

      (asgs ?? []).forEach((a: any) => {
        if (!latestAsgMap[a.player_id]) {
          const done = (allLogs ?? []).some((s: any) =>
            s.user_id === a.player_id &&
            s.exercise_name === a.title &&
            new Date(s.created_at) >= new Date(a.created_at)
          );
          latestAsgMap[a.player_id] = { title: a.title, done };
        }
      });
    }

    // Unread notifications
    const unreadMap: Record<string, number> = {};
    if (accIds.length) {
      const { data: notifs } = await supabase
        .from('notifications').select('from_user_id').eq('user_id', me).eq('seen', false);
      (notifs ?? []).forEach((n: any) => { unreadMap[n.from_user_id] = (unreadMap[n.from_user_id] || 0) + 1; });
    }

    setPending(pend.map((c: any) => ({
      id: c.id, player_id: c.player_id, name: nameMap[c.player_id] ?? 'Player', created_at: c.created_at,
    })));

    setPlayers(acc.map((c: any) => ({
      id: c.id,
      player_id: c.player_id,
      name: nameMap[c.player_id] ?? 'Player',
      lastActive: activeMap[c.player_id] ?? null,
      unread: unreadMap[c.player_id] ?? 0,
      weekSessions: weekSessionMap[c.player_id] ?? 0,
      latestAssignment: latestAsgMap[c.player_id] ?? null,
    })));

    setLoading(false);
    setRefreshing(false);
  };

  useEffect(() => { load(); }, []);
  useFocusEffect(useCallback(() => { load(); }, []));

  const onRefresh = () => { setRefreshing(true); load(); };

  const acceptRequest = async (id: string) => {
    await supabase.from('coach_connections').update({ status: 'accepted', accepted_at: new Date().toISOString() }).eq('id', id);
    load();
  };

  const declineRequest = (id: string, name: string) => {
    showConfirm('Decline request?', `Decline ${name}'s request to connect?`, async () => {
      await supabase.from('coach_connections').delete().eq('id', id);
      load();
    });
  };

  const logout = () => {
    showConfirm('Sign out', 'Are you sure you want to sign out?', async () => {
      await supabase.auth.signOut();
      router.replace('/login' as any);
    });
  };

  const openPlayer = async (p: PlayerRow) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user) {
      await supabase.from('notifications').update({ seen: true })
        .eq('user_id', session.user.id).eq('from_user_id', p.player_id).eq('seen', false);
    }
    router.push({ pathname: '/coach-player', params: { playerId: p.player_id, name: p.name } });
  };

  // Navigate to assign workout with multiple players support
  const assignToMultiple = () => {
    router.push({ pathname: '/assign-workout', params: { multiMode: 'true', coachId: myId ?? '' } });
  };

  const initial = (name: string) => (name?.trim()?.charAt(0)?.toUpperCase() ?? '?');

  // Summary stats
  const activeThisWeek = players.filter(p => p.weekSessions > 0).length;
  const inactiveThisWeek = players.filter(p => p.weekSessions === 0 && p.lastActive).length;
  const totalUnread = players.reduce((sum, p) => sum + p.unread, 0);

  return (
    <LinearGradient colors={[Colors.backgroundTop, Colors.backgroundBottom]} style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>My Players</Text>
        <View style={styles.headerBtns}>
          {players.length > 0 && (
            <TouchableOpacity style={styles.assignAllBtn} onPress={assignToMultiple}>
              <MaterialCommunityIcons name="clipboard-plus-outline" size={18} color="#fff" />
              <Text style={styles.assignAllText}>Assign</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity onPress={logout}>
            <MaterialCommunityIcons name="logout" size={22} color={Colors.textSecondary} />
          </TouchableOpacity>
        </View>
      </View>

      {coachUsername !== '' && (
        <View style={styles.usernameCard}>
          <MaterialCommunityIcons name="account-badge" size={18} color={Colors.accent} />
          <View style={{ flex: 1 }}>
            <Text style={styles.usernameLabel}>Your coach username</Text>
            <Text style={styles.usernameValue}>{coachUsername}</Text>
          </View>
          <Text style={styles.usernameHint}>Share with players to connect</Text>
        </View>
      )}

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.accent} colors={[Colors.accent]} />}
      >
        {loading ? (
          <Text style={styles.muted}>Loading...</Text>
        ) : (
          <>
            {/* ── ROSTER OVERVIEW ── */}
            {players.length > 0 && (
              <View style={styles.rosterOverview}>
                <View style={styles.rosterStat}>
                  <Text style={styles.rosterStatNum}>{players.length}</Text>
                  <Text style={styles.rosterStatLabel}>Total</Text>
                </View>
                <View style={styles.rosterDivider} />
                <View style={styles.rosterStat}>
                  <Text style={[styles.rosterStatNum, { color: '#2ECC71' }]}>{activeThisWeek}</Text>
                  <Text style={styles.rosterStatLabel}>Active this week</Text>
                </View>
                <View style={styles.rosterDivider} />
                <View style={styles.rosterStat}>
                  <Text style={[styles.rosterStatNum, { color: inactiveThisWeek > 0 ? '#E67E22' : Colors.textSecondary }]}>{inactiveThisWeek}</Text>
                  <Text style={styles.rosterStatLabel}>Need a nudge</Text>
                </View>
                {totalUnread > 0 && (
                  <>
                    <View style={styles.rosterDivider} />
                    <View style={styles.rosterStat}>
                      <Text style={[styles.rosterStatNum, { color: '#FF3B30' }]}>{totalUnread}</Text>
                      <Text style={styles.rosterStatLabel}>Unread</Text>
                    </View>
                  </>
                )}
              </View>
            )}

            {/* Pending requests */}
            {pending.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionLabel}>REQUESTS ({pending.length})</Text>
                {pending.map((req) => (
                  <View key={req.id} style={styles.requestCard}>
                    <View style={styles.avatar}><Text style={styles.avatarText}>{initial(req.name)}</Text></View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.playerName}>{req.name}</Text>
                      <Text style={styles.muted}>wants to connect</Text>
                    </View>
                    <TouchableOpacity style={styles.acceptBtn} onPress={() => acceptRequest(req.id)}>
                      <MaterialCommunityIcons name="check" size={18} color="#FFFFFF" />
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.declineBtn} onPress={() => declineRequest(req.id, req.name)}>
                      <MaterialCommunityIcons name="close" size={18} color="#FF6B6B" />
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            )}

            {/* Players */}
            {players.length > 0 ? (
              <View style={styles.section}>
                <Text style={styles.sectionLabel}>PLAYERS ({players.length})</Text>
                {players.map((p) => {
                  const isInactive = p.weekSessions === 0 && p.lastActive;
                  return (
                    <TouchableOpacity key={p.id} style={styles.playerCard} onPress={() => openPlayer(p)}>

                      {/* Avatar + unread badge */}
                      <View>
                        <View style={[styles.avatar, isInactive && styles.avatarInactive]}>
                          <Text style={styles.avatarText}>{initial(p.name)}</Text>
                        </View>
                        {p.unread > 0 && (
                          <View style={styles.unreadBadge}>
                            <Text style={styles.unreadBadgeText}>{p.unread > 9 ? '9+' : p.unread}</Text>
                          </View>
                        )}
                      </View>

                      {/* Info */}
                      <View style={{ flex: 1 }}>
                        <Text style={styles.playerName}>{p.name}</Text>
                        <Text style={[styles.muted, p.unread > 0 && styles.mutedActive]}>
                          {p.unread > 0 ? `${p.unread} new message${p.unread !== 1 ? 's' : ''}` : timeAgo(p.lastActive)}
                        </Text>

                        {/* Status chips row */}
                        <View style={styles.statusRow}>
                          {/* Sessions this week */}
                          <View style={[styles.statusChip, p.weekSessions > 0 ? styles.chipGreen : styles.chipGrey]}>
                            <MaterialCommunityIcons
                              name={p.weekSessions > 0 ? 'lightning-bolt' : 'sleep'}
                              size={11}
                              color={p.weekSessions > 0 ? '#2ECC71' : Colors.textSecondary}
                            />
                            <Text style={[styles.statusChipText, { color: p.weekSessions > 0 ? '#2ECC71' : Colors.textSecondary }]}>
                              {p.weekSessions > 0 ? `${p.weekSessions} this week` : 'No sessions this week'}
                            </Text>
                          </View>

                          {/* Latest assignment status */}
                          {p.latestAssignment && (
                            <View style={[styles.statusChip, p.latestAssignment.done ? styles.chipGreen : styles.chipOrange]}>
                              <MaterialCommunityIcons
                                name={p.latestAssignment.done ? 'check-circle' : 'clock-outline'}
                                size={11}
                                color={p.latestAssignment.done ? '#2ECC71' : '#E67E22'}
                              />
                              <Text style={[styles.statusChipText, { color: p.latestAssignment.done ? '#2ECC71' : '#E67E22' }]} numberOfLines={1}>
                                {p.latestAssignment.done ? 'Done' : 'Pending'}
                              </Text>
                            </View>
                          )}
                        </View>
                      </View>

                      <MaterialCommunityIcons name="chevron-right" size={20} color={Colors.textSecondary} />
                    </TouchableOpacity>
                  );
                })}
              </View>
            ) : pending.length === 0 ? (
              <View style={styles.emptyState}>
                <MaterialCommunityIcons name="account-group-outline" size={48} color={Colors.textSecondary} />
                <Text style={styles.emptyTitle}>No players yet</Text>
                <Text style={styles.emptyDesc}>Share your username with players at your club. Once they add you and you accept, they'll show up here.</Text>
                {coachUsername !== '' && (
                  <View style={styles.emptyUsernameChip}>
                    <Text style={styles.emptyUsernameText}>{coachUsername}</Text>
                  </View>
                )}
              </View>
            ) : null}
          </>
        )}
      </ScrollView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, paddingTop: 60 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 },
  title: { fontSize: 28, fontWeight: 'bold', color: Colors.textPrimary },
  headerBtns: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  assignAllBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: Colors.accent, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8 },
  assignAllText: { fontSize: 13, fontWeight: '700', color: '#fff' },
  usernameCard: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: Colors.backgroundCard, borderRadius: 12, padding: 14, marginBottom: 16, borderLeftWidth: 3, borderLeftColor: Colors.accent },
  usernameLabel: { fontSize: 11, color: Colors.textSecondary },
  usernameValue: { fontSize: 15, fontWeight: 'bold', color: Colors.accent, marginTop: 1 },
  usernameHint: { fontSize: 10, color: Colors.textSecondary, maxWidth: 90, textAlign: 'right' },
  scroll: { paddingBottom: 40 },

  // Roster overview
  rosterOverview: { flexDirection: 'row', backgroundColor: Colors.backgroundCard, borderRadius: 14, padding: 16, marginBottom: 20, alignItems: 'center' },
  rosterStat: { flex: 1, alignItems: 'center', gap: 4 },
  rosterStatNum: { fontSize: 22, fontWeight: 'bold', color: Colors.textPrimary },
  rosterStatLabel: { fontSize: 10, color: Colors.textSecondary, textAlign: 'center' },
  rosterDivider: { width: 1, height: 36, backgroundColor: Colors.border },

  section: { marginBottom: 20 },
  sectionLabel: { fontSize: 11, fontWeight: 'bold', color: Colors.accent, letterSpacing: 1, marginBottom: 12 },
  requestCard: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: Colors.backgroundCard, borderRadius: 12, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: Colors.accent },
  playerCard: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: Colors.backgroundCard, borderRadius: 12, padding: 14, marginBottom: 10 },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: Colors.accentMuted, alignItems: 'center', justifyContent: 'center' },
  avatarInactive: { backgroundColor: 'rgba(255,255,255,0.06)' },
  avatarText: { fontSize: 17, fontWeight: 'bold', color: Colors.accent },
  unreadBadge: { position: 'absolute', top: -3, right: -3, minWidth: 18, height: 18, borderRadius: 9, backgroundColor: '#FF3B30', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3, borderWidth: 1.5, borderColor: Colors.backgroundTop },
  unreadBadgeText: { color: '#fff', fontSize: 9, fontWeight: 'bold' },
  playerName: { fontSize: 15, fontWeight: '600', color: Colors.textPrimary },
  muted: { fontSize: 12, color: Colors.textSecondary, fontStyle: 'italic', marginTop: 1 },
  mutedActive: { color: Colors.accent, fontStyle: 'normal', fontWeight: '600' },

  // Status chips
  statusRow: { flexDirection: 'row', gap: 6, marginTop: 6, flexWrap: 'wrap' },
  statusChip: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 8, paddingHorizontal: 7, paddingVertical: 3 },
  chipGreen: { backgroundColor: 'rgba(46,204,113,0.12)' },
  chipGrey: { backgroundColor: 'rgba(255,255,255,0.06)' },
  chipOrange: { backgroundColor: 'rgba(230,126,34,0.12)' },
  statusChipText: { fontSize: 11, fontWeight: '600' },

  acceptBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: Colors.accent, alignItems: 'center', justifyContent: 'center' },
  declineBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(255,107,107,0.12)', borderWidth: 1, borderColor: 'rgba(255,107,107,0.3)', alignItems: 'center', justifyContent: 'center' },
  emptyState: { alignItems: 'center', paddingTop: 60, gap: 10 },
  emptyTitle: { fontSize: 18, fontWeight: 'bold', color: Colors.textPrimary },
  emptyDesc: { fontSize: 13, color: Colors.textSecondary, textAlign: 'center', lineHeight: 20, paddingHorizontal: 20 },
  emptyUsernameChip: { backgroundColor: Colors.accentMuted, borderRadius: 20, paddingHorizontal: 18, paddingVertical: 8, marginTop: 8 },
  emptyUsernameText: { fontSize: 15, fontWeight: 'bold', color: Colors.accent },
});
