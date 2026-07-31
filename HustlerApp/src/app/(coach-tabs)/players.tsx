import { View, StyleSheet, TouchableOpacity, ScrollView, RefreshControl, Alert, Modal } from 'react-native';
import { Text } from '@/components/Text';
import { TextInput } from '@/components/TextInput';
import { router, useFocusEffect } from 'expo-router';
import { useState, useCallback, useEffect, useRef } from 'react';
import { Icon } from '@/components/icons/Icon';
import * as Clipboard from 'expo-clipboard';
import { Theme, Fonts } from '@/constants/theme';
import { supabase } from '../../lib/supabase';
import { notifyConnectionAccepted } from '../../lib/notifications';
import AssignChoiceModal from '@/components/AssignChoiceModal';
import { SearchInput } from '@/components/SearchInput';
import { getOrCreatePlayerShareCode } from '../../lib/parentLink';
import { NotificationBell } from '@/components/NotificationBell';
import { getMyClub, getClubRosterForCoach, requestJoinClubAsCoach, setActiveClubId, MyClub, ClubRosterBatch } from '../../lib/club';
import { getGroupLessons } from '../../lib/lessons';
import { firstName, formatTime12h } from '../../lib/scheduling';

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

const showAlert = (title: string, message: string) => {
  if (typeof window !== 'undefined') {
    window.alert(`${title}\n\n${message}`);
  } else {
    Alert.alert(title, message);
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

type TodayPrivate = { id: string; playerId: string; playerName: string; startTime: string; endTime: string };
type TodayGroup = { lessonId: string; slotId: string; name: string; startTime: string; endTime: string; rosterCount: number };

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

export default function CoachPlayersScreen() {
  const [coachUsername, setCoachUsername] = useState('');
  const [pending, setPending] = useState<PendingRow[]>([]);
  const [players, setPlayers] = useState<PlayerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [myId, setMyId] = useState<string | null>(null);
  const myIdRef = useRef<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [showAssignChoice, setShowAssignChoice] = useState(false);
  const [linkModalPlayer, setLinkModalPlayer] = useState<PlayerRow | null>(null);
  const [generatedLinkCode, setGeneratedLinkCode] = useState<string | null>(null);
  const [generatingLinkCode, setGeneratingLinkCode] = useState(false);
  const [linkCodeCopied, setLinkCodeCopied] = useState(false);

  // Club affiliation — a coach who named a real club at signup has no
  // coach_username at all, so until they enter their club's code they're in
  // a "needs to connect" state rather than the normal independent-coach view.
  const [myClub, setMyClub] = useState<MyClub | null>(null);
  const [clubBatches, setClubBatches] = useState<ClubRosterBatch[]>([]);
  const [expandedBatches, setExpandedBatches] = useState<Record<string, boolean>>({});
  const [rosterSearch, setRosterSearch] = useState('');
  const [todaysPrivate, setTodaysPrivate] = useState<TodayPrivate[]>([]);
  const [todaysGroup, setTodaysGroup] = useState<TodayGroup[]>([]);
  const [needsClubCode, setNeedsClubCode] = useState(false);
  const [joinCode, setJoinCode] = useState('');
  const [joiningClub, setJoiningClub] = useState(false);
  const [showUsernameFallback, setShowUsernameFallback] = useState(false);
  const [fallbackUsername, setFallbackUsername] = useState('');
  const [savingUsername, setSavingUsername] = useState(false);

  const load = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) { router.replace('/login' as any); return; }
    const me = session.user.id;
    setMyId(me);
    myIdRef.current = me;

    const { data: myProfile } = await supabase
      .from('profiles').select('coach_username, is_coach').eq('id', me).single();
    if (myProfile && myProfile.is_coach === false) { router.replace('/(tabs)' as any); return; }
    setCoachUsername(myProfile?.coach_username ?? '');

    const activeClub = await getMyClub();
    setMyClub(activeClub);
    if (activeClub) {
      setNeedsClubCode(false);
      setClubBatches(await getClubRosterForCoach(activeClub.clubId));

      // Today's Classes — this coach's own private + group lessons for today,
      // same split as the club owner's dashboard, just scoped to me instead
      // of the whole club.
      const dow = new Date().getDay();
      const dateStr = new Date().toISOString().split('T')[0];
      const { data: privRows } = await supabase
        .from('schedule_assignments')
        .select('id, player_id, start_time, end_time, profiles!schedule_assignments_player_id_fkey(full_name)')
        .eq('club_id', activeClub.clubId)
        .eq('coach_id', me)
        .eq('day_of_week', dow)
        .lte('valid_from', dateStr)
        .or(`valid_until.is.null,valid_until.gte.${dateStr}`);
      const privIds = (privRows ?? []).map((r: any) => r.id);
      let cancelledToday = new Set<string>();
      if (privIds.length) {
        const { data: exceptions } = await supabase
          .from('schedule_exceptions').select('schedule_assignment_id').in('schedule_assignment_id', privIds).eq('date', dateStr);
        cancelledToday = new Set((exceptions ?? []).map((e: any) => e.schedule_assignment_id));
      }
      setTodaysPrivate((privRows ?? [])
        .filter((r: any) => !cancelledToday.has(r.id))
        .map((r: any) => ({ id: r.id, playerId: r.player_id, playerName: r.profiles?.full_name ?? 'Player', startTime: r.start_time, endTime: r.end_time }))
        .sort((a: TodayPrivate, b: TodayPrivate) => a.startTime.localeCompare(b.startTime)));

      const clubGroupLessons = await getGroupLessons(activeClub.clubId);
      const myTodaysGroups = clubGroupLessons.flatMap((lesson) => {
        if (!lesson.coaches.some((c) => c.coach_id === me)) return [];
        return lesson.slots
          .filter((s) => s.day_of_week === dow && (s.is_recurring || s.one_time_date === dateStr))
          .map((s) => ({ lessonId: lesson.id, slotId: s.id, name: lesson.name, startTime: s.start_time, endTime: s.end_time, rosterCount: lesson.roster_count }));
      });
      setTodaysGroup(myTodaysGroups.sort((a, b) => a.startTime.localeCompare(b.startTime)));
    } else {
      setClubBatches([]);
      setTodaysPrivate([]);
      setTodaysGroup([]);
      setNeedsClubCode(!myProfile?.coach_username);
    }

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

    // Latest assignment per player + done status
    const latestAsgMap: Record<string, { title: string; done: boolean }> = {};
    if (accIds.length) {
      const { data: asgs } = await supabase
        .from('assignments').select('*').eq('coach_id', me).in('player_id', accIds)
        .order('created_at', { ascending: false });
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
      id: c.id, player_id: c.player_id,
      name: nameMap[c.player_id] ?? 'Player', created_at: c.created_at,
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

  useFocusEffect(useCallback(() => { load(); }, []));

  // Live-refresh when a player sends/withdraws a connection request while
  // this screen is already open, instead of waiting for a manual pull-to-refresh.
  useEffect(() => {
    const channel = supabase
      .channel('coach_connections_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'coach_connections' }, (payload: any) => {
        const row = payload.new ?? payload.old;
        if (row?.coach_id === myIdRef.current) load();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const onRefresh = () => { setRefreshing(true); load(); };

  const acceptRequest = async (id: string) => {
    await supabase.from('coach_connections')
      .update({ status: 'accepted', accepted_at: new Date().toISOString() }).eq('id', id);

    // Notify the player their request was accepted
    const req = pending.find(p => p.id === id);
    if (req) {
      const { data: coachProfile } = await supabase
        .from('profiles').select('full_name').eq('id', myId ?? '').single();
      await notifyConnectionAccepted(req.player_id, coachProfile?.full_name ?? 'Your coach');
    }
    load();
  };

  const declineRequest = (id: string, name: string) => {
    showConfirm('Decline request?', `Decline ${name}'s request to connect?`, async () => {
      await supabase.from('coach_connections').delete().eq('id', id);
      load();
    });
  };

  const disconnectPlayer = (p: PlayerRow) => {
    showConfirm(
      `Remove ${p.name}?`,
      'They will no longer be connected to you. They can request to connect again anytime.',
      async () => {
        await supabase.from('coach_connections').delete().eq('id', p.id);
        load();
      }
    );
  };

  const openPlayer = (p: PlayerRow) => {
    router.push({ pathname: '/coach-player', params: { playerId: p.player_id, name: p.name } });
  };

  const assignWorkoutToMultiple = () => {
    setShowAssignChoice(false);
    router.push({ pathname: '/assign-workout', params: { multiMode: 'true', coachId: myId ?? '' } });
  };

  const assignWeeklyPlanToMultiple = () => {
    setShowAssignChoice(false);
    router.push({ pathname: '/assign-weekly-plan', params: { multiMode: 'true', coachId: myId ?? '' } });
  };

  const copyUsername = async () => {
    if (!coachUsername) return;
    await Clipboard.setStringAsync(coachUsername);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const submitJoinCode = async () => {
    if (!joinCode.trim()) { showAlert('Missing code', "Enter your club's coach code."); return; }
    setJoiningClub(true);
    const result = await requestJoinClubAsCoach(joinCode);
    setJoiningClub(false);
    if (!result.ok) { showAlert('Could not join', result.message); return; }
    await setActiveClubId(result.clubId);
    setJoinCode('');
    showAlert('Joined', `You're in — welcome to ${result.clubName}.`);
    load();
  };

  // Escape hatch for someone who typed a club name at signup but doesn't
  // have their code handy yet — falls back to the same username system
  // independent coaches use, rather than leaving them stuck with neither.
  const saveUsernameInstead = async () => {
    const clean = fallbackUsername.toLowerCase().replace(/[^a-z0-9_]/g, '');
    if (!/^[a-z0-9_]{3,20}$/.test(clean)) {
      showAlert('Invalid username', 'Your coach username should be 3–20 characters: lowercase letters, numbers, or underscores.');
      return;
    }
    if (!myId) return;
    setSavingUsername(true);
    const { data: taken } = await supabase.from('profiles').select('id').eq('coach_username', clean).maybeSingle();
    if (taken) {
      setSavingUsername(false);
      showAlert('Username taken', `"${clean}" is already in use. Please pick another.`);
      return;
    }
    const { error } = await supabase.from('profiles').update({ coach_username: clean }).eq('id', myId);
    setSavingUsername(false);
    if (error) { showAlert('Error', 'Could not save your username. Please try again.'); return; }
    showAlert('All set', `Players can now add you with "${clean}".`);
    load();
  };

  const openLinkModal = async (p: PlayerRow) => {
    setLinkModalPlayer(p);
    setGeneratedLinkCode(null);
    setGeneratingLinkCode(true);
    const code = await getOrCreatePlayerShareCode(p.player_id);
    setGeneratedLinkCode(code);
    setGeneratingLinkCode(false);
  };

  const copyLinkCode = async () => {
    if (!generatedLinkCode) return;
    await Clipboard.setStringAsync(generatedLinkCode);
    setLinkCodeCopied(true);
    setTimeout(() => setLinkCodeCopied(false), 2000);
  };

  const initial = (name: string) => (name?.trim()?.charAt(0)?.toUpperCase() ?? '?');

  const activeThisWeek = players.filter(p => p.weekSessions > 0).length;
  const inactiveThisWeek = players.filter(p => p.weekSessions === 0 && p.lastActive).length;
  const totalUnread = players.reduce((sum, p) => sum + p.unread, 0);

  const toggleBatch = (level: string) => {
    setExpandedBatches((prev) => ({ ...prev, [level]: !prev[level] }));
  };

  const openClubPlayer = (playerId: string, name: string) => {
    router.push({ pathname: '/coach-player', params: { playerId, name } });
  };

  if (needsClubCode) {
    return (
      <View style={styles.container}>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.gateScroll} keyboardShouldPersistTaps="handled">
          <Icon name="account-badge" size={48} color={Theme.textSecondary} />
          <Text style={styles.gateTitle}>Connect Your Club</Text>
          <Text style={styles.gateDesc}>Enter the coach code your club gave you to see their roster, divided by batch.</Text>
          <TextInput
            style={styles.gateInput}
            value={joinCode}
            onChangeText={(t) => setJoinCode(t.toUpperCase())}
            placeholder="C12345"
            placeholderTextColor={Theme.textSecondary}
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={6}
          />
          <TouchableOpacity style={[styles.assignAllBtn, { justifyContent: 'center' }, joiningClub && { opacity: 0.6 }]} onPress={submitJoinCode} disabled={joiningClub}>
            <Text style={styles.assignAllText}>{joiningClub ? 'Joining...' : 'Join Club'}</Text>
          </TouchableOpacity>

          {!showUsernameFallback ? (
            <TouchableOpacity onPress={() => setShowUsernameFallback(true)}>
              <Text style={styles.gateSkipText}>Don't have your code yet? Set up a username instead</Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.gateFallback}>
              <Text style={styles.gateDesc}>Players can add you directly with a username — you can still connect to your club later from Profile.</Text>
              <TextInput
                style={styles.gateInput}
                value={fallbackUsername}
                onChangeText={(t) => setFallbackUsername(t.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                placeholder="e.g. coach_priya"
                placeholderTextColor={Theme.textSecondary}
                autoCapitalize="none"
                autoCorrect={false}
              />
              <TouchableOpacity style={[styles.assignAllBtn, { justifyContent: 'center' }, savingUsername && { opacity: 0.6 }]} onPress={saveUsernameInstead} disabled={savingUsername}>
                <Text style={styles.assignAllText}>{savingUsername ? 'Saving...' : 'Save Username'}</Text>
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.eyebrow}>ROSTER</Text>
          <Text style={styles.title}>{myClub ? myClub.clubName : 'My Players'}</Text>
        </View>
        <View style={styles.headerBtns}>
          <NotificationBell />
        </View>
      </View>

      {coachUsername !== '' && (
        <TouchableOpacity style={styles.usernameCard} onPress={copyUsername} activeOpacity={0.85}>
          <View style={styles.usernameIconWrap}>
            <Icon name="account-badge" size={18} color={Theme.limeAccentDark} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.usernameLabel}>Your coach username</Text>
            <Text style={styles.usernameValue}>{coachUsername}</Text>
            <Text style={styles.usernameHint}>{copied ? 'Copied!' : 'Tap to copy · Share with players to connect'}</Text>
          </View>
          <View style={styles.copyBtn}>
            <Icon name={copied ? 'check' : 'content-copy'} size={18} color={Theme.limeAccentDark} />
          </View>
        </TouchableOpacity>
      )}

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Theme.eyebrowGreen} colors={[Theme.eyebrowGreen]} />}
      >
        {loading ? (
          <Text style={styles.muted}>Loading...</Text>
        ) : myClub ? (
          <>
            {/* Today's Classes — this coach's own private + group lessons today */}
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>TODAY'S CLASSES</Text>
              {todaysGroup.length === 0 && todaysPrivate.length === 0 ? (
                <Text style={styles.muted}>Nothing scheduled today.</Text>
              ) : (
                <>
                  {todaysGroup.length > 0 && (
                    <>
                      <Text style={styles.classSubLabel}>Group</Text>
                      {todaysGroup.map((g) => (
                        <View key={g.slotId} style={styles.classCard}>
                          <View style={styles.classIconWrap}>
                            <Icon name="account-group" size={18} color={Theme.eyebrowGreen} />
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.classTitle}>{formatTime12h(g.startTime)} · {g.name}</Text>
                            <Text style={styles.classMeta}>{g.rosterCount} player{g.rosterCount === 1 ? '' : 's'}</Text>
                          </View>
                        </View>
                      ))}
                    </>
                  )}
                  {todaysPrivate.length > 0 && (
                    <>
                      <Text style={[styles.classSubLabel, { marginTop: todaysGroup.length > 0 ? 14 : 0 }]}>Private</Text>
                      {todaysPrivate.map((p) => (
                        <TouchableOpacity key={p.id} style={styles.classCard} onPress={() => openClubPlayer(p.playerId, p.playerName)}>
                          <View style={styles.classIconWrap}>
                            <Icon name="account-circle" size={18} color={Theme.todayBlue} />
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.classTitle}>{formatTime12h(p.startTime)} · {firstName(p.playerName)}</Text>
                          </View>
                          <Icon name="chevron-right" size={18} color={Theme.textSecondary} />
                        </TouchableOpacity>
                      ))}
                    </>
                  )}
                </>
              )}
            </View>

            {/* Roster — a batch dropdown instead of stacking every batch at once */}
            <View style={styles.section}>
              <View style={styles.playersSectionHeader}>
                <Text style={[styles.sectionLabel, { marginBottom: 0 }]}>ROSTER</Text>
                {clubBatches.length > 0 && (
                  <TouchableOpacity style={styles.assignBigBtn} onPress={() => setShowAssignChoice(true)}>
                    <Icon name="clipboard-plus-outline" size={22} color={Theme.limeAccentDark} />
                    <Text style={styles.assignBigText}>Assign</Text>
                  </TouchableOpacity>
                )}
              </View>

              {clubBatches.length === 0 ? (
                <View style={styles.emptyState}>
                  <Icon name="account-group-outline" size={48} color={Theme.textSecondary} />
                  <Text style={styles.emptyTitle}>No roster yet</Text>
                  <Text style={styles.emptyDesc}>Players will show up here once they join {myClub.clubName} and are placed in a batch.</Text>
                </View>
              ) : (
                <>
                  {/* Search spans every batch regardless of which cards below are
                      expanded — otherwise a player in a collapsed batch would look
                      like they don't exist. */}
                  <SearchInput value={rosterSearch} onChangeText={setRosterSearch} placeholder="Search all players..." />

                  {rosterSearch.trim() ? (
                    clubBatches
                      .flatMap((b) => b.players.map((p) => ({ ...p, batchLevel: b.level })))
                      .filter((p, idx, arr) => arr.findIndex((x) => x.id === p.id) === idx)
                      .filter((p) => p.fullName.toLowerCase().includes(rosterSearch.trim().toLowerCase()))
                      .map((p) => (
                        <TouchableOpacity key={p.id} style={styles.playerCard} onPress={() => openClubPlayer(p.id, p.fullName)}>
                          <View style={styles.avatar}>
                            <Text style={styles.avatarText}>{initial(p.fullName)}</Text>
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.playerName}>{firstName(p.fullName)}</Text>
                            {clubBatches.length > 1 && <Text style={styles.muted}>{p.batchLevel}</Text>}
                          </View>
                          <Icon name="chevron-right" size={20} color={Theme.textSecondary} />
                        </TouchableOpacity>
                      ))
                  ) : (
                    /* One card per batch — tap to expand and reveal just that
                       batch's players, instead of switching a single shared list. */
                    clubBatches.map((batch) => {
                      const expanded = !!expandedBatches[batch.level];
                      return (
                        <View key={batch.level} style={styles.batchCard}>
                          <TouchableOpacity style={styles.batchCardHeader} onPress={() => toggleBatch(batch.level)}>
                            <Text style={styles.batchCardTitle}>{batch.level} ({batch.players.length})</Text>
                            <Icon name={expanded ? 'chevron-up' : 'chevron-down'} size={20} color={Theme.textPrimary} />
                          </TouchableOpacity>
                          {expanded && (
                            <View style={styles.batchCardBody}>
                              {batch.players.length === 0 ? (
                                <Text style={styles.muted}>No players in this batch yet.</Text>
                              ) : (
                                batch.players.map((p) => (
                                  <TouchableOpacity key={p.id} style={styles.playerCard} onPress={() => openClubPlayer(p.id, p.fullName)}>
                                    <View style={styles.avatar}>
                                      <Text style={styles.avatarText}>{initial(p.fullName)}</Text>
                                    </View>
                                    <View style={{ flex: 1 }}>
                                      <Text style={styles.playerName}>{firstName(p.fullName)}</Text>
                                    </View>
                                    <Icon name="chevron-right" size={20} color={Theme.textSecondary} />
                                  </TouchableOpacity>
                                ))
                              )}
                            </View>
                          )}
                        </View>
                      );
                    })
                  )}
                </>
              )}
            </View>
          </>
        ) : (
          <>
            {/* Roster overview */}
            {players.length > 0 && (
              <View style={styles.rosterOverview}>
                <View style={styles.rosterStat}>
                  <Text style={styles.rosterStatNum}>{players.length}</Text>
                  <Text style={styles.rosterStatLabel}>Total</Text>
                </View>
                <View style={styles.rosterDivider} />
                <View style={styles.rosterStat}>
                  <Text style={styles.rosterStatNum}>{activeThisWeek}</Text>
                  <Text style={styles.rosterStatLabel}>Active this week</Text>
                </View>
                <View style={styles.rosterDivider} />
                <View style={styles.rosterStat}>
                  <Text style={styles.rosterStatNum}>{inactiveThisWeek}</Text>
                  <Text style={styles.rosterStatLabel}>Need a nudge</Text>
                </View>
                {totalUnread > 0 && (
                  <>
                    <View style={styles.rosterDivider} />
                    <View style={styles.rosterStat}>
                      <Text style={styles.rosterStatNum}>{totalUnread}</Text>
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
                      <Icon name="check" size={18} color={Theme.limeAccentDark} />
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.declineBtn} onPress={() => declineRequest(req.id, req.name)}>
                      <Icon name="close" size={18} color="#FF6B6B" />
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            )}

            {/* Players */}
            {players.length > 0 ? (
              <View style={styles.section}>
                <View style={styles.playersSectionHeader}>
                  <Text style={[styles.sectionLabel, { marginBottom: 0 }]}>PLAYERS ({players.length})</Text>
                  <TouchableOpacity style={styles.assignBigBtn} onPress={() => setShowAssignChoice(true)}>
                    <Icon name="clipboard-plus-outline" size={22} color={Theme.limeAccentDark} />
                    <Text style={styles.assignBigText}>Assign</Text>
                  </TouchableOpacity>
                </View>
                {players.map((p) => {
                  return (
                    <TouchableOpacity key={p.id} style={styles.playerCard} onPress={() => openPlayer(p)}>
                      {/* Avatar + unread badge */}
                      <View>
                        <View style={styles.avatar}>
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
                      </View>

                      <TouchableOpacity
                        style={styles.disconnectBtn}
                        onPress={() => openLinkModal(p)}
                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                      >
                        <Icon name="link-variant" size={18} color={Theme.eyebrowGreen} />
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.disconnectBtn}
                        onPress={() => disconnectPlayer(p)}
                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                      >
                        <Icon name="close" size={18} color="#FF6B6B" />
                      </TouchableOpacity>
                      <Icon name="chevron-right" size={20} color={Theme.textSecondary} />
                    </TouchableOpacity>
                  );
                })}
              </View>
            ) : pending.length === 0 ? (
              <View style={styles.emptyState}>
                <Icon name="account-group-outline" size={48} color={Theme.textSecondary} />
                <Text style={styles.emptyTitle}>No players yet</Text>
                <Text style={styles.emptyDesc}>Share your username with players at your club.</Text>
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

      <AssignChoiceModal
        visible={showAssignChoice}
        onClose={() => setShowAssignChoice(false)}
        onSelectWorkout={assignWorkoutToMultiple}
        onSelectWeeklyPlan={assignWeeklyPlanToMultiple}
      />

      <Modal visible={!!linkModalPlayer} transparent animationType="fade" onRequestClose={() => setLinkModalPlayer(null)}>
        <View style={styles.linkModalOverlay}>
          <View style={styles.linkModalContent}>
            <View style={styles.linkModalHeader}>
              <Text style={styles.linkModalTitle}>Parent Link Code</Text>
              <TouchableOpacity onPress={() => setLinkModalPlayer(null)}>
                <Icon name="close-circle-outline" size={26} color={Theme.textPrimary} />
              </TouchableOpacity>
            </View>
            {generatingLinkCode ? (
              <Text style={styles.muted}>Generating code...</Text>
            ) : generatedLinkCode ? (
              <>
                <Text style={styles.linkCodeText}>{generatedLinkCode}</Text>
                <TouchableOpacity style={styles.copyBtnWide} onPress={copyLinkCode}>
                  <Icon name={linkCodeCopied ? 'check-circle-outline' : 'content-copy'} size={18} color={linkCodeCopied ? '#2ECC71' : Theme.eyebrowGreen} />
                  <Text style={[styles.copyBtnWideText, linkCodeCopied && { color: '#2ECC71' }]}>{linkCodeCopied ? 'Copied' : 'Copy Code'}</Text>
                </TouchableOpacity>
                <Text style={styles.linkCodeHint}>
                  Give this to {linkModalPlayer?.name}'s parent — they'll enter it in their app to send a link request, which {linkModalPlayer?.name} will need to accept. This code is permanent.
                </Text>
              </>
            ) : (
              <Text style={styles.muted}>Could not generate a code. Please try again.</Text>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Theme.background, padding: 24, paddingTop: 60 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 },
  eyebrow: { fontSize: 14, fontWeight: '700', color: Theme.eyebrowGreen, letterSpacing: 1.5, marginBottom: 4 },
  title: { fontFamily: Fonts.serifMedium, fontSize: 36, color: Theme.textPrimary },
  headerBtns: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  assignAllBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: Theme.limeAccent, borderRadius: 24, paddingHorizontal: 18, paddingVertical: 11 },
  assignAllText: { fontSize: 15, fontWeight: '700', color: Theme.limeAccentDark },
  // Bigger than assignAllBtn above — that one's shared with Join Club/Save
  // Username, which shouldn't grow along with the Assign button.
  assignBigBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: Theme.limeAccent, borderRadius: 26, paddingHorizontal: 22, paddingVertical: 14 },
  assignBigText: { fontSize: 17, fontWeight: '700', color: Theme.limeAccentDark },
  bellButton: { width: 48, height: 48, borderRadius: 24, backgroundColor: Theme.cardWhite, alignItems: 'center', justifyContent: 'center' },
  bellBadge: { position: 'absolute', top: -3, right: -3, minWidth: 18, height: 18, borderRadius: 9, backgroundColor: '#D64545', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3, borderWidth: 1.5, borderColor: Theme.background },
  bellBadgeText: { color: '#fff', fontSize: 10, fontWeight: 'bold' },
  gateScroll: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 60, paddingBottom: 100, gap: 10 },
  gateTitle: { fontFamily: Fonts.serifMedium, fontSize: 24, color: Theme.textPrimary, textAlign: 'center', marginTop: 4 },
  gateDesc: { fontSize: 15, color: Theme.textSecondary, textAlign: 'center', lineHeight: 21, paddingHorizontal: 12, marginBottom: 8 },
  gateInput: {
    backgroundColor: Theme.cardWhite, borderRadius: 10, padding: 14, color: Theme.textPrimary, fontSize: 16,
    borderWidth: 1, borderColor: Theme.divider, width: '100%', textAlign: 'center', letterSpacing: 2, marginBottom: 12,
  },
  gateSkipText: { fontSize: 14, fontWeight: '600', color: Theme.eyebrowGreen, textAlign: 'center', marginTop: 20 },
  gateFallback: { width: '100%', marginTop: 20, gap: 4 },
  usernameCard: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: Theme.limeAccent, borderRadius: 14, padding: 14, marginBottom: 16, outlineStyle: 'none' } as any,
  usernameIconWrap: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(26,61,39,0.14)', alignItems: 'center', justifyContent: 'center' },
  usernameLabel: { fontSize: 12, fontWeight: '600', color: Theme.limeAccentDark, opacity: 0.8 },
  usernameValue: { fontSize: 17, fontWeight: '700', color: Theme.limeAccentDark, marginTop: 1 },
  usernameHint: { fontSize: 11, fontWeight: '600', color: Theme.limeAccentDark, opacity: 0.75, marginTop: 3 },
  copyBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: Theme.cardWhite, alignItems: 'center', justifyContent: 'center' },
  scroll: { paddingBottom: 100 },
  rosterOverview: { flexDirection: 'row', backgroundColor: Theme.cardWhite, borderRadius: 16, paddingVertical: 18, paddingHorizontal: 12, marginBottom: 20, alignItems: 'flex-start' },
  rosterStat: { flex: 1, alignItems: 'center', gap: 4 },
  rosterStatNum: { fontSize: 28, fontWeight: 'bold', color: Theme.textPrimary, lineHeight: 33 },
  rosterStatLabel: { fontSize: 13, fontWeight: '500', color: Theme.textSecondary, textAlign: 'center', lineHeight: 16, minHeight: 32 },
  rosterDivider: { width: 1, alignSelf: 'stretch', backgroundColor: Theme.divider },
  section: { marginBottom: 20 },
  sectionLabel: { fontSize: 12, fontWeight: 'bold', color: Theme.eyebrowGreen, letterSpacing: 1, marginBottom: 12 },
  playersSectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  classSubLabel: { fontSize: 12, fontWeight: 'bold', color: Theme.textMuted, letterSpacing: 1, marginBottom: 8 },
  classCard: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: Theme.cardWhite, borderRadius: 14, padding: 14, marginBottom: 8 },
  classIconWrap: { width: 36, height: 36, borderRadius: 18, backgroundColor: Theme.cardTinted, alignItems: 'center', justifyContent: 'center' },
  classTitle: { fontSize: 15, fontWeight: '600', color: Theme.textPrimary },
  classMeta: { fontSize: 13, color: Theme.textSecondary, marginTop: 2 },
  batchCard: { backgroundColor: Theme.background, borderRadius: 14, borderWidth: 1, borderColor: Theme.divider, marginBottom: 10, overflow: 'hidden' },
  batchCardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14 },
  batchCardTitle: { fontSize: 15, fontWeight: '700', color: Theme.textPrimary },
  batchCardBody: { paddingHorizontal: 10, paddingBottom: 10 },
  requestCard: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: Theme.cardTinted, borderRadius: 14, padding: 14, marginBottom: 10 },
  playerCard: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: Theme.cardWhite, borderRadius: 14, padding: 14, marginBottom: 10 },
  avatar: { width: 50, height: 50, borderRadius: 25, backgroundColor: Theme.eyebrowGreen, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 19, fontWeight: 'bold', color: '#fff' },
  unreadBadge: { position: 'absolute', top: -3, right: -3, minWidth: 18, height: 18, borderRadius: 9, backgroundColor: '#D64545', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4, borderWidth: 1.5, borderColor: Theme.cardWhite },
  unreadBadgeText: { color: '#fff', fontSize: 10, fontWeight: 'bold' },
  playerName: { fontSize: 16, fontWeight: '600', color: Theme.textPrimary },
  muted: { fontSize: 13, color: Theme.textSecondary, fontStyle: 'italic', marginTop: 1 },
  mutedActive: { color: Theme.eyebrowGreen, fontStyle: 'normal', fontWeight: '600' },
  disconnectBtn: { padding: 6 },
  acceptBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: Theme.limeAccent, alignItems: 'center', justifyContent: 'center' },
  declineBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(231,76,60,0.12)', borderWidth: 1, borderColor: 'rgba(231,76,60,0.3)', alignItems: 'center', justifyContent: 'center' },
  emptyState: { alignItems: 'center', paddingTop: 60, gap: 10 },
  emptyTitle: { fontSize: 18, fontWeight: 'bold', color: Theme.textPrimary },
  emptyDesc: { fontSize: 15, color: Theme.textSecondary, textAlign: 'center', lineHeight: 20, paddingHorizontal: 20 },
  emptyUsernameChip: { backgroundColor: Theme.cardTinted, borderRadius: 20, paddingHorizontal: 18, paddingVertical: 8, marginTop: 8 },
  emptyUsernameText: { fontSize: 15, fontWeight: 'bold', color: Theme.eyebrowGreen },

  linkModalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  linkModalContent: { backgroundColor: Theme.cardWhite, borderRadius: 24, padding: 24, width: '100%', alignItems: 'center' },
  linkModalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width: '100%', marginBottom: 20 },
  linkModalTitle: { fontFamily: Fonts.serifMedium, fontSize: 20, color: Theme.textPrimary },
  linkCodeText: { fontFamily: Fonts.serifMedium, fontSize: 40, letterSpacing: 6, color: Theme.eyebrowGreen, marginBottom: 16 },
  copyBtnWide: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: Theme.cardTinted, borderRadius: 10, paddingHorizontal: 16, paddingVertical: 10, marginBottom: 16 },
  copyBtnWideText: { fontSize: 15, fontWeight: '600', color: Theme.eyebrowGreen },
  linkCodeHint: { fontSize: 14, color: Theme.textSecondary, textAlign: 'center', lineHeight: 20 },
});
