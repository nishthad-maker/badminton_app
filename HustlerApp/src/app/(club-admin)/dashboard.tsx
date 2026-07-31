import { View, StyleSheet, ScrollView, TouchableOpacity, RefreshControl, Modal } from 'react-native';
import { Text } from '@/components/Text';
import { Icon } from '@/components/icons/Icon';
import * as Clipboard from 'expo-clipboard';
import { useState, useCallback, useEffect } from 'react';
import { useFocusEffect, router } from 'expo-router';
import { Theme, Fonts } from '@/constants/theme';
import { supabase } from '../../lib/supabase';
import {
  getMyClub, getMyClubs, setActiveClubId, getClubSkillLevels,
  updatePlayerLevel, updatePlayerPriorityCoach, getPendingClubJoinRequests, approveClubJoinRequest, rejectClubJoinRequest,
  MyClub, ClubJoinRequest,
} from '../../lib/club';
import { getClubCourts, Court } from '../../lib/courts';
import { getGroupLessons, getPlayerFolder, getRoster, GroupLesson, PlayerFolder, RosterPlayer } from '../../lib/lessons';
import { colorForId } from '../../lib/colors';
import { DAY_NAMES, formatTime12h, hhmm, firstName } from '../../lib/scheduling';
import { getAttendanceForDate, setAttendance, statusFor, AttendanceStatus } from '../../lib/attendance';
import { notifyPostCutoffCancellation } from '../../lib/notifications';
import { getClubMakeupCredits, MakeupCredit } from '../../lib/makeup';
import { showAlert, showConfirm } from '../../lib/ui';
import { NoClubPrompt } from '@/components/NoClubPrompt';
import { NotificationBell } from '@/components/NotificationBell';

type Person = { id: string; full_name: string };
type RosterEntry = { id: string; player_id: string; full_name: string; level: string | null; priority_coach_id: string | null };
type LessonSession = { id: string; player_id: string; start_time: string; end_time: string; player_name: string; coach_name: string; court_name: string | null };

const todayStr = () => new Date().toISOString().split('T')[0];

export default function ClubDashboardScreen() {
  const [hasClub, setHasClub] = useState(true);
  const [onboardingCompleted, setOnboardingCompleted] = useState(true);
  const [clubId, setClubId] = useState<string | null>(null);
  const [clubName, setClubName] = useState('');
  const [isOwner, setIsOwner] = useState(false);
  const [rosterScope, setRosterScope] = useState<'own_only' | 'full_roster'>('full_roster');
  const [myClubs, setMyClubs] = useState<MyClub[]>([]);
  const [lessonSessions, setLessonSessions] = useState<LessonSession[]>([]);
  const [waitlistCount, setWaitlistCount] = useState(0);
  const [scheduleRequestCount, setScheduleRequestCount] = useState(0);
  const [coaches, setCoaches] = useState<Person[]>([]);
  const [courts, setCourts] = useState<Court[]>([]);
  const [roster, setRoster] = useState<RosterEntry[]>([]);
  const [groupLessons, setGroupLessons] = useState<GroupLesson[]>([]);
  const [loading, setLoading] = useState(true);
  // Forces "Today's Classes" to re-filter on a clock tick, not just on
  // reload/refocus — otherwise a session that ended while the dashboard was
  // sitting open would linger until the next navigation.
  const [, setClockTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setClockTick((t) => t + 1), 60000);
    return () => clearInterval(id);
  }, []);
  const [refreshing, setRefreshing] = useState(false);

  const [addingId, setAddingId] = useState<string | null>(null);
  const [approvalRequest, setApprovalRequest] = useState<ClubJoinRequest | null>(null);
  const [approvalLevel, setApprovalLevel] = useState<string | null>(null);
  const [approving, setApproving] = useState(false);

  // Player folder modal
  const [folderPlayer, setFolderPlayer] = useState<RosterEntry | null>(null);
  const [folder, setFolder] = useState<PlayerFolder | null>(null);
  const [folderLoading, setFolderLoading] = useState(false);

  // Attendance (today) — coach override, applies on top of the player/parent default-on toggle
  const [privateAttendance, setPrivateAttendance] = useState<Record<string, AttendanceStatus>>({});
  const [groupModal, setGroupModal] = useState<{ lesson: GroupLesson; slot: any } | null>(null);
  const [groupRoster, setGroupRoster] = useState<RosterPlayer[]>([]);
  const [groupAttendance, setGroupAttendance] = useState<Record<string, AttendanceStatus>>({});
  const [groupAttLoading, setGroupAttLoading] = useState(false);
  const [skillLevels, setSkillLevels] = useState<string[]>([]);
  const [ownerId, setOwnerId] = useState<string | null>(null);
  const [cancellationHours, setCancellationHours] = useState(24);
  const [makeupCredits, setMakeupCredits] = useState<MakeupCredit[]>([]);
  const [pendingJoinRequests, setPendingJoinRequests] = useState<ClubJoinRequest[]>([]);
  const [playerJoinCode, setPlayerJoinCode] = useState('');
  const [coachJoinCode, setCoachJoinCode] = useState('');
  const [copiedPlayerCode, setCopiedPlayerCode] = useState(false);
  const [copiedCoachCode, setCopiedCoachCode] = useState(false);
  const [rosterModalVisible, setRosterModalVisible] = useState(false);
  const [pendingModalVisible, setPendingModalVisible] = useState(false);
  const [groupNotAttendingToday, setGroupNotAttendingToday] = useState<Record<string, number>>({});

  const load = async () => {
    const club = await getMyClub();
    if (!club) { setHasClub(false); setLoading(false); setRefreshing(false); return; }
    setHasClub(true);
    setClubId(club.clubId);
    setClubName(club.clubName);
    setIsOwner(club.role === 'owner');
    setRosterScope(club.rosterScope);
    setMyClubs(await getMyClubs());
    setOnboardingCompleted(club.onboardingCompleted);

    // Gated: nothing else on this screen loads until setup wizard is done —
    // see club-onboarding.tsx and SetupLockedPlaceholder on the other tabs.
    if (!club.onboardingCompleted) {
      setLoading(false);
      setRefreshing(false);
      return;
    }

    const today = new Date();
    const dow = today.getDay();
    const dateStr = todayStr();

    const lessons = await getGroupLessons(club.clubId);
    setGroupLessons(lessons);

    const todaysSlotTierIds = lessons
      .flatMap((lesson) => lesson.slots.filter((s) => s.day_of_week === dow && (s.is_recurring || s.one_time_date === dateStr)).map(() => lesson.id));
    if (todaysSlotTierIds.length) {
      const { data: notAttendingRows } = await supabase
        .from('attendance')
        .select('group_tier_id')
        .in('group_tier_id', todaysSlotTierIds)
        .eq('lesson_date', dateStr)
        .eq('attending', false);
      const counts: Record<string, number> = {};
      (notAttendingRows ?? []).forEach((r: any) => { counts[r.group_tier_id] = (counts[r.group_tier_id] ?? 0) + 1; });
      setGroupNotAttendingToday(counts);
    } else {
      setGroupNotAttendingToday({});
    }

    const { data: lessonRows } = await supabase
      .from('schedule_assignments')
      .select('id, player_id, start_time, end_time, profiles!schedule_assignments_player_id_fkey(full_name), coach:profiles!schedule_assignments_coach_id_fkey(full_name), courts(name)')
      .eq('club_id', club.clubId)
      .eq('day_of_week', dow)
      .lte('valid_from', dateStr)
      .or(`valid_until.is.null,valid_until.gte.${dateStr}`)
      .order('start_time', { ascending: true });

    const lessonIds = (lessonRows ?? []).map((l: any) => l.id);
    let cancelledToday = new Set<string>();
    if (lessonIds.length) {
      const { data: exceptions } = await supabase
        .from('schedule_exceptions')
        .select('schedule_assignment_id')
        .in('schedule_assignment_id', lessonIds)
        .eq('date', dateStr);
      cancelledToday = new Set((exceptions ?? []).map((e: any) => e.schedule_assignment_id));
    }

    const sessions: LessonSession[] = (lessonRows ?? [])
      .filter((l: any) => !cancelledToday.has(l.id))
      .map((l: any) => ({
        id: l.id,
        player_id: l.player_id,
        start_time: l.start_time,
        end_time: l.end_time,
        player_name: l.profiles?.full_name ?? 'Player',
        coach_name: l.coach?.full_name ?? 'Coach',
        court_name: l.courts?.name ?? null,
      }));
    setLessonSessions(sessions);

    const attEntries = await Promise.all(sessions.map(async (l) => {
      const m = await getAttendanceForDate({ scheduleAssignmentId: l.id, lessonDate: dateStr });
      return [l.id, statusFor(m, l.player_id)] as const;
    }));
    setPrivateAttendance(Object.fromEntries(attEntries));

    const { count: waitCount } = await supabase
      .from('waitlist_entries')
      .select('id', { count: 'exact', head: true })
      .eq('club_id', club.clubId)
      .eq('status', 'waiting');
    setWaitlistCount(waitCount ?? 0);

    // Club-wide, not scoped to one coach — Calendar's per-coach view has the
    // full actionable list; this is just the "does anything need attention" count.
    const { count: reqCount } = await supabase
      .from('schedule_requests')
      .select('id', { count: 'exact', head: true })
      .eq('club_id', club.clubId)
      .eq('status', 'pending');
    setScheduleRequestCount(reqCount ?? 0);

    const { data: coachRows } = await supabase
      .from('club_coaches')
      .select('coach_id, profiles(full_name)')
      .eq('club_id', club.clubId)
      .eq('status', 'active');
    setCoaches((coachRows ?? []).map((c: any) => ({ id: c.coach_id, full_name: c.profiles?.full_name ?? 'Coach' })));

    setCourts(await getClubCourts(club.clubId));

    const { data: memberRows } = await supabase
      .from('club_members')
      .select('id, player_id, level, priority_coach_id, profiles!club_members_player_id_fkey(full_name)')
      .eq('club_id', club.clubId)
      .eq('status', 'active');
    setRoster((memberRows ?? []).map((m: any) => ({
      id: m.id, player_id: m.player_id, full_name: m.profiles?.full_name ?? 'Player', level: m.level, priority_coach_id: m.priority_coach_id,
    })));

    setSkillLevels(await getClubSkillLevels(club.clubId));

    const [{ data: clubRow }, { data: settingsRow }] = await Promise.all([
      supabase.from('clubs').select('owner_id').eq('id', club.clubId).single(),
      supabase.from('club_settings').select('cancellation_notice_hours, player_join_code, coach_join_code').eq('club_id', club.clubId).single(),
    ]);
    setOwnerId(clubRow?.owner_id ?? null);
    setCancellationHours(settingsRow?.cancellation_notice_hours ?? 24);
    setPlayerJoinCode(settingsRow?.player_join_code ?? '');
    setCoachJoinCode(settingsRow?.coach_join_code ?? '');

    const allMakeup = await getClubMakeupCredits(club.clubId);
    setMakeupCredits(allMakeup.filter((m) => m.status !== 'done'));

    setPendingJoinRequests(await getPendingClubJoinRequests(club.clubId));

    setLoading(false);
    setRefreshing(false);
  };

  useFocusEffect(useCallback(() => { load(); }, []));
  const onRefresh = () => { setRefreshing(true); load(); };

  const copyCode = async (code: string, which: 'player' | 'coach') => {
    await Clipboard.setStringAsync(code);
    const setCopied = which === 'player' ? setCopiedPlayerCode : setCopiedCoachCode;
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const switchClub = async (id: string) => {
    if (id === clubId) return;
    setLoading(true);
    await setActiveClubId(id);
    load();
  };

  const openCoach = (coach: Person) => {
    router.push({ pathname: '/(club-admin)/club-calendar', params: { view: 'coach', coachId: coach.id } } as any);
  };

  // Opens the approval modal rather than approving directly — the club
  // needs to confirm (or override) the player's level before they're
  // rostered, per the "level assigned at approval time" flow.
  const openApproval = (request: ClubJoinRequest) => {
    const matched = skillLevels.find((l) => l.toLowerCase() === (request.signupSkillLevel ?? '').toLowerCase());
    setApprovalLevel(matched ?? skillLevels[0] ?? null);
    setApprovalRequest(request);
  };

  const confirmApproval = async () => {
    if (!approvalRequest) return;
    setApproving(true);
    const res = await approveClubJoinRequest(approvalRequest.id, approvalLevel);
    setApproving(false);
    if (!res.ok) { showAlert('Error', res.message || 'Could not approve that request.'); return; }
    setApprovalRequest(null);
    load();
  };

  const rejectJoinRequest = (request: ClubJoinRequest) => {
    showConfirm('Reject request?', `Reject ${firstName(request.playerName)}'s request to join the club?`, async () => {
      setAddingId(request.id);
      await rejectClubJoinRequest(request.id);
      setAddingId(null);
      load();
    });
  };

  const openFolder = async (entry: RosterEntry) => {
    if (!clubId) return;
    setFolderPlayer(entry);
    setFolderLoading(true);
    setFolder(await getPlayerFolder(clubId, entry.player_id));
    setFolderLoading(false);
  };

  const setFolderPlayerLevel = async (level: string) => {
    if (!folderPlayer || !isOwner) return;
    const nextLevel = folderPlayer.level === level ? null : level;
    await updatePlayerLevel(folderPlayer.id, nextLevel);
    setFolderPlayer({ ...folderPlayer, level: nextLevel });
    setRoster((prev) => prev.map((r) => (r.id === folderPlayer.id ? { ...r, level: nextLevel } : r)));
  };

  const setFolderPlayerPriorityCoach = async (coachId: string) => {
    if (!folderPlayer || !isOwner) return;
    const nextCoachId = folderPlayer.priority_coach_id === coachId ? null : coachId;
    await updatePlayerPriorityCoach(folderPlayer.id, nextCoachId);
    setFolderPlayer({ ...folderPlayer, priority_coach_id: nextCoachId });
    setRoster((prev) => prev.map((r) => (r.id === folderPlayer.id ? { ...r, priority_coach_id: nextCoachId } : r)));
  };

  const isPastCutoff = (startTime: string) => {
    const lessonTs = new Date(`${todayStr()}T${startTime}`);
    return (lessonTs.getTime() - Date.now()) < cancellationHours * 3600 * 1000;
  };

  const toggleCoachAttendance = async (l: LessonSession, attending: boolean) => {
    const res = await setAttendance({ scheduleAssignmentId: l.id, playerId: l.player_id, lessonDate: todayStr(), attending, actorRole: 'coach' });
    if (!res.ok) { showAlert('Could not update attendance', res.message || ''); return; }
    setPrivateAttendance((prev) => ({ ...prev, [l.id]: { attending, coachOverride: true, toggledBy: 'coach', exists: true } }));
    if (!attending && ownerId && isPastCutoff(l.start_time)) {
      notifyPostCutoffCancellation(ownerId, l.player_name, `Private lesson with ${l.coach_name} today at ${formatTime12h(l.start_time)}`);
    }
  };

  const openGroupAttendance = async (lesson: GroupLesson, slot: any) => {
    setGroupModal({ lesson, slot });
    setGroupAttLoading(true);
    const [rosterList, attMap] = await Promise.all([
      getRoster(lesson.id),
      getAttendanceForDate({ groupTierId: lesson.id, lessonDate: todayStr() }),
    ]);
    setGroupRoster(rosterList);
    setGroupAttendance(attMap);
    setGroupAttLoading(false);
  };

  const toggleGroupAttendance = async (playerId: string, attending: boolean) => {
    if (!groupModal) return;
    const res = await setAttendance({ groupTierId: groupModal.lesson.id, playerId, lessonDate: todayStr(), attending, actorRole: 'coach' });
    if (!res.ok) { showAlert('Could not update attendance', res.message || ''); return; }
    setGroupAttendance((prev) => ({ ...prev, [playerId]: { attending, coachOverride: true, toggledBy: 'coach', exists: true } }));
    if (!attending && ownerId && isPastCutoff(groupModal.slot.start_time)) {
      const playerName = groupRoster.find((p) => p.player_id === playerId)?.player_name ?? 'A player';
      notifyPostCutoffCancellation(ownerId, playerName, `${groupModal.lesson.name} today at ${formatTime12h(groupModal.slot.start_time)}`);
    }
  };

  // "Today's Classes" is a live worklist, not a static schedule — once a
  // session's end time has passed, it drops off instead of sitting there
  // done and stale for the rest of the day.
  const nowHHMM = () => {
    const d = new Date();
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  };

  const todaysGroupLessons = groupLessons.flatMap((lesson) =>
    lesson.slots
      .filter((s) => s.day_of_week === new Date().getDay() && (s.is_recurring || s.one_time_date === todayStr()))
      .map((s) => ({ lesson, slot: s }))
  ).filter(({ slot }) => hhmm(slot.end_time) > nowHHMM());

  const upcomingLessonSessions = lessonSessions.filter((l) => hhmm(l.end_time) > nowHHMM());

  const owedMakeupCount = makeupCredits.filter((m) => m.status === 'owed').length;
  const pendingActionsCount = pendingJoinRequests.length + owedMakeupCount + scheduleRequestCount + waitlistCount;
  // Dashboard only ever shows a couple of the ones actually needing attention —
  // the full list (with Schedule/Mark Done actions) lives under the Lessons
  // tab's Tournament Makeups section now, not here.
  const needsSlotPreview = makeupCredits.filter((m) => m.status === 'owed').slice(0, 2);

  if (!loading && !hasClub) {
    return (
      <View style={styles.container}>
        <NoClubPrompt />
      </View>
    );
  }

  if (!loading && !onboardingCompleted) {
    const featureRows: { icon: string; label: string }[] = [
      { icon: 'account-group', label: 'Manage Player Rosters' },
      { icon: 'calendar-week', label: 'Schedule Lessons' },
      { icon: 'content-copy', label: 'Share Join Codes' },
    ];
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>{clubName}</Text>
        </View>
        <View style={styles.scroll}>
          <View style={styles.setupCard}>
            <View style={styles.setupCardIconWrap}>
              <Icon name="clipboard-text-outline" size={40} color={Theme.eyebrowGreen} />
            </View>
            <Text style={styles.setupCardTitle}>Set Up Your Club</Text>
            <Text style={styles.setupCardDesc} maxFontSizeMultiplier={1.3}>A few quick questions — batch types, cancellation policy, and your join codes — to unlock your full club features.</Text>
            <TouchableOpacity style={styles.setupCardButton} onPress={() => router.push('/(club-admin)/club-onboarding' as any)}>
              <Text style={styles.setupCardButtonText}>Start Setup (2 mins)</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.featuresLabel} maxFontSizeMultiplier={1.3}>FEATURES TO UNLOCK</Text>
          <View style={styles.featuresCard}>
            {featureRows.map((f, i) => (
              <View key={f.label} style={[styles.featureRow, i === 0 && styles.featureRowFirst]}>
                <View style={styles.featureRowIcon}>
                  <Icon name={f.icon} size={20} color={Theme.eyebrowGreen} />
                </View>
                <Text style={styles.featureRowText}>{f.label}</Text>
              </View>
            ))}
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <View style={{ flex: 1 }}>
            <Text style={styles.eyebrow}>TODAY · {DAY_NAMES[new Date().getDay()].toUpperCase()}</Text>
            <Text style={styles.title}>{clubName}</Text>
          </View>
          <NotificationBell />
        </View>
        {myClubs.length > 1 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.clubSwitchRow}>
            {myClubs.map((c) => (
              <TouchableOpacity key={c.clubId} style={[styles.clubChip, c.clubId === clubId && styles.clubChipActive]} onPress={() => switchClub(c.clubId)}>
                <Text style={[styles.clubChipText, c.clubId === clubId && styles.clubChipTextActive]}>{c.clubName}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Theme.eyebrowGreen} colors={[Theme.eyebrowGreen]} />}
      >
        {loading ? (
          <Text style={styles.muted} maxFontSizeMultiplier={1.3}>Loading...</Text>
        ) : (
          <>
            {/* ── Join Codes ── */}
            <View style={styles.codeCardRow}>
              <View style={styles.codeCard}>
                <Text style={styles.codeCardLabel} maxFontSizeMultiplier={1.3}>PLAYER JOIN CODE</Text>
                <Text style={styles.codeCardValue}>{playerJoinCode}</Text>
                <TouchableOpacity style={styles.codeCardCopyRow} onPress={() => copyCode(playerJoinCode, 'player')}>
                  <Icon name={copiedPlayerCode ? 'check-circle-outline' : 'content-copy'} size={16} color={copiedPlayerCode ? Theme.todayBlue : Theme.eyebrowGreen} />
                  <Text style={[styles.codeCardCopyText, copiedPlayerCode && { color: Theme.todayBlue }]}>{copiedPlayerCode ? 'Copied' : 'Copy Code'}</Text>
                </TouchableOpacity>
              </View>
              <View style={styles.codeCard}>
                <Text style={styles.codeCardLabel} maxFontSizeMultiplier={1.3}>COACH JOIN CODE</Text>
                <Text style={styles.codeCardValue}>{coachJoinCode}</Text>
                <TouchableOpacity style={styles.codeCardCopyRow} onPress={() => copyCode(coachJoinCode, 'coach')}>
                  <Icon name={copiedCoachCode ? 'check-circle-outline' : 'content-copy'} size={16} color={copiedCoachCode ? Theme.todayBlue : Theme.eyebrowGreen} />
                  <Text style={[styles.codeCardCopyText, copiedCoachCode && { color: Theme.todayBlue }]}>{copiedCoachCode ? 'Copied' : 'Copy Code'}</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* ── Pending Actions ── */}
            {pendingActionsCount > 0 && (
              <View style={styles.pendingActionsCard}>
                <Text style={styles.pendingActionsTitle}>Pending Actions</Text>
                {pendingJoinRequests.length > 0 && (
                  <View style={styles.pendingActionRow}>
                    <Icon name="account-plus-outline" size={20} color={Theme.textPrimary} />
                    <Text style={styles.pendingActionText}>{pendingJoinRequests.length} join request{pendingJoinRequests.length === 1 ? '' : 's'} waiting for approval</Text>
                  </View>
                )}
                {owedMakeupCount > 0 && (
                  <View style={styles.pendingActionRow}>
                    <Icon name="refresh" size={20} color={Theme.textPrimary} />
                    <Text style={styles.pendingActionText}>{owedMakeupCount} makeup credit{owedMakeupCount === 1 ? '' : 's'} to schedule</Text>
                  </View>
                )}
                {scheduleRequestCount > 0 && (
                  <TouchableOpacity style={styles.pendingActionRow} onPress={() => router.push({ pathname: '/(club-admin)/club-calendar', params: { view: 'coach' } } as any)}>
                    <Icon name="calendar-edit" size={20} color={Theme.textPrimary} />
                    <Text style={styles.pendingActionText}>{scheduleRequestCount} schedule request{scheduleRequestCount === 1 ? '' : 's'} waiting on a coach</Text>
                    <Icon name="chevron-right" size={18} color={Theme.textMuted} />
                  </TouchableOpacity>
                )}
                {waitlistCount > 0 && (
                  <TouchableOpacity style={styles.pendingActionRow} onPress={() => router.push({ pathname: '/(club-admin)/club-calendar', params: { view: 'coach' } } as any)}>
                    <Icon name="account-multiple" size={20} color={Theme.textPrimary} />
                    <Text style={styles.pendingActionText}>{waitlistCount} player{waitlistCount === 1 ? '' : 's'} on a waitlist</Text>
                    <Icon name="chevron-right" size={18} color={Theme.textMuted} />
                  </TouchableOpacity>
                )}
              </View>
            )}

            {/* ── Today's Classes ── */}
            <Text style={styles.sectionLabel}>TODAY'S CLASSES</Text>
            {todaysGroupLessons.length === 0 && upcomingLessonSessions.length === 0 ? (
              <Text style={styles.emptyText} maxFontSizeMultiplier={1.3}>Nothing scheduled today.</Text>
            ) : (
              <>
                {todaysGroupLessons.length > 0 && (
                  <>
                    <Text style={styles.classSubLabel} maxFontSizeMultiplier={1.3}>Group Lessons</Text>
                    {todaysGroupLessons.map(({ lesson, slot }) => {
                      const notAttending = groupNotAttendingToday[lesson.id] ?? 0;
                      const attendingCount = Math.max(0, lesson.roster_count - notAttending);
                      return (
                        <TouchableOpacity key={slot.id} style={styles.sessionCard} onPress={() => openGroupAttendance(lesson, slot)}>
                          <View style={styles.sessionIcon}>
                            <Icon name="account-group" size={20} color={Theme.eyebrowGreen} />
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.sessionTitle}>{formatTime12h(slot.start_time)} · {lesson.name}</Text>
                            <Text style={styles.sessionMeta} maxFontSizeMultiplier={1.3}>{attendingCount}/{lesson.roster_count} players{slot.court_names.length ? ` · ${slot.court_names.join(', ')}` : ''}</Text>
                          </View>
                          <Icon name="chevron-right" size={20} color={Theme.textMuted} />
                        </TouchableOpacity>
                      );
                    })}
                  </>
                )}

                {upcomingLessonSessions.length > 0 && (
                  <>
                    <Text style={[styles.classSubLabel, { marginTop: 16 }]} maxFontSizeMultiplier={1.3}>Private Lessons</Text>
                    {upcomingLessonSessions.map((l) => {
                      const att = statusFor(privateAttendance, l.player_id);
                      return (
                        <View key={l.id} style={styles.sessionCard}>
                          <View style={styles.sessionIcon}>
                            <Icon name="account-circle" size={20} color={Theme.todayBlue} />
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.sessionTitle}>{formatTime12h(l.start_time)} · {l.coach_name} · Private</Text>
                            <Text style={styles.sessionMeta} maxFontSizeMultiplier={1.3}>{firstName(l.player_name)}{l.court_name ? ` · ${l.court_name}` : ''}</Text>
                            <Text style={[styles.sessionMeta, { color: att.attending ? Theme.eyebrowGreen : '#c0392b', fontWeight: '600', marginTop: 2 }]} maxFontSizeMultiplier={1.3}>
                              {att.attending ? 'Attending' : 'Not attending'}{att.coachOverride ? ' (coach override)' : ''}
                            </Text>
                          </View>
                          <TouchableOpacity onPress={() => toggleCoachAttendance(l, !att.attending)}>
                            <Text style={{ fontSize: 12, fontWeight: '700', color: Theme.todayBlue }}>{att.attending ? 'Mark absent' : 'Mark attending'}</Text>
                          </TouchableOpacity>
                        </View>
                      );
                    })}
                  </>
                )}
              </>
            )}

            {coaches.length > 0 && (
              <>
                <Text style={[styles.sectionLabel, { marginTop: 24 }]}>COACHES</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, marginBottom: 8 }}>
                  {coaches.map((c) => (
                    <TouchableOpacity key={c.id} style={styles.coachChip} onPress={() => openCoach(c)}>
                      <View style={[styles.coachAvatar, { backgroundColor: colorForId(c.id).bg }]}>
                        <Text style={[styles.coachAvatarText, { color: colorForId(c.id).fg }]}>{c.full_name.slice(0, 1).toUpperCase()}</Text>
                      </View>
                      <Text style={styles.coachChipText} numberOfLines={1}>{firstName(c.full_name)}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </>
            )}

            {/* ── Player Roster ── */}
            <Text style={[styles.hubLabel, { marginTop: 28 }]} maxFontSizeMultiplier={1.3}>PLAYER ROSTER</Text>
            <TouchableOpacity style={styles.rosterSummaryCard} onPress={() => setRosterModalVisible(true)}>
              <View style={styles.rosterSummaryTop}>
                <View style={styles.rosterSummaryIconWrap}>
                  <Icon name="account-multiple" size={22} color={Theme.textPrimary} />
                </View>
                <Text style={styles.rosterSummaryCount}>{roster.length} Active Player{roster.length === 1 ? '' : 's'}</Text>
              </View>
              {pendingJoinRequests.length > 0 && (
                <TouchableOpacity
                  style={styles.rosterSummaryBtn}
                  onPress={() => setPendingModalVisible(true)}
                >
                  <Text style={styles.rosterSummaryBtnText}>Approve Requests ({pendingJoinRequests.length})</Text>
                </TouchableOpacity>
              )}
            </TouchableOpacity>

            {/* ── Group Lessons ── */}
            <Text style={[styles.hubLabel, { marginTop: 24 }]} maxFontSizeMultiplier={1.3}>GROUP LESSONS</Text>
            <TouchableOpacity style={styles.card} onPress={() => router.push('/(club-admin)/tiers' as any)}>
              {groupLessons.length === 0 ? (
                <Text style={styles.emptyText} maxFontSizeMultiplier={1.3}>No group lessons yet — tap to create one.</Text>
              ) : (
                groupLessons.slice(0, 5).map((lesson) => {
                  const mainCoach = lesson.coaches.find((c) => c.role === 'main');
                  return (
                    <View key={lesson.id} style={styles.rosterRow}>
                      <View style={[styles.colorDot, { backgroundColor: colorForId(lesson.id).fg }]} />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.rosterName}>{lesson.name}</Text>
                        <Text style={styles.rosterEmail} maxFontSizeMultiplier={1.3}>{mainCoach ? `Coach: ${mainCoach.full_name} · ` : ''}{lesson.roster_count} player{lesson.roster_count === 1 ? '' : 's'}</Text>
                      </View>
                    </View>
                  );
                })
              )}
              <View style={styles.manageRow}>
                <Text style={styles.manageText}>Manage Group Lessons</Text>
                <Icon name="chevron-right" size={18} color={Theme.eyebrowGreen} />
              </View>
            </TouchableOpacity>

            {/* ── Tournament Makeups ── */}
            {makeupCredits.length > 0 && (
              <>
                <Text style={[styles.hubLabel, { marginTop: 24 }]} maxFontSizeMultiplier={1.3}>TOURNAMENT MAKEUPS</Text>
                <TouchableOpacity style={styles.card} onPress={() => router.push({ pathname: '/(club-admin)/tiers', params: { view: 'makeups' } } as any)}>
                  <View style={styles.rosterRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.rosterName}>{makeupCredits.length} lesson{makeupCredits.length === 1 ? '' : 's'} rescheduled for tournaments</Text>
                      <Text style={styles.rosterEmail} maxFontSizeMultiplier={1.3}>
                        {owedMakeupCount > 0 ? `${owedMakeupCount} still need${owedMakeupCount === 1 ? 's' : ''} a makeup slot` : 'All caught up — every makeup has a slot'}
                      </Text>
                    </View>
                    <Icon name="chevron-right" size={20} color={Theme.textMuted} />
                  </View>
                  {needsSlotPreview.map((credit) => (
                    <View key={`${credit.kind}_${credit.id}`} style={styles.makeupPreviewRow}>
                      <View style={styles.makeupPreviewDot} />
                      <Text style={styles.makeupPreviewText} numberOfLines={1} maxFontSizeMultiplier={1.3}>{firstName(credit.playerName)} · {credit.label} · needs a slot</Text>
                    </View>
                  ))}
                </TouchableOpacity>
              </>
            )}

            {/* ── Club ── */}
            <Text style={[styles.hubLabel, { marginTop: 24 }]} maxFontSizeMultiplier={1.3}>CLUB</Text>
            <TouchableOpacity style={styles.card} onPress={() => router.push('/(club-admin)/club-settings' as any)}>
              <View style={styles.rosterRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rosterName}>{clubName}</Text>
                  <Text style={styles.rosterEmail} maxFontSizeMultiplier={1.3}>{coaches.length} coach{coaches.length === 1 ? '' : 'es'} · {courts.length} court{courts.length === 1 ? '' : 's'} · {waitlistCount} on waitlist</Text>
                </View>
                <Icon name="chevron-right" size={20} color={Theme.textMuted} />
              </View>
            </TouchableOpacity>
          </>
        )}
      </ScrollView>

      {/* Player roster modal — full list of players who've joined the club */}
      <Modal visible={rosterModalVisible} transparent animationType="fade" onRequestClose={() => setRosterModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Player Roster</Text>
              <TouchableOpacity onPress={() => setRosterModalVisible(false)}>
                <Icon name="close-circle-outline" size={26} color={Theme.textPrimary} />
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              {!isOwner && (
                <Text style={styles.scopeNote}>
                  {rosterScope === 'full_roster' ? 'Showing the full club roster.' : "Showing only players assigned to you. Ask your club admin for full roster access."}
                </Text>
              )}
              {roster.length === 0 ? (
                <Text style={styles.emptyText} maxFontSizeMultiplier={1.3}>No players on the roster yet — share the club code from Settings.</Text>
              ) : (
                [...skillLevels, 'Unassigned'].map((level) => {
                  const group = roster.filter((r) => (level === 'Unassigned' ? !r.level : r.level === level));
                  if (group.length === 0) return null;
                  return (
                    <View key={level}>
                      <Text style={styles.levelGroupLabel}>{level.toUpperCase()} · {group.length}</Text>
                      {group.map((r) => (
                        <TouchableOpacity key={r.id} style={styles.rosterRow} onPress={() => { setRosterModalVisible(false); openFolder(r); }}>
                          <Text style={styles.rosterName}>{firstName(r.full_name)}</Text>
                          <Icon name="chevron-right" size={20} color={Theme.textMuted} />
                        </TouchableOpacity>
                      ))}
                    </View>
                  );
                })
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Pending join requests modal */}
      <Modal visible={pendingModalVisible} transparent animationType="fade" onRequestClose={() => setPendingModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Pending Join Requests</Text>
              <TouchableOpacity onPress={() => setPendingModalVisible(false)}>
                <Icon name="close-circle-outline" size={26} color={Theme.textPrimary} />
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              {pendingJoinRequests.length === 0 ? (
                <Text style={styles.emptyText} maxFontSizeMultiplier={1.3}>No pending requests.</Text>
              ) : (
                pendingJoinRequests.map((r) => (
                  <View key={r.id} style={styles.rosterRow}>
                    <Text style={[styles.rosterName, { flex: 1 }]}>{firstName(r.playerName)}</Text>
                    <TouchableOpacity style={styles.addBtn} onPress={() => openApproval(r)} disabled={addingId === r.id}>
                      <Text style={styles.addBtnText}>Approve</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => rejectJoinRequest(r)} disabled={addingId === r.id}>
                      <Icon name="close-circle-outline" size={22} color="#FF6B6B" />
                    </TouchableOpacity>
                  </View>
                ))
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Player folder modal */}
      <Modal visible={!!folderPlayer} transparent animationType="fade" onRequestClose={() => setFolderPlayer(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{firstName(folderPlayer?.full_name)}</Text>
              <TouchableOpacity onPress={() => setFolderPlayer(null)}>
                <Icon name="close-circle-outline" size={26} color={Theme.textPrimary} />
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              {folderLoading ? (
                <Text style={styles.muted} maxFontSizeMultiplier={1.3}>Loading...</Text>
              ) : folder ? (
                <>
                  {folder.mainCoachName && <Text style={styles.hint} maxFontSizeMultiplier={1.3}>Main coach: {folder.mainCoachName}</Text>}

                  {skillLevels.length > 0 && (
                    <>
                      <Text style={styles.formLabel} maxFontSizeMultiplier={1.3}>Batch type{!isOwner ? ' (owner only)' : ''}</Text>
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
                        {skillLevels.map((level) => {
                          const active = folderPlayer?.level === level;
                          return (
                            <TouchableOpacity key={level} disabled={!isOwner} style={[styles.clubChip, active && styles.clubChipActive]} onPress={() => setFolderPlayerLevel(level)}>
                              <Text style={[styles.clubChipText, active && styles.clubChipTextActive]}>{level}</Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    </>
                  )}

                  {coaches.length > 0 && (
                    <>
                      <Text style={styles.formLabel} maxFontSizeMultiplier={1.3}>Priority coach{!isOwner ? ' (owner only)' : ''}</Text>
                      <Text style={styles.hint} maxFontSizeMultiplier={1.3}>Other coaches this player can see are shown view-only on the player side.</Text>
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
                        {coaches.map((c) => {
                          const active = folderPlayer?.priority_coach_id === c.id;
                          return (
                            <TouchableOpacity key={c.id} disabled={!isOwner} style={[styles.clubChip, active && styles.clubChipActive]} onPress={() => setFolderPlayerPriorityCoach(c.id)}>
                              <Text style={[styles.clubChipText, active && styles.clubChipTextActive]}>{c.full_name}</Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    </>
                  )}

                  <Text style={styles.formLabel} maxFontSizeMultiplier={1.3}>Private lesson schedule</Text>
                  {folder.privateLessons.length === 0 ? (
                    <Text style={styles.emptyText} maxFontSizeMultiplier={1.3}>No private lessons yet.</Text>
                  ) : (
                    folder.privateLessons.map((l) => (
                      <View key={l.id} style={styles.rosterRow}>
                        <Text style={styles.rosterName}>{DAY_NAMES[l.day_of_week].slice(0, 3)} · {formatTime12h(l.start_time)}–{formatTime12h(l.end_time)}</Text>
                        <Text style={styles.rosterEmail} maxFontSizeMultiplier={1.3}>{l.coach_name}</Text>
                      </View>
                    ))
                  )}

                  <Text style={[styles.formLabel, { marginTop: 16 }]} maxFontSizeMultiplier={1.3}>Group lessons (read-only)</Text>
                  {folder.groupLessons.length === 0 ? (
                    <Text style={styles.emptyText} maxFontSizeMultiplier={1.3}>Not enrolled in any group lessons.</Text>
                  ) : (
                    folder.groupLessons.map((g) => (
                      <View key={g.id} style={styles.rosterRow}>
                        <Text style={styles.rosterName}>{g.name}</Text>
                        {g.mainCoachName && <Text style={styles.rosterEmail} maxFontSizeMultiplier={1.3}>{g.mainCoachName}</Text>}
                      </View>
                    ))
                  )}
                </>
              ) : null}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Group lesson attendance modal (today) */}
      <Modal visible={!!groupModal} transparent animationType="fade" onRequestClose={() => setGroupModal(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{groupModal?.lesson.name} — Attendance</Text>
              <TouchableOpacity onPress={() => setGroupModal(null)}>
                <Icon name="close-circle-outline" size={26} color={Theme.textPrimary} />
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              {groupAttLoading ? (
                <Text style={styles.muted} maxFontSizeMultiplier={1.3}>Loading...</Text>
              ) : groupRoster.length === 0 ? (
                <Text style={styles.emptyText} maxFontSizeMultiplier={1.3}>No players in this lesson yet.</Text>
              ) : (
                groupRoster.map((p) => {
                  const att = statusFor(groupAttendance, p.player_id);
                  return (
                    <View key={p.id} style={styles.rosterRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.rosterName}>{firstName(p.player_name)}</Text>
                        <Text style={[styles.rosterEmail, { color: att.attending ? Theme.eyebrowGreen : '#c0392b', fontWeight: '600' }]} maxFontSizeMultiplier={1.3}>
                          {att.attending ? 'Attending' : 'Not attending'}{att.coachOverride ? ' (coach override)' : ''}
                        </Text>
                      </View>
                      <TouchableOpacity onPress={() => toggleGroupAttendance(p.player_id, !att.attending)}>
                        <Text style={{ fontSize: 13, fontWeight: '700', color: Theme.todayBlue }}>{att.attending ? 'Mark absent' : 'Mark attending'}</Text>
                      </TouchableOpacity>
                    </View>
                  );
                })
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Approval modal — confirm/override level before rostering */}
      <Modal visible={!!approvalRequest} transparent animationType="fade" onRequestClose={() => setApprovalRequest(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Approve {firstName(approvalRequest?.playerName)}</Text>
              <TouchableOpacity onPress={() => setApprovalRequest(null)}>
                <Icon name="close-circle-outline" size={26} color={Theme.textPrimary} />
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={styles.hint} maxFontSizeMultiplier={1.3}>
                {approvalRequest?.signupSkillLevel
                  ? `${firstName(approvalRequest.playerName)} selected "${approvalRequest.signupSkillLevel}" at signup. Confirm or pick a different batch for your club — they'll be added to that batch's lesson roster automatically.`
                  : `${firstName(approvalRequest?.playerName)} didn't set a batch at signup — pick one for your club. They'll be added to that batch's lesson roster automatically.`}
              </Text>
              {skillLevels.length === 0 ? (
                <Text style={styles.emptyText} maxFontSizeMultiplier={1.3}>This club has no batch types set up yet — add some in Settings first.</Text>
              ) : (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginVertical: 8 }}>
                  {skillLevels.map((level) => (
                    <TouchableOpacity key={level} style={[styles.clubChip, approvalLevel === level && styles.clubChipActive]} onPress={() => setApprovalLevel(level)}>
                      <Text style={[styles.clubChipText, approvalLevel === level && styles.clubChipTextActive]}>{level}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
              <TouchableOpacity style={[styles.saveBtn, approving && { opacity: 0.6 }]} onPress={confirmApproval} disabled={approving}>
                <Text style={styles.saveBtnText}>{approving ? 'Approving...' : 'Confirm & Add to Roster'}</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Theme.background },
  header: { paddingHorizontal: 24, paddingTop: 60, paddingBottom: 16 },
  eyebrow: { fontFamily: Fonts.sansSemiBold, fontSize: 14, color: Theme.eyebrowGreen, letterSpacing: 1, marginBottom: 6 },
  title: { fontFamily: Fonts.serifMedium, fontSize: 32, color: Theme.textPrimary },
  scroll: { paddingHorizontal: 24, paddingBottom: 100 },
  muted: { fontFamily: Fonts.sansRegular, fontSize: 16, color: Theme.textSecondary, fontStyle: 'italic', marginTop: 20 },
  sectionLabel: { fontFamily: Fonts.sansSemiBold, fontSize: 15, color: Theme.eyebrowGreen, letterSpacing: 1, marginBottom: 12 },
  hubLabel: { fontFamily: Fonts.sansBold, fontSize: 13, color: Theme.textMuted, letterSpacing: 1.5, marginBottom: 10 },
  emptyText: { fontFamily: Fonts.sansRegular, fontSize: 16, color: Theme.textSecondary, fontStyle: 'italic', marginBottom: 8 },
  hint: { fontFamily: Fonts.sansRegular, fontSize: 14, color: Theme.textSecondary, lineHeight: 19, marginBottom: 12 },
  scopeNote: { fontFamily: Fonts.sansSemiBold, fontSize: 13, color: Theme.eyebrowGreen, marginBottom: 10 },
  clubSwitchRow: { gap: 8, marginTop: 12 },
  clubChip: { backgroundColor: Theme.cardTinted, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 7 },
  clubChipActive: { backgroundColor: Theme.eyebrowGreen },
  clubChipText: { fontFamily: Fonts.sansSemiBold, fontSize: 13, color: Theme.eyebrowGreen },
  clubChipTextActive: { color: '#fff' },
  coachChip: { alignItems: 'center', width: 72 },
  coachAvatar: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  coachAvatarText: { fontFamily: Fonts.sansBold, fontSize: 20 },
  coachChipText: { fontFamily: Fonts.sansSemiBold, fontSize: 13, color: Theme.textPrimary, textAlign: 'center' },
  card: { backgroundColor: Theme.cardWhite, borderRadius: 16, padding: 18, marginBottom: 8 },
  setupCard: { backgroundColor: Theme.cardWhite, borderRadius: 20, padding: 32, alignItems: 'center', marginTop: 20 },
  setupCardIconWrap: { width: 76, height: 76, borderRadius: 38, backgroundColor: Theme.cardTinted, alignItems: 'center', justifyContent: 'center' },
  setupCardTitle: { fontFamily: Fonts.serifMedium, fontSize: 24, color: Theme.textPrimary, marginTop: 18, marginBottom: 8, textAlign: 'center' },
  setupCardDesc: { fontFamily: Fonts.sansRegular, fontSize: 15, color: Theme.textSecondary, textAlign: 'center', lineHeight: 21, marginBottom: 24 },
  setupCardButton: { backgroundColor: Theme.eyebrowGreen, borderRadius: 12, paddingVertical: 15, paddingHorizontal: 32, alignItems: 'center' },
  setupCardButtonText: { fontFamily: Fonts.sansBold, fontSize: 15, color: '#fff' },
  featuresLabel: { fontFamily: Fonts.sansBold, fontSize: 13, color: Theme.textMuted, letterSpacing: 1.5, marginTop: 28, marginBottom: 10 },
  featuresCard: { backgroundColor: Theme.cardWhite, borderRadius: 16, padding: 18 },
  featureRow: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 12, borderTopWidth: 1, borderTopColor: Theme.divider },
  featureRowFirst: { borderTopWidth: 0, paddingTop: 0 },
  featureRowIcon: { width: 38, height: 38, borderRadius: 19, backgroundColor: Theme.cardTinted, alignItems: 'center', justifyContent: 'center' },
  featureRowText: { fontFamily: Fonts.sansSemiBold, fontSize: 15, color: Theme.textPrimary },
  rosterSummaryCard: { backgroundColor: Theme.cardWhite, borderRadius: 16, padding: 18, marginBottom: 8 },
  rosterSummaryTop: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 },
  rosterSummaryIconWrap: { width: 40, height: 40, borderRadius: 20, backgroundColor: Theme.cardTinted, alignItems: 'center', justifyContent: 'center' },
  rosterSummaryCount: { fontFamily: Fonts.sansBold, fontSize: 18, color: Theme.textPrimary },
  rosterSummaryBtn: { alignSelf: 'flex-start', borderWidth: 1.5, borderColor: Theme.eyebrowGreen, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 10 },
  rosterSummaryBtnText: { fontFamily: Fonts.sansBold, fontSize: 14, color: Theme.eyebrowGreen },
  codeCardRow: { flexDirection: 'row', gap: 12, marginBottom: 18 },
  codeCard: { flex: 1, backgroundColor: Theme.cardWhite, borderRadius: 16, padding: 16 },
  codeCardLabel: { fontFamily: Fonts.sansBold, fontSize: 11, color: Theme.textMuted, letterSpacing: 1, marginBottom: 6 },
  codeCardValue: { fontFamily: Fonts.serifMedium, fontSize: 20, color: Theme.textPrimary, letterSpacing: 1.5, marginBottom: 14 },
  codeCardCopyRow: { flexDirection: 'row', alignItems: 'center', gap: 6, borderTopWidth: 1, borderTopColor: Theme.divider, paddingTop: 10 },
  codeCardCopyText: { fontFamily: Fonts.sansSemiBold, fontSize: 13, color: Theme.eyebrowGreen },
  pendingActionsCard: { backgroundColor: '#FFF4E5', borderRadius: 16, padding: 20, marginBottom: 26, gap: 14 },
  pendingActionsTitle: { fontFamily: Fonts.sansBold, fontSize: 17, color: Theme.textPrimary },
  pendingActionRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  pendingActionText: { fontFamily: Fonts.sansRegular, fontSize: 16, color: Theme.textPrimary, flex: 1 },
  classSubLabel: { fontFamily: Fonts.sansBold, fontSize: 14, color: Theme.textMuted, letterSpacing: 1, marginBottom: 10 },
  rosterRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12, borderTopWidth: 1, borderTopColor: Theme.divider, gap: 10 },
  levelGroupLabel: { fontFamily: Fonts.sansBold, fontSize: 12, color: Theme.eyebrowGreen, letterSpacing: 1, marginTop: 14, marginBottom: 2 },
  saveBtn: { backgroundColor: Theme.eyebrowGreen, borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 20 },
  saveBtnText: { fontFamily: Fonts.sansBold, fontSize: 15, color: '#fff' },
  colorDot: { width: 10, height: 10, borderRadius: 5 },
  rosterName: { fontFamily: Fonts.sansSemiBold, fontSize: 15, color: Theme.textPrimary },
  rosterEmail: { fontFamily: Fonts.sansRegular, fontSize: 13, color: Theme.textSecondary, marginTop: 2 },
  addBtn: { backgroundColor: Theme.limeAccent, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8 },
  addBtnText: { fontFamily: Fonts.sansBold, fontSize: 13, color: Theme.limeAccentDark },
  makeupPreviewRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 10 },
  makeupPreviewDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: Theme.flameOrange },
  makeupPreviewText: { flex: 1, fontFamily: Fonts.sansRegular, fontSize: 13, color: Theme.textSecondary },
  manageRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingTop: 14, marginTop: 4 },
  manageText: { fontFamily: Fonts.sansSemiBold, fontSize: 14, color: Theme.eyebrowGreen },
  sessionCard: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: Theme.cardWhite, borderRadius: 14, padding: 18, marginBottom: 10 },
  sessionIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: Theme.cardTinted, alignItems: 'center', justifyContent: 'center' },
  sessionTitle: { fontFamily: Fonts.sansSemiBold, fontSize: 17, color: Theme.textPrimary },
  sessionMeta: { fontFamily: Fonts.sansRegular, fontSize: 15, color: Theme.textSecondary, marginTop: 2 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: Theme.background, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, maxHeight: '85%' },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 },
  modalTitle: { fontFamily: Fonts.serifMedium, fontSize: 22, color: Theme.textPrimary, flexShrink: 1 },
  formLabel: { fontFamily: Fonts.sansSemiBold, fontSize: 15, color: Theme.textSecondary, marginBottom: 4, marginTop: 4 },
});
