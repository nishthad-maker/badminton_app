import { View, StyleSheet, TouchableOpacity, ScrollView, Modal } from 'react-native';
import { TextInput } from '@/components/TextInput';
import { Text } from '@/components/Text';
import { Icon } from '@/components/icons/Icon';
import { router, useFocusEffect } from 'expo-router';
import { useState, useCallback } from 'react';
import { Theme, Fonts } from '@/constants/theme';
import { supabase } from '../lib/supabase';
import { showAlert, showConfirm } from '../lib/ui';
import { getLinkedChildren, unlink, redeemCode, LinkedPerson } from '../lib/parentLink';
import { getActiveChildId, setActiveChildId } from '../lib/parentSelection';
import { getGroupLessonRoster } from '../lib/playerClub';
import { RosterPlayer } from '../lib/lessons';
import { colorForId } from '../lib/colors';
import { DAY_NAMES, formatTime12h, firstName } from '../lib/scheduling';
import { getAttendanceForDate, setAttendance, statusFor, nextOccurrenceDate, AttendanceStatus } from '../lib/attendance';
import { NotificationBell } from '@/components/NotificationBell';
import {
  getChildClubs, getChildProgress, getSharedJournalEntries, getUpcomingTournaments, createTournamentBlock,
  getChildLessons, getChildGroupLessons, getChildPayments, getPayableItems, submitPaymentReport,
  getClubCoaches, getCoachBusyWindows, isSlotOpen, submitScheduleRequest, getMyScheduleRequests,
  ChildClub, RecentLog, SharedJournalEntry, UpcomingTournament, ChildLesson, ChildGroupLesson,
  ChildPayment, PayableItem, ClubCoach, ScheduleRequestRow,
} from '../lib/parentDashboard';
import { MiniDatePicker } from '@/components/MiniDatePicker';
import { maybeRemindUpcoming } from '../lib/lessonReminders';
import { getPlayerMakeupCredits, MakeupCredit } from '../lib/makeup';

export type ParentSection = 'home' | 'schedule' | 'tournaments' | 'journal';

const SECTION_TITLES: Record<ParentSection, string> = {
  home: 'Home', schedule: 'Schedule', tournaments: 'Tournaments', journal: 'Journal',
};

const HOURS = Array.from({ length: 13 }, (_, i) => 8 + i); // 8am – 8pm candidate slots
const METHODS: { key: 'cash' | 'card' | 'e_transfer' | 'other'; label: string }[] = [
  { key: 'cash', label: 'Cash' }, { key: 'card', label: 'Card' }, { key: 'e_transfer', label: 'E-transfer' }, { key: 'other', label: 'Other' },
];

type ActivityItem = { id: string; icon: string; title: string; subtitle: string; date: string };

// Shared implementation behind all 4 parent tabs ((parent-tabs)/home|schedule|
// tournaments|journal.tsx) — the child/club switcher and link-a-child flow
// are global to the parent, not per-section, so they render on every tab;
// only the section-specific content below them changes. Each tab screen is a
// thin wrapper passing a fixed `section` — see (parent-tabs)/_layout.tsx.
export function ParentDashboardContent({ section }: { section: ParentSection }) {
  const [myId, setMyId] = useState<string | null>(null);
  const [children, setChildren] = useState<LinkedPerson[]>([]);
  const [selectedChildId, setSelectedChildId] = useState<string | null>(null);
  const [childClubs, setChildClubs] = useState<ChildClub[]>([]);
  const [selectedClubId, setSelectedClubId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Link-a-child
  const [codeInput, setCodeInput] = useState('');
  const [redeeming, setRedeeming] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);

  // Home / activity
  const [progress, setProgress] = useState<{ totalSessions: number; streak: number } | null>(null);
  const [recentLogs, setRecentLogs] = useState<RecentLog[]>([]);
  const [journalEntries, setJournalEntries] = useState<SharedJournalEntry[]>([]);
  const [tournaments, setTournaments] = useState<UpcomingTournament[]>([]);

  // Schedule
  const [privateLessons, setPrivateLessons] = useState<ChildLesson[]>([]);
  const [groupLessons, setGroupLessons] = useState<ChildGroupLesson[]>([]);
  const [rosterLesson, setRosterLesson] = useState<ChildGroupLesson | null>(null);
  const [roster, setRoster] = useState<RosterPlayer[]>([]);
  const [clubCoaches, setClubCoaches] = useState<ClubCoach[]>([]);
  const [myRequests, setMyRequests] = useState<ScheduleRequestRow[]>([]);
  const [reqCoachId, setReqCoachId] = useState<string | null>(null);
  const [reqDay, setReqDay] = useState(1);
  const [busySlots, setBusySlots] = useState<{ start: string; end: string }[]>([]);
  const [submittingSlot, setSubmittingSlot] = useState<string | null>(null);
  const [privateAtt, setPrivateAtt] = useState<Record<string, AttendanceStatus>>({});
  const [groupAtt, setGroupAtt] = useState<Record<string, AttendanceStatus>>({});
  const [makeupCredits, setMakeupCredits] = useState<MakeupCredit[]>([]);

  // Tournaments
  const [showTournamentModal, setShowTournamentModal] = useState(false);
  const [tournamentStart, setTournamentStart] = useState<string | null>(null);
  const [tournamentEnd, setTournamentEnd] = useState<string | null>(null);
  const [savingTournament, setSavingTournament] = useState(false);

  // Payments
  const [payments, setPayments] = useState<ChildPayment[]>([]);
  const [showPayModal, setShowPayModal] = useState(false);
  const [payableItems, setPayableItems] = useState<PayableItem[]>([]);
  const [selectedPayable, setSelectedPayable] = useState<PayableItem | null>(null);
  const [payMethod, setPayMethod] = useState<'cash' | 'card' | 'e_transfer' | 'other'>('cash');
  const [savingPayment, setSavingPayment] = useState(false);

  const loadChildren = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) { router.replace('/login' as any); return; }
    setMyId(session.user.id);
    const kids = await getLinkedChildren(session.user.id);
    setChildren(kids);
    const storedId = await getActiveChildId();
    const resolved = (storedId && kids.some((k) => k.profileId === storedId)) ? storedId : (kids[0]?.profileId ?? null);
    setSelectedChildId(resolved);
    setLoading(false);
  };

  useFocusEffect(useCallback(() => { loadChildren(); }, []));

  const selectChild = (childId: string) => {
    setSelectedChildId(childId);
    setActiveChildId(childId);
  };

  const loadChildClubs = useCallback(async () => {
    if (!selectedChildId) { setChildClubs([]); setSelectedClubId(null); return; }
    const clubs = await getChildClubs(selectedChildId);
    setChildClubs(clubs);
    setSelectedClubId((prev) => (prev && clubs.some((c) => c.clubId === prev) ? prev : clubs[0]?.clubId ?? null));
  }, [selectedChildId]);

  useFocusEffect(useCallback(() => { loadChildClubs(); }, [loadChildClubs]));

  const loadSectionData = useCallback(async () => {
    if (!selectedChildId) return;
    const [prog, journal, tourneys] = await Promise.all([
      getChildProgress(selectedChildId),
      getSharedJournalEntries(selectedChildId),
      getUpcomingTournaments(selectedChildId),
    ]);
    setProgress(prog.stats);
    setRecentLogs(prog.recentLogs);
    setJournalEntries(journal);
    setTournaments(tourneys);

    if (selectedClubId) {
      const [lessons, groups, pays, coaches, requests] = await Promise.all([
        getChildLessons(selectedChildId, selectedClubId),
        getChildGroupLessons(selectedChildId, selectedClubId),
        getChildPayments(selectedChildId, selectedClubId),
        getClubCoaches(selectedClubId),
        myId ? getMyScheduleRequests(myId, selectedChildId, selectedClubId) : Promise.resolve([]),
      ]);
      setPrivateLessons(lessons);
      setGroupLessons(groups);
      setPayments(pays);
      setClubCoaches(coaches);
      setMyRequests(requests);
      setReqCoachId((prev) => prev ?? coaches[0]?.id ?? null);

      const [privEntries, groupEntries] = await Promise.all([
        Promise.all(lessons.map(async (l) => {
          const m = await getAttendanceForDate({ scheduleAssignmentId: l.id, lessonDate: nextOccurrenceDate(l.day_of_week) });
          return [l.id, statusFor(m, selectedChildId)] as const;
        })),
        Promise.all(groups.map(async (g) => {
          const m = await getAttendanceForDate({ groupTierId: g.groupTierId, lessonDate: nextOccurrenceDate(g.day_of_week) });
          return [g.id, statusFor(m, selectedChildId)] as const;
        })),
      ]);
      setPrivateAtt(Object.fromEntries(privEntries));
      setGroupAtt(Object.fromEntries(groupEntries));
      setMakeupCredits(await getPlayerMakeupCredits(selectedChildId));

      if (myId) {
        const childName = children.find((c) => c.profileId === selectedChildId)?.fullName ?? 'Your child';
        maybeRemindUpcoming(myId, [
          ...lessons.map((l) => ({ id: l.id, day_of_week: l.day_of_week, start_time: l.start_time, label: `${childName}'s private lesson with ${l.coach_name}` })),
          ...groups.map((g) => ({ id: g.id, day_of_week: g.day_of_week, start_time: g.start_time, label: `${childName}'s ${g.name}` })),
        ]);
      }
    } else {
      setPrivateLessons([]); setGroupLessons([]); setPayments([]); setClubCoaches([]); setMyRequests([]);
      setPrivateAtt({}); setGroupAtt({}); setMakeupCredits([]);
    }
  }, [selectedChildId, selectedClubId, myId]);

  useFocusEffect(useCallback(() => { loadSectionData(); }, [loadSectionData]));

  const loadBusySlots = useCallback(async () => {
    if (!selectedClubId || !reqCoachId) { setBusySlots([]); return; }
    setBusySlots(await getCoachBusyWindows(selectedClubId, reqCoachId, reqDay));
  }, [selectedClubId, reqCoachId, reqDay]);

  useFocusEffect(useCallback(() => { loadBusySlots(); }, [loadBusySlots]));

  const toggleChildPrivateAttendance = (l: ChildLesson) => {
    if (!selectedChildId) return;
    const att = statusFor(privateAtt, l.id);
    if (att.coachOverride) { showAlert('Locked', "This lesson's attendance was set by the coach — contact them to change it."); return; }
    const date = nextOccurrenceDate(l.day_of_week);
    const nextVal = !att.attending;
    const apply = async () => {
      const res = await setAttendance({ scheduleAssignmentId: l.id, playerId: selectedChildId, lessonDate: date, attending: nextVal, actorRole: 'parent' });
      if (!res.ok) { showAlert('Could not update attendance', res.message || ''); return; }
      setPrivateAtt((prev) => ({ ...prev, [l.id]: { attending: nextVal, coachOverride: false, toggledBy: 'parent', exists: true } }));
    };
    if (att.attending) showConfirm('Mark not attending?', `Confirm your child won't be at this lesson on ${date}.`, apply);
    else apply();
  };

  const toggleChildGroupAttendance = (g: ChildGroupLesson) => {
    if (!selectedChildId) return;
    const att = statusFor(groupAtt, g.id);
    if (att.coachOverride) { showAlert('Locked', "This lesson's attendance was set by the coach or a tournament block — contact the coach to change it."); return; }
    const date = nextOccurrenceDate(g.day_of_week);
    const nextVal = !att.attending;
    const apply = async () => {
      const res = await setAttendance({ groupTierId: g.groupTierId, playerId: selectedChildId, lessonDate: date, attending: nextVal, actorRole: 'parent' });
      if (!res.ok) { showAlert('Could not update attendance', res.message || ''); return; }
      setGroupAtt((prev) => ({ ...prev, [g.id]: { attending: nextVal, coachOverride: false, toggledBy: 'parent', exists: true } }));
    };
    if (att.attending) showConfirm('Mark not attending?', `Confirm your child won't be at ${g.name} on ${date}.`, apply);
    else apply();
  };

  const submitTournament = async () => {
    if (!selectedChildId || !tournamentStart || !tournamentEnd) { showAlert('Missing dates', 'Pick a start and end date.'); return; }
    if (tournamentEnd < tournamentStart) { showAlert('Invalid range', 'End date must be after the start date.'); return; }
    setSavingTournament(true);
    const res = await createTournamentBlock(selectedChildId, tournamentStart, tournamentEnd);
    setSavingTournament(false);
    if (!res.ok) { showAlert('Error', res.message || 'Could not save the tournament dates.'); return; }
    setShowTournamentModal(false);
    setTournamentStart(null);
    setTournamentEnd(null);
    showAlert('Marked', "Your child is excluded from group lessons that week, and any private-lesson makeup credits were created automatically.");
    loadSectionData();
  };

  const submitCode = async () => {
    if (!codeInput.trim()) { showAlert('Missing code', 'Please enter the 6-character code.'); return; }
    setRedeeming(true);
    const result = await redeemCode(codeInput);
    setRedeeming(false);
    if (!result.ok) { showAlert('Could not link', result.message); return; }
    setCodeInput('');
    setShowAddForm(false);
    showAlert('Request sent', `A link request was sent to ${result.playerName} — they need to accept it before you can see their info.`);
    loadChildren();
  };

  const handleUnlink = (child: LinkedPerson) => {
    showConfirm('Unlink child?', `Remove your link to ${firstName(child.fullName)}? You can always re-link with a new code.`, async () => {
      const ok = await unlink(child.linkId);
      if (ok) { setChildren((prev) => prev.filter((c) => c.linkId !== child.linkId)); if (selectedChildId === child.profileId) setSelectedChildId(null); }
      else showAlert('Error', 'Could not unlink. Please try again.');
    });
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    router.replace('/login' as any);
  };

  const selectedChild = children.find((c) => c.profileId === selectedChildId) ?? null;
  const hasAnyClub = childClubs.length > 0;

  const requestSlot = (hour: number) => {
    if (!myId || !selectedChildId || !reqCoachId || !selectedClubId) return;
    const start = `${String(hour).padStart(2, '0')}:00`;
    const end = `${String(hour + 1).padStart(2, '0')}:00`;
    const coachName = clubCoaches.find((c) => c.id === reqCoachId)?.full_name ?? 'this coach';
    const key = `${hour}`;
    showConfirm(
      'Request this lesson?',
      `Request ${DAY_NAMES[reqDay]} ${start}–${end} with ${coachName}? The club will need to approve it before it's booked.`,
      async () => {
        setSubmittingSlot(key);
        const result = await submitScheduleRequest({ parentId: myId, childId: selectedChildId, coachId: reqCoachId, clubId: selectedClubId, dayOfWeek: reqDay, start, end });
        setSubmittingSlot(null);
        if (!result.ok) { showAlert('Could not request', result.message ?? 'Please try again.'); loadBusySlots(); return; }
        showAlert('Request sent', 'The club will review your request and notify you either way.');
        loadBusySlots();
        loadSectionData();
      },
      'Request'
    );
  };

  const openRoster = async (lesson: ChildGroupLesson) => {
    setRosterLesson(lesson);
    setRoster(await getGroupLessonRoster(lesson.groupTierId));
  };

  const openPayModal = async () => {
    if (!selectedChildId) return;
    setPayableItems(await getPayableItems(selectedChildId));
    setSelectedPayable(null);
    setPayMethod('cash');
    setShowPayModal(true);
  };

  const submitPayment = async () => {
    if (!myId || !selectedChildId || !selectedClubId || !selectedPayable) { showAlert('Missing info', 'Pick what this payment is for.'); return; }
    setSavingPayment(true);
    const result = await submitPaymentReport({ clubId: selectedClubId, childId: selectedChildId, parentId: myId, item: selectedPayable, method: payMethod });
    setSavingPayment(false);
    if (!result.ok) { showAlert('Error', result.message ?? 'Could not submit.'); return; }
    setShowPayModal(false);
    loadSectionData();
  };

  const activityFeed: ActivityItem[] = [
    ...recentLogs.map((l) => ({ id: `log-${l.id}`, icon: 'dumbbell', title: `Logged a ${l.category} session`, subtitle: '', date: l.created_at })),
    ...journalEntries.map((j) => ({ id: `journal-${j.id}`, icon: 'notebook-outline', title: 'Shared a journal entry', subtitle: j.free_text?.slice(0, 60) ?? '', date: j.created_at })),
    ...tournaments.map((t) => ({ id: `tourney-${t.id}`, icon: 'trophy-outline', title: 'Upcoming tournament', subtitle: `${t.start_date} – ${t.end_date}`, date: t.start_date })),
  ].sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 20);

  if (loading) {
    return <View style={styles.container}><Text style={styles.muted}>Loading...</Text></View>;
  }

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <View style={{ flex: 1 }}>
            <Text style={styles.eyebrow}>PARENT</Text>
            <Text style={styles.title}>{SECTION_TITLES[section]}</Text>
          </View>
          <NotificationBell />
        </View>

        {children.length === 0 ? (
          <View style={styles.card}>
            <Icon name="account-group" size={40} color={Theme.eyebrowGreen} />
            <Text style={styles.cardTitle}>Link your first child</Text>
            <Text style={styles.cardDesc}>Ask your child (or their coach) for their 6-character link code. They'll need to accept the request before you can see anything.</Text>
            <TextInput
              style={styles.codeInput}
              value={codeInput}
              onChangeText={(t) => setCodeInput(t.toUpperCase())}
              placeholder="e.g. AB3XQ9"
              placeholderTextColor={Theme.textSecondary}
              autoCapitalize="characters"
              autoCorrect={false}
              maxLength={6}
            />
            <TouchableOpacity style={[styles.button, redeeming && styles.buttonDisabled]} onPress={submitCode} disabled={redeeming}>
              <Text style={styles.buttonText}>{redeeming ? 'Sending...' : 'Send Link Request'}</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            {/* Child switcher */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, marginBottom: 14 }}>
              {children.map((child) => (
                <TouchableOpacity key={child.linkId} style={[styles.switchChip, selectedChildId === child.profileId && styles.switchChipActive]} onPress={() => selectChild(child.profileId)}>
                  <View style={[styles.switchAvatar, { backgroundColor: colorForId(child.profileId).bg }]}>
                    <Text style={{ color: colorForId(child.profileId).fg, fontFamily: Fonts.sansBold }}>{child.fullName.slice(0, 1).toUpperCase()}</Text>
                  </View>
                  <Text style={[styles.switchChipText, selectedChildId === child.profileId && styles.switchChipTextActive]}>{firstName(child.fullName)}</Text>
                </TouchableOpacity>
              ))}
              <TouchableOpacity style={styles.switchChip} onPress={() => setShowAddForm(true)}>
                <Icon name="account-plus-outline" size={20} color={Theme.eyebrowGreen} />
              </TouchableOpacity>
            </ScrollView>

            {selectedChild && section === 'home' && (
              <TouchableOpacity onPress={() => handleUnlink(selectedChild)} style={{ marginBottom: 14 }}>
                <Text style={styles.unlinkText}>Unlink {firstName(selectedChild.fullName)}</Text>
              </TouchableOpacity>
            )}

            {showAddForm && (
              <View style={styles.card}>
                <Text style={styles.sectionLabel}>LINK ANOTHER CHILD</Text>
                <TextInput
                  style={styles.codeInput}
                  value={codeInput}
                  onChangeText={(t) => setCodeInput(t.toUpperCase())}
                  placeholder="e.g. AB3XQ9"
                  placeholderTextColor={Theme.textSecondary}
                  autoCapitalize="characters"
                  autoCorrect={false}
                  maxLength={6}
                />
                <TouchableOpacity style={[styles.button, redeeming && styles.buttonDisabled]} onPress={submitCode} disabled={redeeming}>
                  <Text style={styles.buttonText}>{redeeming ? 'Sending...' : 'Send Link Request'}</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Club switcher */}
            {childClubs.length > 1 && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, marginBottom: 14 }}>
                {childClubs.map((c) => (
                  <TouchableOpacity key={c.clubId} style={[styles.pill, selectedClubId === c.clubId && styles.pillActive]} onPress={() => setSelectedClubId(c.clubId)}>
                    <Text style={[styles.pillText, selectedClubId === c.clubId && styles.pillTextActive]}>{c.clubName}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}

            {!hasAnyClub && (
              <View style={styles.noticeCard}>
                <Icon name="information-outline" size={22} color={Theme.eyebrowGreen} />
                <Text style={styles.noticeText}>{firstName(selectedChild?.fullName)} isn't rostered in a club yet. You can see their shared Journal entries below — progress, scheduling, and payments unlock once they join a club.</Text>
              </View>
            )}

            {section === 'home' && hasAnyClub && (
              <View style={styles.card}>
                <View style={{ flexDirection: 'row', gap: 24, marginBottom: 16 }}>
                  <View>
                    <Text style={styles.statNumber}>{progress?.totalSessions ?? 0}</Text>
                    <Text style={styles.statLabel}>Sessions Logged</Text>
                  </View>
                  <View>
                    <Text style={styles.statNumber}>{progress?.streak ?? 0}</Text>
                    <Text style={styles.statLabel}>Day Streak</Text>
                  </View>
                </View>
                <TouchableOpacity style={styles.button} onPress={openPayModal}>
                  <Text style={styles.buttonText}>Report a Payment</Text>
                </TouchableOpacity>
                <Text style={[styles.sectionLabel, { marginTop: 16 }]}>ACTIVITY</Text>
                {activityFeed.length === 0 ? (
                  <Text style={styles.emptyText}>Nothing yet.</Text>
                ) : (
                  activityFeed.map((item) => (
                    <View key={item.id} style={styles.activityRow}>
                      <Icon name={item.icon as any} size={20} color={Theme.eyebrowGreen} />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.rowLineTitle}>{item.title}</Text>
                        {!!item.subtitle && <Text style={styles.rowLineSub}>{item.subtitle}</Text>}
                      </View>
                    </View>
                  ))
                )}
              </View>
            )}
            {section === 'home' && !hasAnyClub && <Text style={styles.emptyText}>Progress and activity unlock once your child joins a club.</Text>}

            {section === 'schedule' && hasAnyClub && (
              <>
                <View style={styles.card}>
                  <Text style={styles.sectionLabel}>UPCOMING LESSONS</Text>
                  {privateLessons.length === 0 && groupLessons.length === 0 ? (
                    <Text style={styles.emptyText}>No upcoming lessons.</Text>
                  ) : (
                    <>
                      {privateLessons.map((l) => {
                        const att = statusFor(privateAtt, l.id);
                        return (
                          <View key={l.id} style={[styles.rowLine, { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }]}>
                            <View style={{ flex: 1 }}>
                              <Text style={styles.rowLineTitle}>{DAY_NAMES[l.day_of_week].slice(0, 3)} {formatTime12h(l.start_time)}–{formatTime12h(l.end_time)}</Text>
                              <Text style={styles.rowLineSub}>Private with {l.coach_name}{l.court_name ? ` · ${l.court_name}` : ''}</Text>
                            </View>
                            <TouchableOpacity onPress={() => toggleChildPrivateAttendance(l)} style={styles.attPill}>
                              <Icon name={att.attending ? 'check-circle' : 'close-circle'} size={16} color={att.attending ? Theme.eyebrowGreen : '#c0392b'} />
                              <Text style={[styles.attPillText, { color: att.attending ? Theme.eyebrowGreen : '#c0392b' }]}>{att.attending ? 'Attending' : 'Not attending'}</Text>
                            </TouchableOpacity>
                          </View>
                        );
                      })}
                      {groupLessons.map((g) => {
                        const att = statusFor(groupAtt, g.id);
                        return (
                          <View key={g.id} style={[styles.rowLine, { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }]}>
                            <TouchableOpacity style={{ flex: 1 }} onPress={() => openRoster(g)}>
                              <Text style={styles.rowLineTitle}>{DAY_NAMES[g.day_of_week].slice(0, 3)} {formatTime12h(g.start_time)}–{formatTime12h(g.end_time)}</Text>
                              <Text style={styles.rowLineSub}>{g.name}{g.coach_name ? ` · ${g.coach_name}` : ''} · Tap to see who's attending</Text>
                            </TouchableOpacity>
                            <TouchableOpacity onPress={() => toggleChildGroupAttendance(g)} style={styles.attPill}>
                              <Icon name={att.attending ? 'check-circle' : 'close-circle'} size={16} color={att.attending ? Theme.eyebrowGreen : '#c0392b'} />
                              <Text style={[styles.attPillText, { color: att.attending ? Theme.eyebrowGreen : '#c0392b' }]}>{att.attending ? 'Attending' : 'Not attending'}</Text>
                            </TouchableOpacity>
                          </View>
                        );
                      })}
                    </>
                  )}
                  {makeupCredits.filter((m) => m.status !== 'done').length > 0 && (
                    <>
                      <Text style={[styles.sectionLabel, { marginTop: 16 }]}>MAKEUP CREDITS</Text>
                      {makeupCredits.filter((m) => m.status !== 'done').map((m) => (
                        <View key={`${m.kind}_${m.id}`} style={styles.rowLine}>
                          <Text style={styles.rowLineTitle}>{m.label}</Text>
                          <Text style={styles.rowLineSub}>
                            {m.status === 'scheduled' ? `Scheduled ${m.scheduledDate} at ${m.scheduledStartTime ? formatTime12h(m.scheduledStartTime) : ''}` : 'Owed — ask the club to schedule it'}
                          </Text>
                        </View>
                      ))}
                    </>
                  )}
                </View>

                <View style={styles.card}>
                  <Text style={styles.sectionLabel}>REQUEST A LESSON</Text>
                  <Text style={styles.hint}>Pick a coach and day — open slots can be requested, the club will review before it's booked.</Text>
                  <View style={styles.pillWrapRow}>
                    {clubCoaches.map((c) => (
                      <TouchableOpacity key={c.id} style={[styles.pill, reqCoachId === c.id && styles.pillActive]} onPress={() => setReqCoachId(c.id)}>
                        <Text style={[styles.pillText, reqCoachId === c.id && styles.pillTextActive]}>{c.full_name}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  <View style={styles.pillWrapRow}>
                    {DAY_NAMES.map((d, i) => (
                      <TouchableOpacity key={d} style={[styles.pill, reqDay === i && styles.pillActive]} onPress={() => setReqDay(i)}>
                        <Text style={[styles.pillText, reqDay === i && styles.pillTextActive]}>{d.slice(0, 3)}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  <View style={styles.slotGrid}>
                    {HOURS.map((h) => {
                      const start = `${String(h).padStart(2, '0')}:00`;
                      const end = `${String(h + 1).padStart(2, '0')}:00`;
                      const open = isSlotOpen(busySlots, start, end);
                      return (
                        <TouchableOpacity
                          key={h}
                          style={[styles.slotBtn, !open && styles.slotBtnBusy]}
                          disabled={!open || submittingSlot === `${h}`}
                          onPress={() => requestSlot(h)}
                        >
                          <Text style={[styles.slotBtnText, !open && styles.slotBtnTextBusy]}>{h % 12 === 0 ? 12 : h % 12}{h < 12 ? 'a' : 'p'}</Text>
                          <Text style={[styles.slotBtnStatus, !open && styles.slotBtnTextBusy]}>{open ? 'Open' : 'Unavailable'}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>

                <View style={styles.card}>
                  <Text style={styles.sectionLabel}>MY REQUESTS</Text>
                  {myRequests.length === 0 ? (
                    <Text style={styles.emptyText}>No requests submitted yet.</Text>
                  ) : (
                    myRequests.map((r) => (
                      <View key={r.id} style={styles.rowLine}>
                        <Text style={styles.rowLineTitle}>{DAY_NAMES[r.day_of_week].slice(0, 3)} {formatTime12h(r.start_time)}–{formatTime12h(r.end_time)} with {r.coach_name}</Text>
                        <Text style={[styles.rowLineSub, r.status === 'approved' && { color: Theme.eyebrowGreen }, r.status === 'rejected' && { color: '#FF6B6B' }]}>
                          {r.status === 'pending' ? 'Pending review' : r.status === 'approved' ? 'Approved' : 'Not approved'}
                        </Text>
                      </View>
                    ))
                  )}
                </View>
              </>
            )}
            {section === 'schedule' && !hasAnyClub && <Text style={styles.emptyText}>Scheduling unlocks once your child joins a club.</Text>}

            {section === 'tournaments' && (
              <View style={styles.card}>
                <Text style={styles.sectionLabel}>UPCOMING TOURNAMENTS</Text>
                {tournaments.length === 0 ? (
                  <Text style={styles.emptyText}>No tournament dates marked.</Text>
                ) : (
                  tournaments.map((t) => (
                    <View key={t.id} style={styles.rowLine}>
                      <Text style={styles.rowLineTitle}>{t.start_date} – {t.end_date}</Text>
                      <Text style={styles.rowLineSub}>Excluded from group lessons that week</Text>
                    </View>
                  ))
                )}
                <TouchableOpacity style={[styles.button, { marginTop: 16 }]} onPress={() => setShowTournamentModal(true)} disabled={!selectedChildId}>
                  <Text style={styles.buttonText}>Mark Tournament Dates</Text>
                </TouchableOpacity>
              </View>
            )}

            {section === 'journal' && (
              <View style={styles.card}>
                {journalEntries.length === 0 ? (
                  <Text style={styles.emptyText}>No shared journal entries yet — {firstName(selectedChild?.fullName)} can share one from their own Journal.</Text>
                ) : (
                  journalEntries.map((j) => (
                    <View key={j.id} style={styles.rowLine}>
                      <Text style={styles.rowLineTitle}>{j.entry_date} · {j.entry_type === 'lesson' ? 'Lesson' : 'Personal'}</Text>
                      {j.free_text && <Text style={styles.rowLineSub}>{j.free_text}</Text>}
                    </View>
                  ))
                )}
              </View>
            )}
          </>
        )}

        {section === 'home' && (
          <TouchableOpacity style={styles.signOutBtn} onPress={signOut}>
            <Text style={styles.signOutText}>Sign Out</Text>
          </TouchableOpacity>
        )}
      </ScrollView>

      <Modal visible={showPayModal} transparent animationType="slide" onRequestClose={() => setShowPayModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Report a Payment</Text>
              <TouchableOpacity onPress={() => setShowPayModal(false)}>
                <Icon name="close-circle-outline" size={26} color={Theme.textPrimary} />
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={styles.sectionLabel}>WHAT'S THIS FOR?</Text>
              {payableItems.length === 0 ? (
                <Text style={styles.emptyText}>No lessons or tiers found for {firstName(selectedChild?.fullName)}.</Text>
              ) : (
                <View style={styles.pillWrapRow}>
                  {payableItems.map((item) => (
                    <TouchableOpacity key={`${item.type}-${item.id}`} style={[styles.pill, selectedPayable?.id === item.id && styles.pillActive]} onPress={() => setSelectedPayable(item)}>
                      <Text style={[styles.pillText, selectedPayable?.id === item.id && styles.pillTextActive]}>{item.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              <Text style={[styles.sectionLabel, { marginTop: 12 }]}>METHOD</Text>
              <View style={styles.pillWrapRow}>
                {METHODS.map((m) => (
                  <TouchableOpacity key={m.key} style={[styles.pill, payMethod === m.key && styles.pillActive]} onPress={() => setPayMethod(m.key)}>
                    <Text style={[styles.pillText, payMethod === m.key && styles.pillTextActive]}>{m.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={[styles.sectionLabel, { marginTop: 16 }]}>PAYMENT HISTORY</Text>
              {payments.length === 0 ? (
                <Text style={styles.emptyText}>No payment records yet.</Text>
              ) : (
                payments.map((p) => (
                  <View key={p.id} style={styles.rowLine}>
                    <Text style={styles.rowLineTitle}>{p.label}</Text>
                    <Text style={styles.rowLineSub}>
                      {p.payment_status === 'paid' ? 'Paid' : p.payment_status === 'pending' ? 'Pending review' : p.payment_status === 'rejected' ? 'Not confirmed' : 'Unpaid'}
                      {p.payment_method ? ` · ${p.payment_method}` : ''}{p.reported_by_parent_id ? ' · reported by you' : ''}
                    </Text>
                  </View>
                ))
              )}

              <TouchableOpacity style={[styles.button, { marginTop: 16 }, savingPayment && styles.buttonDisabled]} onPress={submitPayment} disabled={savingPayment}>
                <Text style={styles.buttonText}>{savingPayment ? 'Submitting...' : 'Submit Report'}</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal visible={!!rosterLesson} transparent animationType="fade" onRequestClose={() => setRosterLesson(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{rosterLesson?.name}</Text>
              <TouchableOpacity onPress={() => setRosterLesson(null)}>
                <Icon name="close-circle-outline" size={26} color={Theme.textPrimary} />
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              {roster.length === 0 ? (
                <Text style={styles.emptyText}>No one else is enrolled yet.</Text>
              ) : (
                roster.map((r) => (
                  <View key={r.id} style={styles.rowLine}>
                    <Text style={styles.rowLineTitle}>{r.player_name}</Text>
                  </View>
                ))
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal visible={showTournamentModal} transparent animationType="fade" onRequestClose={() => setShowTournamentModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Mark Tournament Dates</Text>
              <TouchableOpacity onPress={() => setShowTournamentModal(false)}>
                <Icon name="close-circle-outline" size={26} color={Theme.textPrimary} />
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={styles.rowLineTitle}>Start date</Text>
              <MiniDatePicker value={tournamentStart} onChange={setTournamentStart} minDate={new Date().toISOString().split('T')[0]} />
              <Text style={[styles.rowLineTitle, { marginTop: 16 }]}>End date</Text>
              <MiniDatePicker value={tournamentEnd} onChange={setTournamentEnd} minDate={tournamentStart ?? new Date().toISOString().split('T')[0]} />
              <TouchableOpacity style={[styles.confirmBtn, savingTournament && { opacity: 0.6 }]} onPress={submitTournament} disabled={savingTournament}>
                <Text style={styles.confirmBtnText}>{savingTournament ? 'Saving...' : 'Confirm Tournament Dates'}</Text>
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
  scroll: { padding: 24, paddingTop: 60, paddingBottom: 60 },
  eyebrow: { fontFamily: Fonts.sansSemiBold, fontSize: 14, color: Theme.eyebrowGreen, letterSpacing: 1, marginBottom: 6 },
  title: { fontFamily: Fonts.serifMedium, fontSize: 32, color: Theme.textPrimary, marginBottom: 20 },
  muted: { fontFamily: Fonts.sansRegular, fontSize: 16, color: Theme.textSecondary, fontStyle: 'italic' },
  emptyText: { fontFamily: Fonts.sansRegular, fontSize: 15, color: Theme.textSecondary, fontStyle: 'italic' },
  hint: { fontFamily: Fonts.sansRegular, fontSize: 14, color: Theme.textSecondary, lineHeight: 19, marginBottom: 12 },
  card: { backgroundColor: Theme.cardWhite, borderRadius: 18, padding: 20, marginBottom: 16, alignItems: 'flex-start', width: '100%' },
  cardTitle: { fontFamily: Fonts.serifMedium, fontSize: 20, color: Theme.textPrimary, marginTop: 12, marginBottom: 6 },
  cardDesc: { fontFamily: Fonts.sansRegular, fontSize: 15, color: Theme.textSecondary, lineHeight: 21, marginBottom: 18 },
  sectionLabel: { fontFamily: Fonts.sansSemiBold, fontSize: 13, color: Theme.eyebrowGreen, letterSpacing: 1, marginBottom: 10 },
  codeInput: {
    backgroundColor: Theme.background, borderRadius: 10, padding: 16, color: Theme.textPrimary,
    fontFamily: Fonts.serifMedium, fontSize: 22, letterSpacing: 4, textAlign: 'center', marginBottom: 16,
    borderWidth: 1, borderColor: Theme.divider, width: '100%',
  },
  button: { backgroundColor: Theme.limeAccent, borderRadius: 30, paddingVertical: 14, alignItems: 'center', width: '100%' },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { fontFamily: Fonts.sansBold, color: Theme.limeAccentDark, fontSize: 16 },
  switchChip: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: Theme.cardWhite, borderRadius: 24, paddingHorizontal: 14, paddingVertical: 10, borderWidth: 1, borderColor: Theme.divider },
  switchChipActive: { borderColor: Theme.eyebrowGreen, backgroundColor: Theme.cardTinted },
  switchAvatar: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  switchChipText: { fontFamily: Fonts.sansSemiBold, fontSize: 14, color: Theme.textSecondary },
  switchChipTextActive: { color: Theme.textPrimary },
  unlinkText: { fontFamily: Fonts.sansSemiBold, fontSize: 13, color: '#FF6B6B' },
  noticeCard: { flexDirection: 'row', gap: 12, backgroundColor: Theme.cardTinted, borderRadius: 14, padding: 16, marginBottom: 16, alignItems: 'flex-start' },
  noticeText: { flex: 1, fontFamily: Fonts.sansRegular, fontSize: 14, color: Theme.textPrimary, lineHeight: 20 },
  pill: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 20, backgroundColor: Theme.cardWhite, borderWidth: 1, borderColor: Theme.divider },
  pillWrapRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 10 },
  pillActive: { backgroundColor: Theme.eyebrowGreen, borderColor: Theme.eyebrowGreen },
  pillText: { fontFamily: Fonts.sansSemiBold, fontSize: 14, color: Theme.textSecondary },
  pillTextActive: { color: '#FFFFFF' },
  statNumber: { fontFamily: Fonts.serifMedium, fontSize: 30, color: Theme.textPrimary },
  statLabel: { fontFamily: Fonts.sansSemiBold, fontSize: 13, color: Theme.textSecondary, marginTop: 2 },
  rowLine: { paddingVertical: 10, borderTopWidth: 1, borderTopColor: Theme.divider, width: '100%' },
  rowLineTitle: { fontFamily: Fonts.sansSemiBold, fontSize: 15, color: Theme.textPrimary },
  rowLineSub: { fontFamily: Fonts.sansRegular, fontSize: 13, color: Theme.textSecondary, marginTop: 2 },
  attPill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 4 },
  attPillText: { fontSize: 12, fontWeight: '700' },
  confirmBtn: { backgroundColor: Theme.eyebrowGreen, borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 20 },
  confirmBtnText: { fontFamily: Fonts.sansBold, fontSize: 15, color: '#fff' },
  activityRow: { flexDirection: 'row', gap: 12, alignItems: 'flex-start', paddingVertical: 10, borderTopWidth: 1, borderTopColor: Theme.divider, width: '100%' },
  slotGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  slotBtn: { width: '22%', backgroundColor: Theme.cardTinted, borderRadius: 10, paddingVertical: 10, alignItems: 'center' },
  slotBtnBusy: { backgroundColor: Theme.divider, opacity: 0.6 },
  slotBtnText: { fontFamily: Fonts.sansBold, fontSize: 14, color: Theme.eyebrowGreen },
  slotBtnStatus: { fontFamily: Fonts.sansRegular, fontSize: 10, color: Theme.eyebrowGreen, marginTop: 2 },
  slotBtnTextBusy: { color: Theme.textMuted },
  signOutBtn: { paddingVertical: 12, alignItems: 'center', marginTop: 12 },
  signOutText: { fontFamily: Fonts.sansSemiBold, fontSize: 15, color: Theme.textSecondary },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: Theme.background, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, maxHeight: '85%' },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 },
  modalTitle: { fontFamily: Fonts.serifMedium, fontSize: 22, color: Theme.textPrimary },
});
