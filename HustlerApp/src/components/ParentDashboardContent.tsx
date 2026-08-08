import { View, StyleSheet, TouchableOpacity, ScrollView, Modal, Switch, Linking, ActivityIndicator } from 'react-native';
import { TextInput } from '@/components/TextInput';
import { Text } from '@/components/Text';
import { Icon } from '@/components/icons/Icon';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useState, useCallback, useEffect, useRef } from 'react';
import { Audio } from 'expo-av';
import { Theme, Fonts, CategoryTheme } from '@/constants/theme';
import { supabase } from '../lib/supabase';
import { showAlert, showConfirm } from '../lib/ui';
import { getLinkedChildren, unlink, redeemCode, LinkedPerson } from '../lib/parentLink';
import { getClubHours } from '../lib/club';
import { getActiveChildId, setActiveChildId } from '../lib/parentSelection';
import { getGroupLessonRoster } from '../lib/playerClub';
import { colorForLessonType, LESSON_DOT_COLOR } from '../lib/colors';
import { RosterPlayer } from '../lib/lessons';
import { DAY_NAMES, formatTime12h, formatDateLong, firstName } from '../lib/scheduling';
import { getAttendanceForDate, setAttendance, statusFor, nextOccurrenceDate, AttendanceStatus } from '../lib/attendance';
import { NotificationBell } from '@/components/NotificationBell';
import {
  getChildClubs, getChildProgress, getSharedJournalEntries, getUpcomingTournaments, createTournamentBlock,
  getChildLessons, getChildGroupLessons, getChildPayments, submitPaymentReport,
  getClubCoaches, getCoachBusyWindows, isSlotOpen, submitScheduleRequest, getMyScheduleRequests,
  getClubCourtAvailability, isAnyCourtOpen, ClubCourtAvailability,
  getChildAssignments, joinWaitlist, getMyWaitlistEntries, leaveWaitlist,
  getAllTournaments, getChildTournamentMatches, getChildOpponentMatches,
  getMatchFeedbackMessages, sendParentMatchReply, appendParentNotesToLog,
  ChildClub, RecentLog, SharedJournalEntry, UpcomingTournament, ChildLesson, ChildGroupLesson,
  ChildPayment, ClubCoach, ScheduleRequestRow, ChildAssignment, MyWaitlistEntry, TournamentMatchLog, MatchFeedbackMessage,
} from '../lib/parentDashboard';
import { notifyPlayerMessage } from '../lib/notifications';
import { MessageBubble } from '@/components/MessageBubble';
import { localDateStr } from '@/components/JournalSheet';
import { createManagedChild, switchIntoManagedChild } from '../lib/managedAccounts';
import { SwitchBackBanner } from '@/components/SwitchBackBanner';
import { MiniDatePicker, MiniDateRangePicker } from '@/components/MiniDatePicker';
import { maybeRemindUpcoming } from '../lib/lessonReminders';
import {
  getPlayerMakeupCredits, getMakeupSuggestions, requestMakeupSlot, confirmProposedMakeupSlot, declineProposedMakeupSlot,
  MakeupCredit, MakeupSuggestion,
} from '../lib/makeup';
import { getStrengthWeaknessSummary, TagCount } from '../lib/strengthWeaknessSummary';
import {
  getChildSessionLogs, computePersonalBests, computeActivityBuckets, computeCategoryCounts, computeTotalSessions,
  ACTIVITY_RANGES, SessionLogRow,
} from '../lib/childActivity';

export type ParentSection = 'home' | 'schedule' | 'tournaments' | 'journal' | 'profile';

const SECTION_TITLES: Record<ParentSection, string> = {
  home: 'Home', schedule: 'Calendar', tournaments: 'Matches', journal: 'Journal', profile: 'Profile',
};

const CATEGORY_ICONS: Record<string, string> = {
  strength: 'dumbbell', footwork: 'footprints', endurance: 'lightning-bolt', recovery: 'heart-pulse',
};

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const CAL_DAY_HEADERS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const sourceBreakdown = (t: TagCount) => {
  const parts: string[] = [];
  if (t.bySource.player > 0) parts.push(`${t.bySource.player} them`);
  if (t.bySource.parent > 0) parts.push(`${t.bySource.parent} you`);
  if (t.bySource.coach > 0) parts.push(`${t.bySource.coach} coach`);
  return parts.join(' · ');
};

// 8am-8pm fallback candidate slots, used until a club sets its own hours
// (see clubHours state + the HOURS computed from it inside the component).
const DEFAULT_HOURS = Array.from({ length: 13 }, (_, i) => 8 + i);
const METHODS: { key: 'cash' | 'card' | 'e_transfer' | 'other'; label: string }[] = [
  { key: 'cash', label: 'Cash' }, { key: 'card', label: 'Card' }, { key: 'e_transfer', label: 'E-transfer' }, { key: 'other', label: 'Other' },
];

type ActivityItem = { id: string; icon: string; color: { bg: string; fg: string }; title: string; subtitle: string; date: string };
type MatchRow = { id: string; opponent_id: string; opponent_name: string | null; result: 'win' | 'loss' | 'unsure' | null; match_type: 'singles' | 'doubles' | null; created_at: string; tournament_block_id: string | null };

// Shared implementation behind all 4 parent tabs ((parent-tabs)/home|schedule|
// tournaments|journal.tsx) — the child/club switcher and link-a-child flow
// are global to the parent, not per-section, so they render on every tab;
// only the section-specific content below them changes. Each tab screen is a
// thin wrapper passing a fixed `section` — see (parent-tabs)/_layout.tsx.
export function ParentDashboardContent({ section }: { section: ParentSection }) {
  const [myId, setMyId] = useState<string | null>(null);
  const [myName, setMyName] = useState('');
  const [myEmail, setMyEmail] = useState('');
  const [children, setChildren] = useState<LinkedPerson[]>([]);
  const [selectedChildId, setSelectedChildId] = useState<string | null>(null);
  const [childClubs, setChildClubs] = useState<ChildClub[]>([]);
  const [selectedClubId, setSelectedClubId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Link-a-child
  const [codeInput, setCodeInput] = useState('');
  const [redeeming, setRedeeming] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [addChildMode, setAddChildMode] = useState<'code' | 'managed'>('code');
  const [managedNameInput, setManagedNameInput] = useState('');
  const [managedAgeInput, setManagedAgeInput] = useState('');
  const [creatingManaged, setCreatingManaged] = useState(false);
  const [switchingChildId, setSwitchingChildId] = useState<string | null>(null);

  // Home / activity
  const [recentLogs, setRecentLogs] = useState<RecentLog[]>([]);
  const [journalEntries, setJournalEntries] = useState<SharedJournalEntry[]>([]);
  const [expandedJournalIds, setExpandedJournalIds] = useState<Record<string, boolean>>({});
  const [collapsedJournalWeeks, setCollapsedJournalWeeks] = useState<Record<string, boolean>>({});
  const [tournaments, setTournaments] = useState<UpcomingTournament[]>([]);
  const [assignments, setAssignments] = useState<ChildAssignment[]>([]);
  const [strengths, setStrengths] = useState<TagCount[]>([]);
  const [weaknesses, setWeaknesses] = useState<TagCount[]>([]);
  const [sessionLogs, setSessionLogs] = useState<SessionLogRow[]>([]);
  const [progressExpanded, setProgressExpanded] = useState(false);
  const [progressTab, setProgressTab] = useState<'bests' | 'activity'>('bests');
  const [activityRange, setActivityRange] = useState('8w');

  // Schedule
  const [scheduleTab, setScheduleTab] = useState<'classes' | 'request'>('classes');
  const [requestSubTab, setRequestSubTab] = useState<'makeup' | 'book'>('makeup');

  // A tap on the "Makeup time needs a response" notification/home banner
  // lands here with ?tab=makeup — jump straight to the Request > Makeup
  // Credits view instead of the default Classes tab.
  const params = useLocalSearchParams<{ tab?: string }>();
  useEffect(() => {
    if (section === 'schedule' && params.tab === 'makeup') {
      setScheduleTab('request');
      setRequestSubTab('makeup');
    }
  }, [section, params.tab]);
  const [privateLessons, setPrivateLessons] = useState<ChildLesson[]>([]);
  const [groupLessons, setGroupLessons] = useState<ChildGroupLesson[]>([]);
  const [rosterLesson, setRosterLesson] = useState<ChildGroupLesson | null>(null);
  const [roster, setRoster] = useState<RosterPlayer[]>([]);
  const [rosterAttendance, setRosterAttendance] = useState<Record<string, AttendanceStatus>>({});
  const [selectedPrivateLesson, setSelectedPrivateLesson] = useState<ChildLesson | null>(null);
  const today = new Date();
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const [selectedCalDate, setSelectedCalDate] = useState<string | null>(null);
  const [clubCoaches, setClubCoaches] = useState<ClubCoach[]>([]);
  const [myRequests, setMyRequests] = useState<ScheduleRequestRow[]>([]);
  const [reqCoachId, setReqCoachId] = useState<string | null>(null);
  const [reqDay, setReqDay] = useState(1);
  const [busySlots, setBusySlots] = useState<{ start: string; end: string }[]>([]);
  const [courtAvailability, setCourtAvailability] = useState<ClubCourtAvailability>({ courtIds: [], busyByCourtId: {} });
  // Bounds the "Book a Lesson" hour grid below — falls back to the
  // long-standing 8am-8pm default until a club sets its own hours.
  const [clubHours, setClubHours] = useState<{ openTime: string | null; closeTime: string | null }>({ openTime: null, closeTime: null });
  const [submittingSlot, setSubmittingSlot] = useState<string | null>(null);
  const [privateAtt, setPrivateAtt] = useState<Record<string, AttendanceStatus>>({});
  const [groupAtt, setGroupAtt] = useState<Record<string, AttendanceStatus>>({});
  const [makeupCredits, setMakeupCredits] = useState<MakeupCredit[]>([]);
  const [makeupAtt, setMakeupAtt] = useState<Record<string, AttendanceStatus>>({});
  const [myWaitlist, setMyWaitlist] = useState<MyWaitlistEntry[]>([]);
  const [joiningWaitlist, setJoiningWaitlist] = useState(false);
  const [waitlistNoteModal, setWaitlistNoteModal] = useState(false);
  const [waitlistNote, setWaitlistNote] = useState('');
  const [makeupSlotCredit, setMakeupSlotCredit] = useState<MakeupCredit | null>(null);
  const [makeupSuggestions, setMakeupSuggestions] = useState<MakeupSuggestion[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [requestingMakeupSlot, setRequestingMakeupSlot] = useState<string | null>(null);

  // Tournaments
  const [showTournamentModal, setShowTournamentModal] = useState(false);
  const [tournamentName, setTournamentName] = useState('');
  const [tournamentStart, setTournamentStart] = useState<string | null>(null);
  const [tournamentEnd, setTournamentEnd] = useState<string | null>(null);
  // Optional, mirrors the same two fields a player can set on their own
  // personal calendar 'tournament' events (see (tabs)/calendar.tsx) —
  // exact date rather than a relative "N days before" since a registration
  // deadline is always an exact date the organizer posts.
  const [tournamentDeadline, setTournamentDeadline] = useState<string | null>(null);
  const [tournamentLink, setTournamentLink] = useState('');
  const [showRegistrationDetails, setShowRegistrationDetails] = useState(false);
  const [savingTournament, setSavingTournament] = useState(false);
  // Inline tap-to-select on the Calendar tab's own month grid (rather than
  // the separate MiniDatePicker popup, which the Tournaments tab still uses)
  // — first tap sets the start day, second sets the end day.
  const [markingTournament, setMarkingTournament] = useState(false);
  const [allTournaments, setAllTournaments] = useState<UpcomingTournament[]>([]);
  const [tournamentSearch, setTournamentSearch] = useState('');
  const [childMatches, setChildMatches] = useState<MatchRow[]>([]);
  const [selectedOpponent, setSelectedOpponent] = useState<{ id: string; name: string } | null>(null);
  const [opponentMatches, setOpponentMatches] = useState<TournamentMatchLog[]>([]);
  const [loadingOpponentMatches, setLoadingOpponentMatches] = useState(false);
  const [playingVoiceId, setPlayingVoiceId] = useState<string | null>(null);
  const voiceSoundRef = useRef<Audio.Sound | null>(null);
  const [selectedTournament, setSelectedTournament] = useState<UpcomingTournament | null>(null);
  const [tournamentMatches, setTournamentMatches] = useState<TournamentMatchLog[]>([]);
  const [loadingTournamentMatches, setLoadingTournamentMatches] = useState(false);

  // Coach feedback thread on a match log — parent can view and reply,
  // mirrored from the player's own opponent-detail.tsx chat.
  const [matchFeedback, setMatchFeedback] = useState<Record<string, MatchFeedbackMessage[]>>({});
  const [expandedFeedback, setExpandedFeedback] = useState<Record<string, boolean>>({});
  const [feedbackInputs, setFeedbackInputs] = useState<Record<string, string>>({});
  const [sendingFeedback, setSendingFeedback] = useState<Record<string, boolean>>({});

  // A parent's own courtside notes added directly onto their child's match
  // log (see appendParentNotesToLog) — editable right from the match card,
  // no separate "log a match" flow needed.
  const [notesEditingId, setNotesEditingId] = useState<string | null>(null);
  const [notesStrengthsDraft, setNotesStrengthsDraft] = useState('');
  const [notesWeaknessesDraft, setNotesWeaknessesDraft] = useState('');
  const [savingNotes, setSavingNotes] = useState(false);

  // Payments
  const [payments, setPayments] = useState<ChildPayment[]>([]);
  const [showPayModal, setShowPayModal] = useState(false);
  const [paymentNote, setPaymentNote] = useState('');
  const [payMethod, setPayMethod] = useState<'cash' | 'card' | 'e_transfer' | 'other'>('cash');
  const [savingPayment, setSavingPayment] = useState(false);

  const loadChildren = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) { router.replace('/login' as any); return; }
    setMyId(session.user.id);
    setMyEmail(session.user.email ?? '');
    const [{ data: myProfile }, kids] = await Promise.all([
      supabase.from('profiles').select('full_name').eq('id', session.user.id).maybeSingle(),
      getLinkedChildren(session.user.id),
    ]);
    setMyName(myProfile?.full_name ?? '');
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
    const [prog, journal, tourneys, asgs, allTourneys, summary, logs, matchRows] = await Promise.all([
      getChildProgress(selectedChildId),
      getSharedJournalEntries(selectedChildId),
      getUpcomingTournaments(selectedChildId),
      getChildAssignments(selectedChildId),
      getAllTournaments(selectedChildId),
      getStrengthWeaknessSummary(selectedChildId),
      getChildSessionLogs(selectedChildId),
      supabase.from('opponent_logs').select('id, opponent_id, opponent_name, result, match_type, created_at, tournament_block_id').eq('player_id', selectedChildId).order('created_at', { ascending: false }),
    ]);
    setRecentLogs(prog.recentLogs);
    setJournalEntries(journal);
    setTournaments(tourneys);
    setAssignments(asgs);
    setAllTournaments(allTourneys);
    setChildMatches((matchRows.data ?? []) as MatchRow[]);
    setStrengths(summary.strengths);
    setWeaknesses(summary.weaknesses);
    setSessionLogs(logs);

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
      const credits = await getPlayerMakeupCredits(selectedChildId);
      setMakeupCredits(credits);
      const scheduled = credits.filter((m) => m.status === 'scheduled' && m.scheduledDate);
      const attEntries = await Promise.all(scheduled.map(async (m) => {
        const map = await getAttendanceForDate({
          scheduleAssignmentId: m.scheduleAssignmentId ?? undefined,
          groupTierId: m.groupTierId ?? undefined,
          lessonDate: m.scheduledDate!,
        });
        return [`${m.kind}_${m.id}`, statusFor(map, selectedChildId)] as const;
      }));
      setMakeupAtt(Object.fromEntries(attEntries));

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
    if (!selectedClubId || !reqCoachId) { setBusySlots([]); setCourtAvailability({ courtIds: [], busyByCourtId: {} }); return; }
    const [busy, courts] = await Promise.all([
      getCoachBusyWindows(selectedClubId, reqCoachId, reqDay),
      getClubCourtAvailability(selectedClubId, reqDay),
    ]);
    setBusySlots(busy);
    setCourtAvailability(courts);
  }, [selectedClubId, reqCoachId, reqDay]);

  useFocusEffect(useCallback(() => { loadBusySlots(); }, [loadBusySlots]));

  const loadClubHours = useCallback(async () => {
    if (!selectedClubId) { setClubHours({ openTime: null, closeTime: null }); return; }
    setClubHours(await getClubHours(selectedClubId));
  }, [selectedClubId]);

  useFocusEffect(useCallback(() => { loadClubHours(); }, [loadClubHours]));

  const loadWaitlist = useCallback(async () => {
    if (!selectedChildId) { setMyWaitlist([]); return; }
    setMyWaitlist(await getMyWaitlistEntries(selectedChildId));
  }, [selectedChildId]);

  useFocusEffect(useCallback(() => { loadWaitlist(); }, [loadWaitlist]));

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
    if (att.attending) showConfirm('Mark not attending?', `Confirm your child won't be at this lesson on ${formatDateLong(date)}.`, apply);
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
      const newStatus: AttendanceStatus = { attending: nextVal, coachOverride: false, toggledBy: 'parent', exists: true };
      setGroupAtt((prev) => ({ ...prev, [g.id]: newStatus }));
      setRosterAttendance((prev) => ({ ...prev, [selectedChildId]: newStatus }));
    };
    if (att.attending) showConfirm('Mark not attending?', `Confirm your child won't be at ${g.name} on ${formatDateLong(date)}.`, apply);
    else apply();
  };

  // Reuses the same attendance table + toggle_attendance() RPC as a regular
  // lesson, just keyed by the makeup's own one-off scheduledDate instead of
  // a recurring day — marking not-attending sends this specific credit back
  // to 'owed' (see 20260803230000_makeup_attendance_toggle.sql) so it shows
  // up needing a new slot rather than leaving a stale "confirmed" entry.
  const toggleMakeupAttendance = (m: MakeupCredit) => {
    if (!selectedChildId || !m.scheduledDate) return;
    const key = `${m.kind}_${m.id}`;
    const att = statusFor(makeupAtt, key);
    if (att.coachOverride) { showAlert('Locked', "This makeup's attendance was set by the coach — contact them to change it."); return; }
    const nextVal = !att.attending;
    const apply = async () => {
      const res = await setAttendance({
        scheduleAssignmentId: m.scheduleAssignmentId ?? undefined,
        groupTierId: m.groupTierId ?? undefined,
        playerId: selectedChildId, lessonDate: m.scheduledDate!, attending: nextVal, actorRole: 'parent',
      });
      if (!res.ok) { showAlert('Could not update attendance', res.message || ''); return; }
      setMakeupAtt((prev) => ({ ...prev, [key]: { attending: nextVal, coachOverride: false, toggledBy: 'parent', exists: true } }));
      if (!nextVal) loadSectionData();
    };
    if (att.attending) showConfirm('Mark not attending?', `Confirm your child won't be at this makeup on ${formatDateLong(m.scheduledDate!)}.`, apply);
    else apply();
  };

  const submitTournament = async () => {
    if (!selectedChildId || !tournamentStart || !tournamentEnd) { showAlert('Missing dates', 'Pick a start and end date.'); return; }
    if (!tournamentName.trim()) { showAlert('Missing name', 'Give the tournament a name.'); return; }
    if (tournamentEnd < tournamentStart) { showAlert('Invalid range', 'End date must be after the start date.'); return; }
    if (tournamentDeadline && tournamentDeadline >= tournamentStart) { showAlert('Invalid deadline', 'Registration deadline must be before the tournament starts.'); return; }
    setSavingTournament(true);
    const res = await createTournamentBlock(selectedChildId, tournamentName.trim(), tournamentStart, tournamentEnd, tournamentDeadline, tournamentLink);
    setSavingTournament(false);
    if (!res.ok) { showAlert('Error', res.message || 'Could not save the tournament dates.'); return; }
    setShowTournamentModal(false);
    setMarkingTournament(false);
    setTournamentName('');
    setTournamentStart(null);
    setTournamentEnd(null);
    setTournamentDeadline(null);
    setTournamentLink('');
    setShowRegistrationDetails(false);
    showAlert('Marked', "Your child is excluded from group lessons that week, and any private-lesson makeup credits were created automatically.");
    loadSectionData();
  };

  const openTournamentDetail = async (t: UpcomingTournament) => {
    if (!selectedChildId) return;
    setSelectedTournament(t);
    setTournamentMatches([]);
    setLoadingTournamentMatches(true);
    const matches = await getChildTournamentMatches(selectedChildId, t.id);
    setTournamentMatches(matches);
    setLoadingTournamentMatches(false);
    setMatchFeedback(await getMatchFeedbackMessages(matches.map((m) => m.id)));
  };

  const tournamentNameById = new Map(allTournaments.map((t) => [t.id, t.name]));

  // One card per opponent — same grouping the player's own Matches screen
  // uses, so a parent sees the exact same "by opponent" view of their
  // child's matches, just read-only from a different account. The search
  // box doubles as a tournament search too — searching "Nationals" surfaces
  // every opponent played during that tournament, rather than needing a
  // separate tournament-list view to get there (full tournament detail —
  // registration link, deadline — is still one tap away from the Calendar).
  const filteredMatches = childMatches.filter((m) => {
    const q = tournamentSearch.trim().toLowerCase();
    if (!q) return true;
    if ((m.opponent_name ?? '').toLowerCase().includes(q)) return true;
    const tourneyName = m.tournament_block_id ? tournamentNameById.get(m.tournament_block_id) : null;
    return !!tourneyName && tourneyName.toLowerCase().includes(q);
  });
  const groupedMatches = (() => {
    const map = new Map<string, { key: string; opponent_id: string; opponent_name: string | null; latestResult: MatchRow['result']; latestType: MatchRow['match_type']; count: number }>();
    filteredMatches.forEach((m) => {
      const key = m.opponent_id ?? m.opponent_name ?? m.id;
      const existing = map.get(key);
      if (existing) existing.count += 1;
      else map.set(key, { key, opponent_id: m.opponent_id, opponent_name: m.opponent_name, latestResult: m.result, latestType: m.match_type, count: 1 });
    });
    return Array.from(map.values());
  })();
  const openMatch = async (m: { opponent_id: string; opponent_name: string | null }) => {
    if (!selectedChildId) return;
    setSelectedOpponent({ id: m.opponent_id, name: m.opponent_name ?? 'Opponent' });
    setOpponentMatches([]);
    setLoadingOpponentMatches(true);
    const matches = await getChildOpponentMatches(selectedChildId, m.opponent_id);
    setOpponentMatches(matches);
    setLoadingOpponentMatches(false);
    const feedback = await getMatchFeedbackMessages(matches.map((mm) => mm.id));
    setMatchFeedback((prev) => ({ ...prev, ...feedback }));
  };

  // formatDateLong expects a plain "YYYY-MM-DD" (it appends T00:00:00
  // itself) — a match log's createdAt is a full timestamp, so it needs its
  // own formatter rather than reusing that helper (which produced "Invalid
  // Date" here).
  const formatLogDate = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

  // Sunday-start week bucket for grouping the journal list — matches this
  // codebase's existing Sunday-first day-of-week convention (DAY_NAMES,
  // schedule_assignments.day_of_week). Entries are already sorted newest
  // first, so a header only needs to print when the bucket label changes.
  const weekStartOf = (dateStr: string) => {
    const d = new Date(`${dateStr}T00:00:00`);
    d.setDate(d.getDate() - d.getDay());
    return d;
  };
  const journalWeekLabel = (entryDate: string) => {
    const weekStart = weekStartOf(entryDate);
    const todayWeekStart = weekStartOf(localDateStr());
    const diffWeeks = Math.round((todayWeekStart.getTime() - weekStart.getTime()) / (7 * 24 * 60 * 60 * 1000));
    if (diffWeeks === 0) return 'This Week';
    if (diffWeeks === 1) return 'Last Week';
    return `Week of ${weekStart.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`;
  };
  // journalEntries is already sorted newest-first, so a Map preserves that
  // order and each week's entries land in one contiguous group.
  const journalWeekGroups = (entries: SharedJournalEntry[], labelFor: (d: string) => string) => {
    const map = new Map<string, SharedJournalEntry[]>();
    entries.forEach((j) => {
      const label = labelFor(j.entry_date);
      if (!map.has(label)) map.set(label, []);
      map.get(label)!.push(j);
    });
    return Array.from(map.entries()).map(([label, entries]) => ({ label, entries }));
  };

  const playVoiceNote = async (m: TournamentMatchLog) => {
    if (!m.voiceNoteUrl) return;
    if (voiceSoundRef.current) {
      await voiceSoundRef.current.stopAsync();
      await voiceSoundRef.current.unloadAsync();
      voiceSoundRef.current = null;
    }
    if (playingVoiceId === m.id) { setPlayingVoiceId(null); return; }
    const { sound } = await Audio.Sound.createAsync({ uri: m.voiceNoteUrl }, { shouldPlay: true });
    voiceSoundRef.current = sound;
    setPlayingVoiceId(m.id);
    sound.setOnPlaybackStatusUpdate((status) => {
      if (status.isLoaded && status.didJustFinish) setPlayingVoiceId(null);
    });
  };

  const openNotesEditor = (m: TournamentMatchLog) => {
    setNotesEditingId(m.id);
    setNotesStrengthsDraft(m.parentStrengthsText ?? '');
    setNotesWeaknessesDraft(m.parentWeaknessesText ?? '');
  };

  const saveNotes = async (m: TournamentMatchLog) => {
    if (!selectedChildId) return;
    setSavingNotes(true);
    const res = await appendParentNotesToLog({
      logId: m.id, childId: selectedChildId, opponentName: m.opponentName,
      strengthsText: notesStrengthsDraft, weaknessesText: notesWeaknessesDraft,
      previouslySharedWithCoachIds: m.sharedWithCoachIds, sharedWithCoachIds: m.sharedWithCoachIds,
    });
    setSavingNotes(false);
    if (!res.ok) { showAlert('Error', res.message || 'Could not save your notes.'); return; }
    const patch = (list: TournamentMatchLog[]) => list.map((x) =>
      x.id === m.id ? { ...x, parentStrengthsText: notesStrengthsDraft.trim() || null, parentWeaknessesText: notesWeaknessesDraft.trim() || null } : x
    );
    setTournamentMatches(patch);
    setOpponentMatches(patch);
    setNotesEditingId(null);
  };

  const toggleFeedbackThread = (logId: string) => setExpandedFeedback((prev) => ({ ...prev, [logId]: !prev[logId] }));

  const sendFeedbackReply = async (m: TournamentMatchLog) => {
    const msg = (feedbackInputs[m.id] ?? '').trim();
    if (!msg || !myId) return;
    setSendingFeedback((prev) => ({ ...prev, [m.id]: true }));
    const sent = await sendParentMatchReply(m.id, myId, msg);
    setSendingFeedback((prev) => ({ ...prev, [m.id]: false }));
    if (!sent) { showAlert('Error', 'Could not send your message. Please try again.'); return; }
    setFeedbackInputs((prev) => ({ ...prev, [m.id]: '' }));
    setMatchFeedback((prev) => ({ ...prev, [m.id]: [...(prev[m.id] ?? []), sent] }));
    for (const coachId of m.sharedWithCoachIds) { await notifyPlayerMessage(coachId, myName || 'A parent', msg); }
  };

  // Shared between the tournament-detail and opponent-detail modals — full
  // parity with what a coach sees for a shared log (coach-player.tsx):
  // score, tags as colored chips (not just a comma-joined line), free text,
  // next-time notes, video link, voice note playback. `showOpponentName`
  // is on for the tournament modal (several different opponents in one
  // list) and off for the opponent modal (already the modal's title).
  const renderMatchLog = (m: TournamentMatchLog, showOpponentName: boolean) => (
    <View key={m.id} style={styles.matchLogCard}>
      <View style={styles.matchLogTopRow}>
        <View style={{ flex: 1 }}>
          <View style={styles.matchCardNameRow}>
            {showOpponentName && <Text style={styles.rowLineTitle}>vs {m.opponentName}</Text>}
            {m.matchType && (
              <View style={[styles.matchTypeTag, m.matchType === 'singles' ? styles.matchTypeTagSingles : styles.matchTypeTagDoubles]}>
                <Text style={[styles.matchTypeTagText, m.matchType === 'singles' ? styles.matchTypeTagTextSingles : styles.matchTypeTagTextDoubles]}>
                  {m.matchType === 'singles' ? 'Singles' : 'Doubles'}
                </Text>
              </View>
            )}
          </View>
          <Text style={styles.matchLogDate}>{formatLogDate(m.createdAt)}</Text>
        </View>
        {m.result && m.result !== 'unsure' && (
          <View style={[styles.matchResultDot, m.result === 'win' ? styles.matchResultDotWon : styles.matchResultDotLost]} />
        )}
      </View>

      {m.score && <Text style={styles.matchLogScore}>{m.score}</Text>}

      {(m.strengthsTags.length > 0 || m.strengthsText) && (
        <View style={styles.matchLogSection}>
          <Text style={styles.matchLogSectionLabel}>STRENGTHS</Text>
          {m.strengthsTags.length > 0 && (
            <View style={styles.matchChipRow}>
              {m.strengthsTags.map((t) => (
                <View key={`s-${t}`} style={[styles.matchChip, styles.matchChipStrength]}><Text style={[styles.matchChipText, styles.matchChipStrengthText]}>{t}</Text></View>
              ))}
            </View>
          )}
          {m.strengthsText && <Text style={styles.matchLogText}>{m.strengthsText}</Text>}
        </View>
      )}

      {(m.weaknessesTags.length > 0 || m.weaknessesText) && (
        <View style={styles.matchLogSection}>
          <Text style={styles.matchLogSectionLabel}>WEAKNESSES</Text>
          {m.weaknessesTags.length > 0 && (
            <View style={styles.matchChipRow}>
              {m.weaknessesTags.map((t) => (
                <View key={`w-${t}`} style={[styles.matchChip, styles.matchChipWeakness]}><Text style={[styles.matchChipText, styles.matchChipWeaknessText]}>{t}</Text></View>
              ))}
            </View>
          )}
          {m.weaknessesText && <Text style={styles.matchLogText}>{m.weaknessesText}</Text>}
        </View>
      )}

      {!m.loggedByParent && notesEditingId !== m.id && (
        <View style={styles.matchLogSection}>
          <View style={styles.matchCardNameRow}>
            <Text style={[styles.matchLogSectionLabel, { flex: 1 }]}>PARENT'S NOTES</Text>
            <TouchableOpacity onPress={() => openNotesEditor(m)}>
              <Text style={styles.notesEditLink}>{(m.parentStrengthsText || m.parentWeaknessesText) ? 'Edit' : '+ Add your notes'}</Text>
            </TouchableOpacity>
          </View>
          {m.parentStrengthsText && <Text style={styles.matchLogText}>Strengths: {m.parentStrengthsText}</Text>}
          {m.parentWeaknessesText && <Text style={styles.matchLogText}>Weaknesses: {m.parentWeaknessesText}</Text>}
        </View>
      )}

      {notesEditingId === m.id && (
        <View style={styles.matchLogSection}>
          <Text style={styles.matchLogSectionLabel}>PARENT'S NOTES</Text>
          <Text style={styles.notesFieldLabel}>What they did well</Text>
          <TextInput
            style={styles.notesInput}
            placeholder="e.g. Aggressive at the net, good court coverage..."
            placeholderTextColor={Theme.textSecondary}
            value={notesStrengthsDraft}
            onChangeText={setNotesStrengthsDraft}
            multiline
          />
          <Text style={styles.notesFieldLabel}>What to work on</Text>
          <TextInput
            style={styles.notesInput}
            placeholder="e.g. Kept hitting long on the backhand side..."
            placeholderTextColor={Theme.textSecondary}
            value={notesWeaknessesDraft}
            onChangeText={setNotesWeaknessesDraft}
            multiline
          />
          <View style={styles.notesEditorButtons}>
            <TouchableOpacity style={styles.notesCancelBtn} onPress={() => setNotesEditingId(null)}>
              <Text style={styles.notesCancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.notesSaveBtn, savingNotes && styles.feedbackSendBtnDisabled]}
              onPress={() => saveNotes(m)}
              disabled={savingNotes}
            >
              {savingNotes ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.notesSaveText}>Save</Text>}
            </TouchableOpacity>
          </View>
        </View>
      )}

      {m.nextTimeText && (
        <View style={styles.matchLogSection}>
          <Text style={styles.matchLogSectionLabel}>NEXT TIME</Text>
          <Text style={styles.matchLogText}>{m.nextTimeText}</Text>
        </View>
      )}

      {m.videoUrl && (
        <TouchableOpacity style={styles.matchVideoLinkRow} onPress={() => Linking.openURL(m.videoUrl!)}>
          <Icon name="link-variant" size={22} color={Theme.eyebrowGreen} />
          <Text style={styles.matchVideoLinkText}>Watch match video</Text>
        </TouchableOpacity>
      )}
      {m.voiceNoteUrl && (
        <TouchableOpacity style={styles.matchVideoLinkRow} onPress={() => playVoiceNote(m)}>
          <Icon name={playingVoiceId === m.id ? 'pause-circle' : 'play-circle'} size={24} color={Theme.eyebrowGreen} />
          <Text style={styles.matchVideoLinkText}>Voice note{m.voiceNoteDurationSeconds ? ` · ${m.voiceNoteDurationSeconds}s` : ''}</Text>
        </TouchableOpacity>
      )}

      <Text style={styles.matchLoggedBy}>{m.loggedByParent ? 'Logged by you' : "Logged by your child"}</Text>

      {m.sharedWithCoachIds.length > 0 && (
      <>
      <TouchableOpacity style={styles.feedbackToggle} onPress={() => toggleFeedbackThread(m.id)}>
        <Icon name="message-outline" size={15} color={Theme.eyebrowGreen} />
        <Text style={styles.feedbackToggleText}>
          {(matchFeedback[m.id]?.length ?? 0) > 0 ? `Coach feedback (${matchFeedback[m.id].length})` : 'No coach feedback yet'}
        </Text>
        <Icon name={expandedFeedback[m.id] ? 'chevron-up' : 'chevron-down'} size={16} color={Theme.textSecondary} />
      </TouchableOpacity>
      {expandedFeedback[m.id] && (
        <>
          {(matchFeedback[m.id]?.length ?? 0) > 0 && (
            <View style={styles.feedbackThread}>
              {matchFeedback[m.id].map((msg) => (
                <MessageBubble
                  key={msg.id}
                  isMine={msg.senderId === myId}
                  message={msg.message}
                  mediaUrl={msg.mediaUrl}
                  mediaType={msg.mediaType}
                  mediaDurationSeconds={msg.mediaDurationSeconds}
                  timeLabel={new Date(msg.createdAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                  deletable={false}
                />
              ))}
            </View>
          )}
          <View style={styles.feedbackInputRow}>
            <TextInput
              style={styles.feedbackInput}
              placeholder="Reply to the coach..."
              placeholderTextColor={Theme.textSecondary}
              value={feedbackInputs[m.id] ?? ''}
              onChangeText={(t) => setFeedbackInputs((prev) => ({ ...prev, [m.id]: t }))}
              multiline
            />
            <TouchableOpacity
              style={[styles.feedbackSendBtn, (!feedbackInputs[m.id]?.trim() || sendingFeedback[m.id]) && styles.feedbackSendBtnDisabled]}
              onPress={() => sendFeedbackReply(m)}
              disabled={!feedbackInputs[m.id]?.trim() || sendingFeedback[m.id]}
            >
              <Icon name="send" size={16} color="#fff" />
            </TouchableOpacity>
          </View>
        </>
      )}
      </>
      )}
    </View>
  );

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

  const submitManagedChild = async () => {
    const name = managedNameInput.trim();
    if (!name) { showAlert('Name needed', "Enter your child's name."); return; }
    setCreatingManaged(true);
    const age = managedAgeInput.trim() ? parseInt(managedAgeInput.trim(), 10) : undefined;
    const result = await createManagedChild(name, Number.isFinite(age) ? age : undefined);
    setCreatingManaged(false);
    if (!result.ok) { showAlert('Could not create profile', result.message ?? 'Please try again.'); return; }
    setManagedNameInput('');
    setManagedAgeInput('');
    setShowAddForm(false);
    showAlert('Profile created', `${name}'s profile is ready — switch to it any time from the chips above.`);
    loadChildren();
  };

  const handleUseAsChild = (child: LinkedPerson) => {
    showConfirm(
      `Use this phone as ${firstName(child.fullName)}?`,
      "This signs the device into their account so they get the real player app. You'll need to tap \"Back to my account\" there to return to your own.",
      async () => {
        setSwitchingChildId(child.profileId);
        const result = await switchIntoManagedChild(child.profileId);
        setSwitchingChildId(null);
        if (!result.ok) { showAlert('Error', result.message ?? 'Could not switch into that profile.'); return; }
        router.replace('/(tabs)' as any);
      },
    );
  };

  // Shared by the "link your first child" empty state and the "link another
  // child" card — a parent can either link a kid who already has their own
  // account (code exchange, needs their accept), or create a managed
  // profile for a kid without an email yet (no login, full parent control —
  // see createManagedChild).
  const renderAddChildForm = () => (
    <>
      <View style={styles.addChildModeRow}>
        <TouchableOpacity style={[styles.addChildModeTab, addChildMode === 'code' && styles.addChildModeTabActive]} onPress={() => setAddChildMode('code')}>
          <Text style={[styles.addChildModeText, addChildMode === 'code' && styles.addChildModeTextActive]}>By Code</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.addChildModeTab, addChildMode === 'managed' && styles.addChildModeTabActive]} onPress={() => setAddChildMode('managed')}>
          <Text style={[styles.addChildModeText, addChildMode === 'managed' && styles.addChildModeTextActive]}>New Profile</Text>
        </TouchableOpacity>
      </View>
      {addChildMode === 'code' ? (
        <>
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
          <Text style={styles.addChildHint}>They'll need to accept your request.</Text>
          <TouchableOpacity style={[styles.button, redeeming && styles.buttonDisabled]} onPress={submitCode} disabled={redeeming}>
            <Text style={styles.buttonText}>{redeeming ? 'Sending...' : 'Send Link Request'}</Text>
          </TouchableOpacity>
        </>
      ) : (
        <>
          <TextInput
            style={styles.addChildInput}
            value={managedNameInput}
            onChangeText={setManagedNameInput}
            placeholder="Child's full name"
            placeholderTextColor={Theme.textSecondary}
          />
          <TextInput
            style={styles.addChildInput}
            value={managedAgeInput}
            onChangeText={(t) => setManagedAgeInput(t.replace(/[^0-9]/g, ''))}
            placeholder="Age (optional)"
            placeholderTextColor={Theme.textSecondary}
            keyboardType="number-pad"
            maxLength={2}
          />
          <Text style={styles.addChildHint}>No email needed — you're fully in control.</Text>
          <TouchableOpacity style={[styles.button, creatingManaged && styles.buttonDisabled]} onPress={submitManagedChild} disabled={creatingManaged}>
            <Text style={styles.buttonText}>{creatingManaged ? 'Creating...' : 'Create Profile'}</Text>
          </TouchableOpacity>
        </>
      )}
    </>
  );

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
      `Request ${DAY_NAMES[reqDay]} ${formatTime12h(start)}–${formatTime12h(end)} with ${coachName}? The club will need to approve it before it's booked.`,
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

  const isOnWaitlistFor = (coachId: string) => myWaitlist.some((w) => w.coachId === coachId && (w.status === 'waiting' || w.status === 'offered'));

  const joinWaitlistForCoach = async () => {
    if (!selectedChildId || !selectedClubId || !reqCoachId) return;
    setJoiningWaitlist(true);
    const res = await joinWaitlist(selectedClubId, selectedChildId, reqCoachId, waitlistNote);
    setJoiningWaitlist(false);
    if (!res.ok) { showAlert('Error', res.message || 'Could not join the waitlist.'); return; }
    setWaitlistNoteModal(false);
    setWaitlistNote('');
    loadWaitlist();
    showAlert('Added', "Your child is on the waitlist — the club will offer a slot when one opens up.");
  };

  const leaveWaitlistEntry = (entry: MyWaitlistEntry) => {
    showConfirm('Leave this waitlist?', `Leave the waitlist for ${entry.coachName}?`, async () => {
      const res = await leaveWaitlist(entry.id);
      if (!res.ok) { showAlert('Error', 'Could not leave the waitlist.'); return; }
      loadWaitlist();
    });
  };

  const openMakeupSlotPicker = async (credit: MakeupCredit) => {
    setMakeupSlotCredit(credit);
    setMakeupSuggestions([]);
    setLoadingSuggestions(true);
    setMakeupSuggestions(await getMakeupSuggestions(credit.id));
    setLoadingSuggestions(false);
  };

  const selectMakeupSuggestion = async (suggestion: MakeupSuggestion) => {
    if (!makeupSlotCredit || !selectedChildId) return;
    const key = `${suggestion.date}_${suggestion.startTime}`;
    setRequestingMakeupSlot(key);
    const res = await requestMakeupSlot({
      creditId: makeupSlotCredit.id, playerId: selectedChildId, coachId: suggestion.coachId, label: makeupSlotCredit.label,
      date: suggestion.date, startTime: suggestion.startTime, endTime: suggestion.endTime, courtId: suggestion.courtId,
    });
    setRequestingMakeupSlot(null);
    if (!res.ok) { showAlert('Error', res.message || 'Could not request that slot.'); return; }
    setMakeupSlotCredit(null);
    showAlert('Sent to the coach', `The requested time — ${formatDateLong(suggestion.date)} at ${formatTime12h(suggestion.startTime)} with ${suggestion.coachName} — is waiting on approval.`);
    loadSectionData();
  };

  const confirmProposedSlot = (credit: MakeupCredit) => {
    if (!credit.scheduledDate || !credit.scheduledStartTime) return;
    showConfirm('Confirm this time?', `${credit.label} — ${formatDateLong(credit.scheduledDate)} at ${formatTime12h(credit.scheduledStartTime)}.`, async () => {
      const res = await confirmProposedMakeupSlot(credit);
      if (!res.ok) { showAlert('Error', 'Could not confirm this makeup time.'); return; }
      loadSectionData();
    });
  };

  const declineProposedSlot = (credit: MakeupCredit) => {
    showConfirm("Can't make this time?", `The coach will be told, and ${credit.label} goes back to needing a makeup slot.`, async () => {
      const res = await declineProposedMakeupSlot(credit);
      if (!res.ok) { showAlert('Error', 'Could not decline this makeup time.'); return; }
      loadSectionData();
    });
  };

  const openRoster = async (lesson: ChildGroupLesson) => {
    setRosterLesson(lesson);
    const lessonDate = nextOccurrenceDate(lesson.day_of_week);
    const [players, attMap] = await Promise.all([
      getGroupLessonRoster(lesson.groupTierId),
      getAttendanceForDate({ groupTierId: lesson.groupTierId, lessonDate }),
    ]);
    setRoster(players);
    setRosterAttendance(attMap);
  };

  const openPayModal = () => {
    if (!selectedChildId) return;
    setPaymentNote('');
    setPayMethod('cash');
    setShowPayModal(true);
  };

  const submitPayment = async () => {
    if (!myId || !selectedChildId || !selectedClubId || !paymentNote.trim()) { showAlert('Missing info', "Write what this payment is for."); return; }
    setSavingPayment(true);
    const result = await submitPaymentReport({ clubId: selectedClubId, childId: selectedChildId, parentId: myId, note: paymentNote, method: payMethod });
    setSavingPayment(false);
    if (!result.ok) { showAlert('Error', result.message ?? 'Could not submit.'); return; }
    setShowPayModal(false);
    loadSectionData();
  };

  // Player activity only — what the child actually did (trained, journaled),
  // not scheduling/admin items like an upcoming tournament registration
  // (which is also future-dated, so sorted into a "recent" feed it'd just
  // bury real past activity under itself).
  const activityFeed: ActivityItem[] = [
    ...recentLogs.map((l) => ({ id: `log-${l.id}`, icon: 'dumbbell', color: CategoryTheme.strength, title: `Logged a ${l.category} session`, subtitle: '', date: l.created_at })),
    ...journalEntries.map((j) => ({ id: `journal-${j.id}`, icon: 'notebook-outline', color: CategoryTheme.recovery, title: 'Shared a journal entry', subtitle: j.free_text?.slice(0, 60) ?? '', date: j.created_at })),
  ].sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 20);

  const upcomingClasses = [
    ...privateLessons.map((l) => ({
      id: `p-${l.id}`, start: l.start_time, end: l.end_time, type: 'private' as const,
      title: `${DAY_NAMES[l.day_of_week].slice(0, 3)} ${formatTime12h(l.start_time)}–${formatTime12h(l.end_time)}`,
      subtitle: `Private with ${l.coach_name}`, nextDate: nextOccurrenceDate(l.day_of_week),
    })),
    ...groupLessons.map((g) => ({
      id: `g-${g.id}`, start: g.start_time, end: g.end_time, type: 'group' as const,
      title: `${DAY_NAMES[g.day_of_week].slice(0, 3)} ${formatTime12h(g.start_time)}–${formatTime12h(g.end_time)}`,
      subtitle: g.name, nextDate: nextOccurrenceDate(g.day_of_week),
    })),
  ].sort((a, b) => (a.nextDate === b.nextDate ? a.start.localeCompare(b.start) : a.nextDate < b.nextDate ? -1 : 1)).slice(0, 3);

  // Month grid — a calendar date's weekday determines which recurring
  // lessons show as dots on it, same trick (tabs)/calendar.tsx's
  // hasClubLessonOnDate uses: DAY_NAMES/day_of_week is Sunday-first (0-6),
  // exactly matching JS Date.getDay(), so a direct comparison is enough —
  // no separate "which calendar date is this lesson on" bookkeeping needed
  // since these lessons recur every week.
  const getDaysInMonth = (year: number, month: number) => new Date(year, month + 1, 0).getDate();
  const getFirstDayOfMonth = (year: number, month: number) => {
    const d = new Date(year, month, 1).getDay();
    return d === 0 ? 6 : d - 1;
  };
  const prevMonth = () => {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(viewYear - 1); }
    else setViewMonth(viewMonth - 1);
  };
  const nextMonth = () => {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(viewYear + 1); }
    else setViewMonth(viewMonth + 1);
  };
  const privateLessonsForDow = (dow: number) => privateLessons.filter((l) => l.day_of_week === dow);
  const groupLessonsForDow = (dow: number) => groupLessons.filter((g) => g.day_of_week === dow);
  const tournamentForDate = (dateStr: string) => allTournaments.find((t) => dateStr >= t.start_date && dateStr <= t.end_date);
  // Registration always closes strictly before a tournament starts — caps
  // the deadline picker so a parent can't even select the start day itself.
  const dayBefore = (dateStr: string) => {
    const d = new Date(`${dateStr}T00:00:00`);
    d.setDate(d.getDate() - 1);
    return localDateStr(d);
  };

  // While marking, taps on the grid pick the range instead of opening the
  // day-detail popup: 1st tap = start, 2nd tap = end (tapping the same day
  // twice makes a single-day tournament; tapping before the start moves it).
  const handleDayPress = (dateStr: string) => {
    if (markingTournament) {
      if (!tournamentStart || tournamentEnd) { setTournamentStart(dateStr); setTournamentEnd(null); }
      else if (dateStr < tournamentStart) setTournamentStart(dateStr);
      else setTournamentEnd(dateStr);
      return;
    }
    setSelectedCalDate(dateStr);
  };

  const HOURS = clubHours.openTime && clubHours.closeTime
    ? Array.from(
        { length: Math.max(1, parseInt(clubHours.closeTime.slice(0, 2), 10) - parseInt(clubHours.openTime.slice(0, 2), 10)) },
        (_, i) => parseInt(clubHours.openTime!.slice(0, 2), 10) + i,
      )
    : DEFAULT_HOURS;

  const totalSessions = computeTotalSessions(sessionLogs);
  const personalBests = computePersonalBests(sessionLogs);
  const activeRange = ACTIVITY_RANGES.find((r) => r.key === activityRange) ?? ACTIVITY_RANGES[3];
  const activityBuckets = computeActivityBuckets(sessionLogs, activeRange);
  const maxActivity = Math.max(...activityBuckets.map((b) => b.count), 1);
  const categoryCounts = computeCategoryCounts(sessionLogs);
  const maxCategoryCount = Math.max(categoryCounts.strength, categoryCounts.footwork, categoryCounts.endurance, categoryCounts.recovery, 1);

  if (loading) {
    return <View style={styles.container}><Text style={styles.muted}>Loading...</Text></View>;
  }

  return (
    <View style={styles.container}>
      {selectedChild?.managedByParentId && (
        <SwitchBackBanner
          label={switchingChildId === selectedChild.profileId ? 'Switching...' : `Switch to ${firstName(selectedChild.fullName)}`}
          onPress={() => handleUseAsChild(selectedChild)}
        />
      )}
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <View style={{ flex: 1 }}>
            <Text style={styles.eyebrow}>PARENT</Text>
            <Text style={styles.title}>{section === 'home' ? `Hi${myName ? `, ${firstName(myName)}` : ''}` : SECTION_TITLES[section]}</Text>
          </View>
          <NotificationBell />
        </View>

        {children.length === 0 && section !== 'profile' ? (
          <View style={styles.card}>
            <Icon name="account-group" size={40} color={Theme.eyebrowGreen} />
            <Text style={styles.cardTitle}>Link your first child</Text>
            {renderAddChildForm()}
          </View>
        ) : (
          <>
            {/* Child switcher */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, marginBottom: 20 }}>
              {children.map((child) => (
                <TouchableOpacity key={child.linkId} style={[styles.switchChip, selectedChildId === child.profileId && styles.switchChipActive]} onPress={() => selectChild(child.profileId)}>
                  <View style={styles.switchAvatar}>
                    <Text style={{ color: '#FFFFFF', fontFamily: Fonts.sansBold }}>{child.fullName.slice(0, 1).toUpperCase()}</Text>
                  </View>
                  <Text style={[styles.switchChipText, selectedChildId === child.profileId && styles.switchChipTextActive]}>{firstName(child.fullName)}</Text>
                  {selectedChildId === child.profileId && (
                    <TouchableOpacity onPress={() => handleUnlink(child)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                      <Icon name="close-circle-outline" size={16} color={Theme.textSecondary} />
                    </TouchableOpacity>
                  )}
                </TouchableOpacity>
              ))}
              {section === 'home' && (
                <TouchableOpacity style={styles.switchChip} onPress={() => setShowAddForm(true)}>
                  <Icon name="account-plus-outline" size={20} color={Theme.eyebrowGreen} />
                </TouchableOpacity>
              )}
            </ScrollView>

            {section === 'home' && makeupCredits.some((m) => m.status === 'proposed') && (
              <TouchableOpacity
                style={styles.makeupBanner}
                onPress={() => router.push('/(parent-tabs)/schedule?tab=makeup' as any)}
              >
                <Icon name="calendar-edit" size={22} color="#8A6200" />
                <View style={{ flex: 1 }}>
                  <Text style={styles.makeupBannerTitle}>
                    {makeupCredits.filter((m) => m.status === 'proposed').length > 1
                      ? `${makeupCredits.filter((m) => m.status === 'proposed').length} makeup times need your response`
                      : 'A makeup time needs your response'}
                  </Text>
                  <Text style={styles.makeupBannerSub}>Your coach suggested a time — confirm or decline it</Text>
                </View>
                <Icon name="chevron-right" size={20} color="#8A6200" />
              </TouchableOpacity>
            )}

            {showAddForm && (
              <View style={styles.card}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                  <Text style={styles.sectionLabel}>ADD ANOTHER CHILD</Text>
                  <TouchableOpacity onPress={() => { setShowAddForm(false); setCodeInput(''); setManagedNameInput(''); setManagedAgeInput(''); }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Icon name="close-circle-outline" size={22} color="#FF6B6B" />
                  </TouchableOpacity>
                </View>
                {renderAddChildForm()}
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

            {children.length > 0 && !hasAnyClub && (
              <View style={styles.noticeCard}>
                <Icon name="information-outline" size={22} color={Theme.eyebrowGreen} />
                <Text style={styles.noticeText}>{firstName(selectedChild?.fullName)} isn't in a club yet.</Text>
              </View>
            )}

            {section === 'home' && hasAnyClub && (
              <View style={styles.card}>
                <Text style={styles.sectionLabel}>UPCOMING CLASSES</Text>
                {upcomingClasses.length === 0 ? (
                  <Text style={styles.emptyText}>Nothing scheduled.</Text>
                ) : (
                  upcomingClasses.map((c) => {
                    const col = colorForLessonType(c.type);
                    return (
                      <View key={c.id} style={styles.activityRow}>
                        <View style={[styles.iconBadge, { backgroundColor: col.bg }]}>
                          <Icon name="calendar-week" size={18} color={col.fg} />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.rowLineTitle, { fontSize: 17 }]}>{c.title}</Text>
                          <Text style={[styles.rowLineSub, { fontSize: 14 }]}>{c.subtitle}</Text>
                        </View>
                      </View>
                    );
                  })
                )}
                <TouchableOpacity style={styles.reportPaymentLink} onPress={openPayModal}>
                  <Text style={styles.reportPaymentLinkText}>Report a Payment</Text>
                </TouchableOpacity>
              </View>
            )}

            {section === 'home' && hasAnyClub && selectedChild && (
              <>
                <Text style={styles.sectionHeadline}>{firstName(selectedChild.fullName)}'s progress</Text>
                <TouchableOpacity
                  style={[styles.progressCardHeader, progressExpanded && styles.progressCardHeaderExpanded]}
                  onPress={() => setProgressExpanded((v) => !v)}
                  activeOpacity={0.8}
                >
                  <View style={styles.progressHeaderLeft}>
                    <Icon name="chart-line" size={22} color={Theme.eyebrowGreen} />
                    <Text style={styles.progressHeaderTitle}>Overview</Text>
                  </View>
                  <View style={styles.progressHeaderRight}>
                    <Text style={styles.progressHeaderSub}>{totalSessions} sessions total</Text>
                    <Icon name={progressExpanded ? 'chevron-up' : 'chevron-down'} size={20} color={Theme.textSecondary} />
                  </View>
                </TouchableOpacity>

                {progressExpanded && (
                  <View style={styles.progressCardBody}>
                    <View style={styles.progressTabRow}>
                      {([['bests', 'Personal Bests'], ['activity', 'Activity']] as const).map(([key, label]) => (
                        <TouchableOpacity
                          key={key}
                          style={[styles.progressTab, progressTab === key && styles.progressTabActive]}
                          onPress={() => setProgressTab(key)}
                        >
                          <Text style={[styles.progressTabText, progressTab === key && styles.progressTabTextActive]}>{label}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>

                    {progressTab === 'bests' && (
                      <View style={styles.progressSection}>
                        {personalBests.length === 0 ? (
                          <View style={styles.progressEmpty}>
                            <Icon name="trophy-outline" size={36} color={Theme.textMuted} />
                            <Text style={styles.progressEmptyText}>Log some sessions to see personal bests here.</Text>
                          </View>
                        ) : (
                          personalBests.map((b, i) => {
                            const cat = CategoryTheme[b.category as keyof typeof CategoryTheme] ?? { bg: Theme.cardTinted, fg: Theme.eyebrowGreen };
                            const ld = b.log;
                            return (
                              <View key={i} style={styles.bestRow}>
                                <View style={[styles.bestIcon, { backgroundColor: cat.bg }]}>
                                  <Icon name={(CATEGORY_ICONS[b.category] ?? 'dumbbell') as any} size={18} color={cat.fg} />
                                </View>
                                <Text style={styles.bestName} numberOfLines={1}>{b.name}</Text>
                                <View style={styles.bestStats}>
                                  {!!ld.weight && <View style={styles.bestStat}><Text style={styles.bestStatVal}>{ld.weight}kg</Text><Text style={styles.bestStatLabel}>weight</Text></View>}
                                  {!!ld.sets && <View style={styles.bestStat}><Text style={styles.bestStatVal}>{ld.sets}</Text><Text style={styles.bestStatLabel}>sets</Text></View>}
                                  {!!ld.reps && <View style={styles.bestStat}><Text style={styles.bestStatVal}>{ld.reps}</Text><Text style={styles.bestStatLabel}>reps</Text></View>}
                                  {!!ld.height && <View style={styles.bestStat}><Text style={styles.bestStatVal}>{ld.height}in</Text><Text style={styles.bestStatLabel}>height</Text></View>}
                                  {!!ld.time && <View style={styles.bestStat}><Text style={styles.bestStatVal}>{ld.time}s</Text><Text style={styles.bestStatLabel}>hold</Text></View>}
                                  {!!ld.duration && <View style={styles.bestStat}><Text style={styles.bestStatVal}>{ld.duration}m</Text><Text style={styles.bestStatLabel}>duration</Text></View>}
                                  {!!ld.distance && <View style={styles.bestStat}><Text style={styles.bestStatVal}>{ld.distance}</Text><Text style={styles.bestStatLabel}>distance</Text></View>}
                                </View>
                              </View>
                            );
                          })
                        )}
                      </View>
                    )}

                    {progressTab === 'activity' && (
                      <View style={styles.progressSection}>
                        <View style={styles.activityRangeRow}>
                          {ACTIVITY_RANGES.map((r) => (
                            <TouchableOpacity
                              key={r.key}
                              style={[styles.activityRangePill, activityRange === r.key && styles.activityRangePillActive]}
                              onPress={() => setActivityRange(r.key)}
                            >
                              <Text style={[styles.activityRangePillText, activityRange === r.key && styles.activityRangePillTextActive]}>{r.label}</Text>
                            </TouchableOpacity>
                          ))}
                        </View>

                        <Text style={styles.progressChartTitle}>
                          {activeRange.granularity === 'day' ? 'SESSIONS PER DAY' : 'SESSIONS PER WEEK'} · {activeRange.rangeLabel}
                        </Text>
                        <View style={styles.weeklyChart}>
                          {activityBuckets.map((b, i) => {
                            const barH = maxActivity > 0 ? Math.max((b.count / maxActivity) * 90, b.count > 0 ? 8 : 2) : 2;
                            return (
                              <View key={i} style={styles.weeklyCol}>
                                <Text style={styles.weeklyCount}>{b.count > 0 ? b.count : ''}</Text>
                                <View style={[styles.weeklyBar, { height: barH, backgroundColor: b.isCurrent ? Theme.limeAccent : Theme.divider }]} />
                                <Text style={[styles.weeklyLabel, b.isCurrent && styles.weeklyLabelActive]}>{b.label}</Text>
                              </View>
                            );
                          })}
                        </View>

                        <Text style={[styles.progressChartTitle, { marginTop: 20 }]}>CATEGORY BREAKDOWN</Text>
                        {[
                          { key: 'strength', label: 'Strength', count: categoryCounts.strength, vivid: '#2E86DE' },
                          { key: 'footwork', label: 'Footwork', count: categoryCounts.footwork, vivid: '#7CB342' },
                          { key: 'endurance', label: 'Endurance', count: categoryCounts.endurance, vivid: '#F2994A' },
                          { key: 'recovery', label: 'Recovery', count: categoryCounts.recovery, vivid: '#9575CD' },
                        ].map((item) => (
                          <View key={item.key} style={styles.catBreakRow}>
                            <View style={[styles.catBreakDot, { backgroundColor: item.vivid }]} />
                            <Text style={styles.catBreakLabel}>{item.label}</Text>
                            <View style={styles.catBreakTrack}>
                              <View style={[styles.catBreakFill, { width: `${(item.count / maxCategoryCount) * 100}%`, backgroundColor: item.vivid }]} />
                            </View>
                            <Text style={styles.catBreakCount}>{item.count}</Text>
                          </View>
                        ))}
                      </View>
                    )}
                  </View>
                )}
              </>
            )}
            {section === 'home' && !hasAnyClub && <Text style={styles.emptyText}>Progress and activity unlock once your child joins a club.</Text>}

            {section === 'home' && (
              <View style={styles.card}>
                <Text style={styles.sectionLabel}>ASSIGNED BY COACH</Text>
                {assignments.length === 0 ? (
                  <Text style={styles.emptyText}>No workouts assigned yet.</Text>
                ) : (
                  assignments.map((a) => {
                    const cat = CategoryTheme[a.category as keyof typeof CategoryTheme] ?? { bg: Theme.cardTinted, fg: Theme.eyebrowGreen };
                    return (
                      <View key={a.id} style={[styles.rowLine, { flexDirection: 'row', alignItems: 'center', gap: 12 }]}>
                        <View style={[styles.iconBadge, { backgroundColor: cat.bg }]}>
                          <Icon name={(CATEGORY_ICONS[a.category] ?? 'dumbbell') as any} size={18} color={cat.fg} />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.rowLineTitle, { fontSize: 17 }]}>{a.title}</Text>
                          <Text style={[styles.rowLineSub, { fontSize: 14 }]}>By {a.coachName} · {new Date(a.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</Text>
                        </View>
                      </View>
                    );
                  })
                )}
              </View>
            )}

            {section === 'home' && (strengths.length > 0 || weaknesses.length > 0) && (
              <View style={styles.card}>
                <Text style={styles.sectionLabel}>STRENGTHS & WEAKNESSES</Text>
                <Text style={[styles.hint, { marginTop: -4 }]}>Combined from match logs and coach notes.</Text>
                {weaknesses.length > 0 && (
                  <>
                    <Text style={[styles.tagGroupLabel, { color: CategoryTheme.endurance.fg, marginTop: 4 }]}>WEAKNESSES</Text>
                    {weaknesses.map((t) => (
                      <View key={`w-${t.tag}`} style={[styles.rowLine, { flexDirection: 'row', alignItems: 'center', gap: 10 }]}>
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.rowLineTitle, { fontSize: 17 }]}>{t.tag}</Text>
                          <Text style={[styles.rowLineSub, { fontSize: 14 }]}>{sourceBreakdown(t)}</Text>
                        </View>
                        <View style={[styles.tagCountBadge, { backgroundColor: CategoryTheme.endurance.bg }]}>
                          <Text style={[styles.tagCountText, { color: CategoryTheme.endurance.fg }]}>×{t.count}</Text>
                        </View>
                      </View>
                    ))}
                  </>
                )}
                {strengths.length > 0 && (
                  <>
                    <Text style={[styles.tagGroupLabel, { color: CategoryTheme.footwork.fg, marginTop: 16 }]}>STRENGTHS</Text>
                    {strengths.map((t) => (
                      <View key={`s-${t.tag}`} style={[styles.rowLine, { flexDirection: 'row', alignItems: 'center', gap: 10 }]}>
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.rowLineTitle, { fontSize: 17 }]}>{t.tag}</Text>
                          <Text style={[styles.rowLineSub, { fontSize: 14 }]}>{sourceBreakdown(t)}</Text>
                        </View>
                        <View style={[styles.tagCountBadge, { backgroundColor: CategoryTheme.footwork.bg }]}>
                          <Text style={[styles.tagCountText, { color: CategoryTheme.footwork.fg }]}>×{t.count}</Text>
                        </View>
                      </View>
                    ))}
                  </>
                )}
              </View>
            )}

            {section === 'home' && (
              <View style={styles.activityCard}>
                <Text style={styles.sectionLabel}>RECENT ACTIVITY</Text>
                {activityFeed.length === 0 ? (
                  <Text style={styles.emptyText}>Nothing yet.</Text>
                ) : (
                  activityFeed.map((item) => (
                    <View key={item.id} style={styles.activityRow}>
                      <View style={[styles.iconBadge, { backgroundColor: item.color.bg }]}>
                        <Icon name={item.icon as any} size={18} color={item.color.fg} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.rowLineTitle, { fontSize: 17 }]}>{item.title}</Text>
                        {!!item.subtitle && <Text style={[styles.rowLineSub, { fontSize: 14 }]}>{item.subtitle}</Text>}
                      </View>
                    </View>
                  ))
                )}
              </View>
            )}

            {section === 'schedule' && hasAnyClub && (
              <>
                <View style={styles.progressTabRow}>
                  {([['classes', 'Schedule'], ['request', 'Request']] as const).map(([key, label]) => (
                    <TouchableOpacity
                      key={key}
                      style={[styles.progressTab, scheduleTab === key && styles.progressTabActive]}
                      onPress={() => setScheduleTab(key)}
                    >
                      <Text style={[styles.progressTabText, scheduleTab === key && styles.progressTabTextActive]}>{label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {scheduleTab === 'classes' && (
                  <View style={styles.card}>
                    <View style={styles.monthNav}>
                      <TouchableOpacity onPress={prevMonth} style={styles.monthArrow}>
                        <Icon name="chevron-left" size={24} color={Theme.textPrimary} />
                      </TouchableOpacity>
                      <Text style={styles.monthTitle}>{MONTH_NAMES[viewMonth]} {viewYear}</Text>
                      <TouchableOpacity onPress={nextMonth} style={styles.monthArrow}>
                        <Icon name="chevron-right" size={24} color={Theme.textPrimary} />
                      </TouchableOpacity>
                    </View>

                    <View style={styles.dayHeaderRow}>
                      {CAL_DAY_HEADERS.map((d) => (
                        <View key={d} style={styles.dayHeaderCell}>
                          <Text style={styles.dayHeaderText}>{d}</Text>
                        </View>
                      ))}
                    </View>

                    <View style={styles.calendarGrid}>
                      {(() => {
                        const daysInMonth = getDaysInMonth(viewYear, viewMonth);
                        const firstDay = getFirstDayOfMonth(viewYear, viewMonth);
                        const todayStr = localDateStr(today);
                        const cells = [];
                        for (let i = 0; i < firstDay; i++) cells.push(<View key={`empty-${i}`} style={styles.dayCell} />);
                        for (let day = 1; day <= daysInMonth; day++) {
                          const dateStr = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                          const dow = new Date(`${dateStr}T00:00:00`).getDay();
                          const isToday = dateStr === todayStr;
                          const isSelected = !markingTournament && dateStr === selectedCalDate;
                          const isRangeEdge = markingTournament && (dateStr === tournamentStart || dateStr === tournamentEnd);
                          const isRangeMid = markingTournament && !!tournamentStart && dateStr >= tournamentStart && dateStr <= (tournamentEnd ?? tournamentStart) && !isRangeEdge;
                          const hasPrivate = privateLessonsForDow(dow).length > 0;
                          const hasGroup = groupLessonsForDow(dow).length > 0;
                          const hasMakeup = makeupCredits.some((m) => m.status === 'scheduled' && m.scheduledDate === dateStr);
                          const hasTournament = !!tournamentForDate(dateStr);
                          cells.push(
                            <TouchableOpacity
                              key={day}
                              style={[
                                styles.dayCell,
                                isSelected && styles.dayCellSelected,
                                isToday && !isSelected && !isRangeEdge && styles.dayCellToday,
                                isRangeMid && styles.dayCellRangeMid,
                                isRangeEdge && styles.dayCellRangeEdge,
                              ]}
                              onPress={() => handleDayPress(dateStr)}
                            >
                              <Text style={[
                                styles.dayCellText,
                                isSelected && styles.dayCellTextSelected,
                                isToday && !isSelected && styles.dayCellTextToday,
                                isRangeEdge && styles.dayCellTextRangeEdge,
                              ]}>{day}</Text>
                              {(hasPrivate || hasGroup || hasMakeup || hasTournament) && (
                                <View style={styles.dotRow}>
                                  {hasPrivate && <View style={[styles.eventDot, { backgroundColor: LESSON_DOT_COLOR.private }]} />}
                                  {hasGroup && <View style={[styles.eventDot, { backgroundColor: LESSON_DOT_COLOR.group }]} />}
                                  {hasMakeup && <View style={[styles.eventDot, { backgroundColor: LESSON_DOT_COLOR.makeup }]} />}
                                  {hasTournament && <View style={[styles.eventDot, { backgroundColor: LESSON_DOT_COLOR.tournament }]} />}
                                </View>
                              )}
                            </TouchableOpacity>
                          );
                        }
                        const rows = [];
                        for (let i = 0; i < cells.length; i += 7) {
                          const rowCells = cells.slice(i, i + 7);
                          while (rowCells.length < 7) rowCells.push(<View key={`pad-${i}-${rowCells.length}`} style={styles.dayCell} />);
                          rows.push(<View key={`row-${i}`} style={styles.calendarRow}>{rowCells}</View>);
                        }
                        return rows;
                      })()}
                    </View>

                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 16, marginTop: 4, width: '100%' }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <View style={[styles.legendDot, { backgroundColor: LESSON_DOT_COLOR.private }]} />
                        <Text style={styles.calLegendText}>Private</Text>
                      </View>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <View style={[styles.legendDot, { backgroundColor: LESSON_DOT_COLOR.group }]} />
                        <Text style={styles.calLegendText}>Group</Text>
                      </View>
                      {makeupCredits.some((m) => m.status === 'scheduled') && (
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <View style={[styles.legendDot, { backgroundColor: LESSON_DOT_COLOR.makeup }]} />
                          <Text style={styles.calLegendText}>Makeup</Text>
                        </View>
                      )}
                      {allTournaments.length > 0 && (
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <View style={[styles.legendDot, { backgroundColor: LESSON_DOT_COLOR.tournament }]} />
                          <Text style={styles.calLegendText}>Tournament</Text>
                        </View>
                      )}
                    </View>

                    {!markingTournament ? (
                      <TouchableOpacity
                        style={[styles.button, { marginTop: 16 }]}
                        onPress={() => { setMarkingTournament(true); setTournamentStart(null); setTournamentEnd(null); setTournamentName(''); setTournamentDeadline(null); setTournamentLink(''); setShowRegistrationDetails(false); }}
                        disabled={!selectedChildId}
                      >
                        <Text style={styles.buttonText}>Mark Tournament Dates</Text>
                      </TouchableOpacity>
                    ) : (
                      <View style={{ width: '100%', marginTop: 16 }}>
                        <Text style={styles.markingStepText}>
                          {!tournamentStart ? 'Pick the first day.'
                            : !tournamentEnd ? 'Now pick the last day.'
                            : `${formatDateLong(tournamentStart)} – ${formatDateLong(tournamentEnd)}`}
                        </Text>
                        {tournamentStart && tournamentEnd && (
                          <>
                            <TextInput
                              style={[styles.textField, { marginBottom: 12 }]}
                              value={tournamentName}
                              onChangeText={setTournamentName}
                              placeholder="e.g. Regional Championships"
                              placeholderTextColor={Theme.textSecondary}
                            />

                            <TouchableOpacity
                              style={styles.collapsibleHeader}
                              onPress={() => setShowRegistrationDetails((v) => !v)}
                            >
                              <Text style={styles.collapsibleHeaderText}>Registration details (optional)</Text>
                              <Icon name={showRegistrationDetails ? 'chevron-up' : 'chevron-down'} size={18} color={Theme.textSecondary} />
                            </TouchableOpacity>

                            {showRegistrationDetails && (
                              <>
                                <Text style={[styles.rowLineTitle, { marginTop: 12 }]}>Registration deadline</Text>
                                <View style={styles.deadlineHeaderRow}>
                                  <Text style={styles.deadlineValueText}>
                                    {tournamentDeadline ? `Closes ${formatDateLong(tournamentDeadline)}` : 'No deadline set'}
                                  </Text>
                                  {!!tournamentDeadline && (
                                    <TouchableOpacity onPress={() => setTournamentDeadline(null)}>
                                      <Text style={styles.deadlineClearText}>Clear</Text>
                                    </TouchableOpacity>
                                  )}
                                </View>
                                <MiniDatePicker value={tournamentDeadline} onChange={setTournamentDeadline} maxDate={tournamentStart ? dayBefore(tournamentStart) : undefined} accentColor="#F39C12" />

                                <Text style={[styles.rowLineTitle, { marginTop: 16 }]}>Registration link</Text>
                                <TextInput
                                  style={[styles.textField, { marginBottom: 12 }]}
                                  value={tournamentLink}
                                  onChangeText={setTournamentLink}
                                  placeholder="https://tournamentsoftware.com/..."
                                  placeholderTextColor={Theme.textSecondary}
                                  autoCapitalize="none"
                                  autoCorrect={false}
                                  keyboardType="url"
                                />
                              </>
                            )}

                            <TouchableOpacity
                              style={[styles.button, savingTournament && styles.buttonDisabled]}
                              onPress={submitTournament}
                              disabled={savingTournament}
                            >
                              <Text style={styles.buttonText}>{savingTournament ? 'Saving...' : 'Confirm Tournament Dates'}</Text>
                            </TouchableOpacity>
                          </>
                        )}
                        <TouchableOpacity
                          style={{ marginTop: 12, alignSelf: 'center' }}
                          onPress={() => { setMarkingTournament(false); setTournamentStart(null); setTournamentEnd(null); setTournamentName(''); setTournamentDeadline(null); setTournamentLink(''); setShowRegistrationDetails(false); }}
                        >
                          <Text style={styles.unlinkText}>Cancel</Text>
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>
                )}

                {scheduleTab === 'request' && (
                <>
                  <View style={styles.progressTabRow}>
                    {([['makeup', 'Makeup Credits'], ['book', 'Book a Lesson']] as const).map(([key, label]) => (
                      <TouchableOpacity
                        key={key}
                        style={[styles.progressTab, requestSubTab === key && styles.progressTabActive]}
                        onPress={() => setRequestSubTab(key)}
                      >
                        <Text style={[styles.progressTabText, requestSubTab === key && styles.progressTabTextActive]}>{label}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  {requestSubTab === 'makeup' && (
                  <View style={styles.card}>
                    <Text style={styles.sectionLabel}>MAKEUP CREDITS</Text>
                    {/* Once a credit is actually scheduled it moves to the Calendar
                        (gold dot, tap for details + the attendance toggle) — this
                        list only ever shows things that still need action. */}
                    {makeupCredits.filter((m) => m.status === 'owed' || m.status === 'pending_approval' || m.status === 'proposed').length === 0 ? (
                      <Text style={styles.emptyText}>No makeup lessons owed right now.</Text>
                    ) : (
                      makeupCredits.filter((m) => m.status === 'owed' || m.status === 'pending_approval' || m.status === 'proposed').map((m) => (
                        <View key={`${m.kind}_${m.id}`} style={[styles.rowLine, { flexDirection: 'row', alignItems: 'center', gap: 12 }]}>
                          <View style={[styles.iconBadge, { backgroundColor: '#FDE7A8' }]}>
                            <Icon name="refresh" size={18} color={LESSON_DOT_COLOR.makeup} />
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.rowLineTitle} numberOfLines={1}>{m.label}</Text>
                            <Text style={styles.rowLineSub}>
                              {m.status === 'pending_approval' ? `Requested ${formatDateLong(m.scheduledDate!)} · Waiting on club`
                                : m.status === 'proposed' ? `Proposed ${formatDateLong(m.scheduledDate!)}${m.scheduledStartTime ? ` · ${formatTime12h(m.scheduledStartTime)}` : ''}`
                                : `Missed ${formatDateLong(m.missedDate)}`}
                            </Text>
                            {m.status === 'owed' && m.kind === 'private' && (
                              <TouchableOpacity style={styles.miniActionBtn} onPress={() => openMakeupSlotPicker(m)}>
                                <Text style={styles.miniActionBtnText}>Pick a Time</Text>
                              </TouchableOpacity>
                            )}
                            {m.status === 'proposed' && m.kind === 'private' && (
                              <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                                <TouchableOpacity style={styles.miniActionBtn} onPress={() => confirmProposedSlot(m)}>
                                  <Text style={styles.miniActionBtnText}>Confirm</Text>
                                </TouchableOpacity>
                                <TouchableOpacity style={styles.miniDeclineBtn} onPress={() => declineProposedSlot(m)}>
                                  <Text style={styles.miniDeclineBtnText}>Decline</Text>
                                </TouchableOpacity>
                              </View>
                            )}
                          </View>
                        </View>
                      ))
                    )}
                  </View>
                  )}

                  {requestSubTab === 'book' && (
                  <>
                  <View style={styles.card}>
                    <Text style={styles.sectionLabel}>REQUEST A LESSON</Text>
                  <Text style={styles.hint}>Pick a coach and day, then tap an open slot to request it.</Text>
                  <Text style={styles.pillGroupLabel}>COACH</Text>
                  {clubCoaches.length === 0 ? (
                    <Text style={styles.emptyText}>No coaches set up at this club yet.</Text>
                  ) : (
                    <View style={styles.pillWrapRow}>
                      {clubCoaches.map((c) => (
                        <TouchableOpacity key={c.id} style={[styles.pill, styles.reqPill, reqCoachId === c.id && styles.pillActive]} onPress={() => setReqCoachId(c.id)}>
                          <Text style={[styles.pillText, styles.reqPillText, reqCoachId === c.id && styles.pillTextActive]}>{c.full_name}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}
                  <Text style={styles.pillGroupLabel}>DAY</Text>
                  <View style={styles.pillWrapRow}>
                    {DAY_NAMES.map((d, i) => (
                      <TouchableOpacity key={d} style={[styles.pill, styles.reqPill, reqDay === i && styles.dayPillActive]} onPress={() => setReqDay(i)}>
                        <Text style={[styles.pillText, styles.reqPillText, reqDay === i && styles.dayPillTextActive]}>{d.slice(0, 3)}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  <View style={styles.slotGrid}>
                    {HOURS.map((h) => {
                      const start = `${String(h).padStart(2, '0')}:00`;
                      const end = `${String(h + 1).padStart(2, '0')}:00`;
                      const open = isSlotOpen(busySlots, start, end) && isAnyCourtOpen(courtAvailability, start, end);
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
                  {/* Joining is coach-wide (notify me of ANY opening with them),
                      not tied to the day currently selected above — so this
                      can't be conditioned on "no slots this day" (misleading
                      on a day the coach doesn't even work) or it'd read like
                      a promise to open up today specifically. */}
                  {reqCoachId && (
                    isOnWaitlistFor(reqCoachId) ? (
                      <Text style={[styles.emptyText, { marginTop: 16 }]}>Already on the waitlist for this coach.</Text>
                    ) : (
                      <TouchableOpacity style={[styles.waitlistLink, { marginTop: 16 }]} onPress={() => setWaitlistNoteModal(true)} disabled={joiningWaitlist}>
                        <Text style={styles.waitlistLinkText}>
                          {joiningWaitlist ? 'Joining...' : "Don't see a good time? Join the waitlist"}
                        </Text>
                      </TouchableOpacity>
                    )
                  )}
                  {myWaitlist.length > 0 && (
                    <>
                      <Text style={[styles.sectionLabel, { marginTop: 16 }]}>ON THE WAITLIST</Text>
                      {myWaitlist.map((w) => (
                        <View key={w.id} style={[styles.rowLine, { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }]}>
                          <View>
                            <Text style={styles.rowLineTitle}>{w.coachName}</Text>
                            <Text style={styles.rowLineSub}>{w.status === 'offered' ? 'A slot was offered — check with the club' : `Waiting · #${w.priority}`}</Text>
                          </View>
                          <TouchableOpacity onPress={() => leaveWaitlistEntry(w)}>
                            <Text style={styles.unlinkText}>Leave</Text>
                          </TouchableOpacity>
                        </View>
                      ))}
                    </>
                  )}
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
                </>
                )}
              </>
            )}
            {section === 'schedule' && !hasAnyClub && <Text style={styles.emptyText}>Scheduling unlocks once your child joins a club.</Text>}

            {section === 'tournaments' && (
              <>
                <TouchableOpacity
                  style={styles.logMatchTopBtn}
                  onPress={() => selectedChildId && router.push({
                    pathname: '/log-match-parent',
                    params: { childId: selectedChildId, childName: selectedChild?.fullName ?? '' },
                  } as any)}
                  disabled={!selectedChildId}
                >
                  <Icon name="plus-circle-outline" size={20} color={Theme.limeAccentDark} />
                  <Text style={styles.logMatchTopBtnText}>Log a Match</Text>
                </TouchableOpacity>

                <View style={styles.matchSearchRow}>
                  <Icon name="magnify" size={20} color="#0C447C" />
                  <TextInput
                    style={styles.matchSearchInput}
                    value={tournamentSearch}
                    onChangeText={setTournamentSearch}
                    placeholder="Search opponents or tournaments..."
                    placeholderTextColor={Theme.textSecondary}
                  />
                </View>

                <View style={styles.card}>
                  <View style={styles.matchSectionHeaderRow}>
                    <Text style={styles.sectionLabel}>MATCHES</Text>
                    <Text style={styles.matchSectionCount}>{childMatches.length} logged</Text>
                  </View>

                  {childMatches.length === 0 ? (
                    <Text style={styles.emptyText}>No matches logged yet.</Text>
                  ) : groupedMatches.length === 0 ? (
                    <Text style={styles.emptyText}>Nothing matches "{tournamentSearch}".</Text>
                  ) : (
                    groupedMatches.map((g) => (
                      <TouchableOpacity key={g.key} style={styles.matchCard} onPress={() => openMatch(g)}>
                        <View style={styles.matchAvatar}><Text style={styles.matchAvatarText}>{(g.opponent_name ?? '?').charAt(0).toUpperCase()}</Text></View>
                        <View style={{ flex: 1 }}>
                          <View style={styles.matchCardNameRow}>
                            <Text style={styles.matchCardName} numberOfLines={1}>{g.opponent_name ?? 'Opponent'}</Text>
                            {g.latestType && (
                              <View style={[styles.matchTypeTag, g.latestType === 'singles' ? styles.matchTypeTagSingles : styles.matchTypeTagDoubles]}>
                                <Text style={[styles.matchTypeTagText, g.latestType === 'singles' ? styles.matchTypeTagTextSingles : styles.matchTypeTagTextDoubles]}>
                                  {g.latestType === 'singles' ? 'Singles' : 'Doubles'}
                                </Text>
                              </View>
                            )}
                          </View>
                          {g.count > 1 && <Text style={styles.matchCardMeta}>{g.count} matches logged</Text>}
                        </View>
                        {g.latestResult && g.latestResult !== 'unsure' && (
                          <View style={[styles.matchResultDot, g.latestResult === 'win' ? styles.matchResultDotWon : styles.matchResultDotLost]} />
                        )}
                      </TouchableOpacity>
                    ))
                  )}

                  <TouchableOpacity style={[styles.button, { marginTop: 16 }]} onPress={() => setShowTournamentModal(true)} disabled={!selectedChildId}>
                    <Text style={styles.buttonText}>Mark Tournament Dates</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}

            {section === 'journal' && (
              <View style={styles.card}>
                {journalEntries.length === 0 ? (
                  <Text style={styles.emptyText}>No shared journal entries yet — {firstName(selectedChild?.fullName)} can share one from their own Journal.</Text>
                ) : (
                  journalWeekGroups(journalEntries, journalWeekLabel).map((group, groupIndex) => {
                    const isCollapsed = collapsedJournalWeeks[group.label] ?? groupIndex > 0;
                    return (
                      <View key={group.label}>
                        <TouchableOpacity
                          style={[styles.journalWeekHeaderRow, groupIndex === 0 && { marginTop: 0 }]}
                          onPress={() => setCollapsedJournalWeeks((prev) => ({ ...prev, [group.label]: !isCollapsed }))}
                        >
                          <Text style={styles.journalWeekHeader}>{group.label}</Text>
                          <Icon name={isCollapsed ? 'chevron-down' : 'chevron-up'} size={18} color={Theme.eyebrowGreen} />
                        </TouchableOpacity>
                        {!isCollapsed && group.entries.map((j) => {
                          const expanded = !!expandedJournalIds[j.id];
                          const eyebrow = [
                            j.entry_type === 'lesson' ? (j.coachFirstNames.length > 0 ? `Lesson with ${j.coachFirstNames.join(' & ')}` : 'Lesson') : 'Personal entry',
                            new Date(j.created_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
                          ].join(' · ');
                          return (
                            <TouchableOpacity
                              key={j.id}
                              style={styles.journalCard}
                              activeOpacity={0.7}
                              onPress={() => setExpandedJournalIds((prev) => ({ ...prev, [j.id]: !prev[j.id] }))}
                            >
                              <View style={styles.journalCardTopRow}>
                                <View style={{ flex: 1 }}>
                                  <Text style={styles.journalCardEyebrow}>{eyebrow}</Text>
                                  <Text style={styles.journalCardTitle} numberOfLines={expanded ? undefined : 2}>{j.free_text}</Text>
                                </View>
                                <Icon name={j.entry_type === 'lesson' ? 'school-outline' : 'heart-outline'} size={20} color={j.entry_type === 'lesson' ? Theme.todayBlue : '#8A3FFC'} />
                              </View>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    );
                  })
                )}
              </View>
            )}
            {section === 'profile' && (
              <View style={styles.card}>
                <View style={styles.profileHeaderRow}>
                  <View style={styles.profileAvatar}>
                    <Text style={styles.profileAvatarText}>{(myName || 'P').slice(0, 1).toUpperCase()}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.profileName}>{myName || 'Parent'}</Text>
                    {!!myEmail && <Text style={styles.profileEmail}>{myEmail}</Text>}
                  </View>
                </View>

                <Text style={[styles.sectionLabel, { marginTop: 20 }]}>LINKED CHILDREN</Text>
                {children.length === 0 ? (
                  <Text style={styles.emptyText}>No children linked yet.</Text>
                ) : (
                  children.map((child) => (
                    <View key={child.linkId} style={styles.rowLine}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                        <View>
                          <Text style={styles.rowLineTitle}>{child.fullName}</Text>
                          {child.managedByParentId && <Text style={styles.managedBadge}>Managed — no login yet</Text>}
                        </View>
                        <TouchableOpacity onPress={() => handleUnlink(child)}>
                          <Text style={styles.unlinkText}>Unlink</Text>
                        </TouchableOpacity>
                      </View>
                      {child.managedByParentId && (
                        <TouchableOpacity
                          style={styles.useAsChildBtn}
                          onPress={() => handleUseAsChild(child)}
                          disabled={switchingChildId === child.profileId}
                        >
                          <Icon name="refresh" size={14} color={Theme.eyebrowGreen} />
                          <Text style={styles.useAsChildText}>
                            {switchingChildId === child.profileId ? 'Switching...' : `Use this phone as ${firstName(child.fullName)}`}
                          </Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  ))
                )}
                <TouchableOpacity style={[styles.switchChip, { marginTop: 12, alignSelf: 'flex-start' }]} onPress={() => setShowAddForm(true)}>
                  <Icon name="account-plus-outline" size={20} color={Theme.eyebrowGreen} />
                  <Text style={styles.switchChipText}>Add another child</Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.signOutBtn} onPress={signOut}>
                  <Text style={styles.signOutText}>Sign Out</Text>
                </TouchableOpacity>
              </View>
            )}
          </>
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
              <TextInput
                style={styles.textField}
                value={paymentNote}
                onChangeText={setPaymentNote}
                placeholder="e.g. October payment"
                placeholderTextColor={Theme.textSecondary}
              />

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
              <View>
                <Text style={styles.modalTitle}>{rosterLesson?.name}</Text>
                {rosterLesson && (
                  <Text style={styles.hint}>
                    {DAY_NAMES[rosterLesson.day_of_week].slice(0, 3)} {formatTime12h(rosterLesson.start_time)}–{formatTime12h(rosterLesson.end_time)}
                    {rosterLesson.coach_name ? ` · ${rosterLesson.coach_name}` : ''}
                  </Text>
                )}
              </View>
              <TouchableOpacity onPress={() => setRosterLesson(null)}>
                <Icon name="close-circle-outline" size={26} color={Theme.textPrimary} />
              </TouchableOpacity>
            </View>
            {rosterLesson && (() => {
              const att = statusFor(groupAtt, rosterLesson.id);
              return (
                <View style={[styles.attSwitchRow, { marginBottom: 16 }]}>
                  <Text style={[styles.attSwitchLabel, { color: att.attending ? Theme.eyebrowGreen : '#c0392b' }]}>
                    {att.attending ? 'Attending' : 'Not attending'}
                  </Text>
                  <Switch
                    value={att.attending}
                    onValueChange={() => toggleChildGroupAttendance(rosterLesson)}
                    trackColor={{ false: '#f0c0c0', true: Theme.eyebrowGreen }}
                    thumbColor="#FFFFFF"
                  />
                </View>
              );
            })()}
            <Text style={styles.sectionLabel}>WHO'S ATTENDING</Text>
            <ScrollView showsVerticalScrollIndicator={false}>
              {roster.length === 0 ? (
                <Text style={styles.emptyText}>No one else is enrolled yet.</Text>
              ) : (
                roster.map((r) => {
                  const rAtt = statusFor(rosterAttendance, r.player_id);
                  return (
                    <View key={r.id} style={[styles.rowLine, { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }]}>
                      <Text style={styles.rowLineTitle}>{r.player_name}</Text>
                      <Text style={[styles.rowLineSub, { color: rAtt.attending ? Theme.eyebrowGreen : '#c0392b' }]}>
                        {rAtt.attending ? 'Attending' : 'Not attending'}
                      </Text>
                    </View>
                  );
                })
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal visible={!!selectedPrivateLesson} transparent animationType="fade" onRequestClose={() => setSelectedPrivateLesson(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>Private Lesson</Text>
                {selectedPrivateLesson && (
                  <Text style={styles.hint}>
                    {DAY_NAMES[selectedPrivateLesson.day_of_week].slice(0, 3)} {formatTime12h(selectedPrivateLesson.start_time)}–{formatTime12h(selectedPrivateLesson.end_time)}
                  </Text>
                )}
              </View>
              <TouchableOpacity onPress={() => setSelectedPrivateLesson(null)}>
                <Icon name="close-circle-outline" size={26} color={Theme.textPrimary} />
              </TouchableOpacity>
            </View>
            {selectedPrivateLesson && (
              <>
                <Text style={styles.rowLineTitle}>With {selectedPrivateLesson.coach_name}</Text>
                {selectedPrivateLesson.court_name && <Text style={[styles.rowLineSub, { marginBottom: 16 }]}>{selectedPrivateLesson.court_name}</Text>}
                {(() => {
                  const att = statusFor(privateAtt, selectedPrivateLesson.id);
                  return (
                    <View style={[styles.attSwitchRow, { marginTop: 12 }]}>
                      <Text style={[styles.attSwitchLabel, { color: att.attending ? Theme.eyebrowGreen : '#c0392b' }]}>
                        {att.attending ? 'Attending' : 'Not attending'}
                      </Text>
                      <Switch
                        value={att.attending}
                        onValueChange={() => toggleChildPrivateAttendance(selectedPrivateLesson)}
                        trackColor={{ false: '#f0c0c0', true: Theme.eyebrowGreen }}
                        thumbColor="#FFFFFF"
                      />
                    </View>
                  );
                })()}
              </>
            )}
          </View>
        </View>
      </Modal>

      <Modal visible={!!selectedCalDate} transparent animationType="fade" onRequestClose={() => setSelectedCalDate(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {selectedCalDate ? new Date(`${selectedCalDate}T00:00:00`).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }) : ''}
              </Text>
              <TouchableOpacity onPress={() => setSelectedCalDate(null)}>
                <Icon name="close-circle-outline" size={26} color={Theme.textPrimary} />
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              {(() => {
                if (!selectedCalDate) return null;
                const dow = new Date(`${selectedCalDate}T00:00:00`).getDay();
                const dayPrivate = privateLessonsForDow(dow);
                const dayGroup = groupLessonsForDow(dow);
                const dayMakeup = makeupCredits.filter((m) => m.status === 'scheduled' && m.scheduledDate === selectedCalDate);
                const dayTournament = tournamentForDate(selectedCalDate);
                if (dayPrivate.length === 0 && dayGroup.length === 0 && dayMakeup.length === 0 && !dayTournament) {
                  return <Text style={styles.emptyText}>Nothing scheduled this day.</Text>;
                }
                return (
                  <>
                    {dayTournament && (
                      <TouchableOpacity
                        style={[styles.rowLine, { flexDirection: 'row', alignItems: 'center', gap: 12 }]}
                        onPress={() => { setSelectedCalDate(null); openTournamentDetail(dayTournament); }}
                      >
                        <View style={[styles.iconBadge, { backgroundColor: '#FADBD8' }]}>
                          <Icon name="trophy-outline" size={18} color={LESSON_DOT_COLOR.tournament} />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.rowLineTitle}>{dayTournament.name}</Text>
                          <Text style={styles.rowLineSub}>Tournament · {formatDateLong(dayTournament.start_date)} – {formatDateLong(dayTournament.end_date)}</Text>
                        </View>
                      </TouchableOpacity>
                    )}
                    {dayMakeup.map((m) => {
                      const att = statusFor(makeupAtt, `${m.kind}_${m.id}`);
                      return (
                        <View key={`${m.kind}_${m.id}`} style={[styles.rowLine, { flexDirection: 'row', alignItems: 'center', gap: 12 }]}>
                          <View style={[styles.iconBadge, { backgroundColor: '#FDE7A8' }]}>
                            <Icon name="refresh" size={18} color={LESSON_DOT_COLOR.makeup} />
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.rowLineTitle}>{m.scheduledStartTime ? formatTime12h(m.scheduledStartTime) : ''}{m.scheduledEndTime ? `–${formatTime12h(m.scheduledEndTime)}` : ''}</Text>
                            <Text style={styles.rowLineSub}>Makeup: {m.label}</Text>
                          </View>
                          <Switch
                            value={att.attending}
                            onValueChange={() => toggleMakeupAttendance(m)}
                            trackColor={{ false: '#f0c0c0', true: Theme.eyebrowGreen }}
                            thumbColor="#FFFFFF"
                          />
                        </View>
                      );
                    })}
                    {dayPrivate.map((l) => (
                      <TouchableOpacity
                        key={l.id}
                        style={[styles.rowLine, { flexDirection: 'row', alignItems: 'center', gap: 12 }]}
                        onPress={() => { setSelectedCalDate(null); setSelectedPrivateLesson(l); }}
                      >
                        <View style={[styles.iconBadge, { backgroundColor: colorForLessonType('private').bg }]}>
                          <Icon name="calendar-week" size={18} color={colorForLessonType('private').fg} />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.rowLineTitle}>{formatTime12h(l.start_time)}–{formatTime12h(l.end_time)}</Text>
                          <Text style={styles.rowLineSub}>Private with {l.coach_name}</Text>
                        </View>
                      </TouchableOpacity>
                    ))}
                    {dayGroup.map((g) => (
                      <TouchableOpacity
                        key={g.id}
                        style={[styles.rowLine, { flexDirection: 'row', alignItems: 'center', gap: 12 }]}
                        onPress={() => { setSelectedCalDate(null); openRoster(g); }}
                      >
                        <View style={[styles.iconBadge, { backgroundColor: colorForLessonType('group').bg }]}>
                          <Icon name="calendar-week" size={18} color={colorForLessonType('group').fg} />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.rowLineTitle}>{formatTime12h(g.start_time)}–{formatTime12h(g.end_time)}</Text>
                          <Text style={styles.rowLineSub}>{g.name}{g.coach_name ? ` · ${g.coach_name}` : ''} · Tap to see who's attending</Text>
                        </View>
                      </TouchableOpacity>
                    ))}
                  </>
                );
              })()}
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal visible={!!makeupSlotCredit} transparent animationType="fade" onRequestClose={() => setMakeupSlotCredit(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Pick a Makeup Time</Text>
              <TouchableOpacity onPress={() => setMakeupSlotCredit(null)}>
                <Icon name="close-circle-outline" size={26} color={Theme.textPrimary} />
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              {loadingSuggestions ? (
                <Text style={styles.emptyText}>Finding open times...</Text>
              ) : makeupSuggestions.length === 0 ? (
                <Text style={styles.emptyText}>No open times found in the next few weeks — ask the club directly.</Text>
              ) : (
                makeupSuggestions.map((s) => {
                  const key = `${s.date}_${s.startTime}`;
                  const niceDate = `${new Date(`${s.date}T00:00:00`).toLocaleDateString('en-US', { weekday: 'short' })}, ${formatDateLong(s.date)}`;
                  return (
                    <TouchableOpacity
                      key={key}
                      style={styles.suggestionRow}
                      disabled={requestingMakeupSlot === key}
                      onPress={() => selectMakeupSuggestion(s)}
                    >
                      <View style={[styles.iconBadge, { backgroundColor: '#FDE7A8' }]}>
                        <Icon name="calendar-week" size={18} color={LESSON_DOT_COLOR.makeup} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                          <Text style={styles.rowLineTitle}>{niceDate}</Text>
                          {s.isBestFit && (
                            <View style={styles.bestFitBadge}>
                              <Text style={styles.bestFitBadgeText}>Best fit</Text>
                            </View>
                          )}
                        </View>
                        <Text style={styles.rowLineSub}>{formatTime12h(s.startTime)}–{formatTime12h(s.endTime)}</Text>
                        <Text style={styles.rowLineSub}>
                          With {s.coachName}{s.isDifferentCoach ? ' (different coach)' : ''}{s.courtName ? ` · ${s.courtName}` : ''}
                        </Text>
                        <Text style={styles.rowLineSub}>{s.reason}</Text>
                      </View>
                    </TouchableOpacity>
                  );
                })
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal visible={!!selectedTournament} transparent animationType="fade" onRequestClose={() => setSelectedTournament(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{selectedTournament?.name}</Text>
              <TouchableOpacity onPress={() => setSelectedTournament(null)}>
                <Icon name="close-circle-outline" size={26} color={Theme.textPrimary} />
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={styles.rowLineSub}>{selectedTournament ? `${formatDateLong(selectedTournament.start_date)} – ${formatDateLong(selectedTournament.end_date)}` : ''}</Text>
              {selectedTournament?.registration_deadline && (
                <Text style={[styles.rowLineSub, styles.deadlineText]}>Registration closes {formatDateLong(selectedTournament.registration_deadline)}</Text>
              )}
              {selectedTournament?.registration_link && (
                <TouchableOpacity style={styles.signUpBtn} onPress={() => Linking.openURL(selectedTournament.registration_link!)}>
                  <Icon name="link-variant" size={16} color="#FFFFFF" />
                  <Text style={styles.signUpBtnText}>Sign Up</Text>
                </TouchableOpacity>
              )}
              <View style={{ marginTop: 12 }} />
              {loadingTournamentMatches ? (
                <Text style={styles.emptyText}>Loading matches...</Text>
              ) : tournamentMatches.length === 0 ? (
                <Text style={styles.emptyText}>No matches logged for this tournament yet.</Text>
              ) : (
                tournamentMatches.map((m) => renderMatchLog(m, true))
              )}
              <TouchableOpacity
                style={[styles.button, { marginTop: 16 }]}
                onPress={() => selectedChildId && selectedTournament && router.push({
                  pathname: '/log-match-parent',
                  params: { childId: selectedChildId, childName: selectedChild?.fullName ?? '', tournamentBlockId: selectedTournament.id },
                })}
              >
                <Text style={styles.buttonText}>Log a Match</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal visible={!!selectedOpponent} transparent animationType="fade" onRequestClose={() => setSelectedOpponent(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{selectedOpponent?.name}</Text>
              <TouchableOpacity onPress={() => setSelectedOpponent(null)}>
                <Icon name="close-circle-outline" size={26} color={Theme.textPrimary} />
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              {loadingOpponentMatches ? (
                <Text style={styles.emptyText}>Loading matches...</Text>
              ) : opponentMatches.length === 0 ? (
                <Text style={styles.emptyText}>No matches logged against this opponent yet.</Text>
              ) : (
                opponentMatches.map((m) => renderMatchLog(m, false))
              )}
              <TouchableOpacity
                style={[styles.button, { marginTop: 16 }]}
                onPress={() => selectedChildId && selectedOpponent && router.push({
                  pathname: '/log-match-parent',
                  params: { childId: selectedChildId, childName: selectedChild?.fullName ?? '', opponentName: selectedOpponent.name },
                } as any)}
              >
                <Text style={styles.buttonText}>Log Another Match vs {selectedOpponent?.name}</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal visible={showTournamentModal} transparent animationType="fade" onRequestClose={() => { setShowTournamentModal(false); setTournamentName(''); }}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Mark Tournament Dates</Text>
              <TouchableOpacity onPress={() => { setShowTournamentModal(false); setTournamentName(''); }}>
                <Icon name="close-circle-outline" size={26} color={Theme.textPrimary} />
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={styles.rowLineTitle}>Tournament name</Text>
              <TextInput
                style={[styles.textField, { marginBottom: 16 }]}
                value={tournamentName}
                onChangeText={setTournamentName}
                placeholder="e.g. Regional Championships"
                placeholderTextColor={Theme.textSecondary}
              />
              <Text style={styles.rowLineTitle}>
                {!tournamentStart ? 'Tap the first day.' : !tournamentEnd ? 'Now tap the last day.' : `${formatDateLong(tournamentStart)} – ${formatDateLong(tournamentEnd)}`}
              </Text>
              <MiniDateRangePicker
                startValue={tournamentStart}
                endValue={tournamentEnd}
                onChangeStart={setTournamentStart}
                onChangeEnd={setTournamentEnd}
                minDate={localDateStr()}
              />

              <TouchableOpacity
                style={styles.collapsibleHeader}
                onPress={() => setShowRegistrationDetails((v) => !v)}
              >
                <Text style={styles.collapsibleHeaderText}>Registration details (optional)</Text>
                <Icon name={showRegistrationDetails ? 'chevron-up' : 'chevron-down'} size={18} color={Theme.textSecondary} />
              </TouchableOpacity>

              {showRegistrationDetails && (
                <>
                  <Text style={[styles.rowLineTitle, { marginTop: 12 }]}>Registration deadline</Text>
                  <View style={styles.deadlineHeaderRow}>
                    <Text style={styles.deadlineValueText}>
                      {tournamentDeadline ? `Closes ${formatDateLong(tournamentDeadline)}` : 'No deadline set'}
                    </Text>
                    {!!tournamentDeadline && (
                      <TouchableOpacity onPress={() => setTournamentDeadline(null)}>
                        <Text style={styles.deadlineClearText}>Clear</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                  <MiniDatePicker value={tournamentDeadline} onChange={setTournamentDeadline} maxDate={tournamentStart ? dayBefore(tournamentStart) : undefined} accentColor="#F39C12" />

                  <Text style={[styles.rowLineTitle, { marginTop: 16 }]}>Registration link</Text>
                  <TextInput
                    style={[styles.textField, { marginBottom: 16 }]}
                    value={tournamentLink}
                    onChangeText={setTournamentLink}
                    placeholder="https://tournamentsoftware.com/..."
                    placeholderTextColor={Theme.textSecondary}
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType="url"
                  />
                </>
              )}

              <TouchableOpacity style={[styles.confirmBtn, savingTournament && { opacity: 0.6 }]} onPress={submitTournament} disabled={savingTournament}>
                <Text style={styles.confirmBtnText}>{savingTournament ? 'Saving...' : 'Confirm Tournament Dates'}</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal visible={waitlistNoteModal} transparent animationType="fade" onRequestClose={() => setWaitlistNoteModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Join the Waitlist</Text>
              <TouchableOpacity onPress={() => setWaitlistNoteModal(false)}>
                <Icon name="close-circle-outline" size={26} color={Theme.textPrimary} />
              </TouchableOpacity>
            </View>
            <Text style={styles.hint}>
              The waitlist isn't tied to a specific day — it just puts your child in line for this coach. The club reaches out when a slot opens up. Add a note below so they know what to offer.
            </Text>
            <Text style={[styles.rowLineTitle, { marginTop: 12, marginBottom: 8 }]}>Preferred day/time (optional)</Text>
            <TextInput
              style={styles.textField}
              value={waitlistNote}
              onChangeText={setWaitlistNote}
              placeholder="e.g. Monday afternoons"
              placeholderTextColor={Theme.textSecondary}
            />
            <TouchableOpacity style={[styles.confirmBtn, joiningWaitlist && { opacity: 0.6 }]} onPress={joinWaitlistForCoach} disabled={joiningWaitlist}>
              <Text style={styles.confirmBtnText}>{joiningWaitlist ? 'Joining...' : 'Join Waitlist'}</Text>
            </TouchableOpacity>
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
  emptyText: { fontFamily: Fonts.sansRegular, fontSize: 16, color: Theme.textSecondary, fontStyle: 'italic' },
  hint: { fontFamily: Fonts.sansRegular, fontSize: 15, color: Theme.textSecondary, lineHeight: 20, marginBottom: 12 },
  // Short step prompt shown while tap-picking a tournament range on the
  // calendar grid — deliberately terser than `hint` (no full sentence, no
  // trailing punctuation pile-up) so the two-step flow reads at a glance.
  markingStepText: { fontFamily: Fonts.sansSemiBold, fontSize: 16, color: Theme.textPrimary, marginBottom: 12 },
  collapsibleHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 12, marginTop: 8, borderTopWidth: 1, borderTopColor: Theme.divider, width: '100%',
  },
  collapsibleHeaderText: { fontFamily: Fonts.sansSemiBold, fontSize: 14, color: Theme.textPrimary },
  deadlineHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, width: '100%' },
  deadlineValueText: { fontFamily: Fonts.sansSemiBold, fontSize: 14, color: Theme.textPrimary },
  deadlineClearText: { fontFamily: Fonts.sansSemiBold, fontSize: 13, color: '#E74C3C' },
  deadlineText: { color: '#F39C12', fontFamily: Fonts.sansSemiBold, marginTop: 4 },
  signUpBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: Theme.eyebrowGreen, borderRadius: 10, paddingVertical: 10, marginTop: 10, width: '100%',
  },
  signUpBtnText: { fontFamily: Fonts.sansBold, color: '#FFFFFF', fontSize: 14 },
  calLegendText: { fontFamily: Fonts.sansRegular, fontSize: 13, color: Theme.textSecondary },
  card: { backgroundColor: Theme.cardWhite, borderRadius: 18, padding: 20, marginBottom: 22, alignItems: 'flex-start', width: '100%' },
  activityCard: { backgroundColor: '#FCF3DC', borderRadius: 18, padding: 20, marginBottom: 22, alignItems: 'flex-start', width: '100%' },
  cardTitle: { fontFamily: Fonts.serifMedium, fontSize: 20, color: Theme.textPrimary, marginTop: 12, marginBottom: 6 },
  cardDesc: { fontFamily: Fonts.sansRegular, fontSize: 15, color: Theme.textSecondary, lineHeight: 21, marginBottom: 18 },
  sectionLabel: { fontFamily: Fonts.sansSemiBold, fontSize: 14, color: Theme.eyebrowGreen, letterSpacing: 1, marginBottom: 10 },
  tagGroupLabel: { fontFamily: Fonts.sansBold, fontSize: 12, letterSpacing: 1, marginBottom: 10 },
  tagCountBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  tagCountText: { fontFamily: Fonts.sansBold, fontSize: 13 },
  codeInput: {
    backgroundColor: Theme.background, borderRadius: 10, padding: 16, color: Theme.textPrimary,
    fontFamily: Fonts.serifMedium, fontSize: 22, letterSpacing: 4, textAlign: 'center', marginBottom: 16,
    borderWidth: 1.5, borderColor: '#C9C6BB', width: '100%',
  },
  textField: {
    backgroundColor: '#FFFFFF', borderRadius: 10, padding: 14, color: Theme.textPrimary,
    fontFamily: Fonts.sansRegular, fontSize: 15, borderWidth: 1, borderColor: Theme.divider, width: '100%',
  },
  button: { backgroundColor: Theme.limeAccent, borderRadius: 30, paddingVertical: 14, alignItems: 'center', width: '100%' },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { fontFamily: Fonts.sansBold, color: Theme.limeAccentDark, fontSize: 16, textAlign: 'center' },
  waitlistLink: { alignItems: 'center', paddingVertical: 8 },
  waitlistLinkText: { fontFamily: Fonts.sansSemiBold, fontSize: 14, color: Theme.eyebrowGreen, textDecorationLine: 'underline' },
  // Matches the player's own Matches screen (By Opponent/By Tournament
  // toggle, blue search accent, colored avatar cards) so a parent's
  // Tournaments tab reads as the same feature, not a stripped-down version.
  logMatchTopBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: Theme.limeAccent, borderRadius: 28, paddingVertical: 14, marginBottom: 16 },
  logMatchTopBtnText: { fontFamily: Fonts.sansBold, fontSize: 15, color: Theme.limeAccentDark },
  matchSearchRow: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: Theme.cardWhite, borderRadius: 32, paddingHorizontal: 20, marginBottom: 16 },
  matchSearchInput: { flex: 1, color: Theme.textPrimary, fontFamily: Fonts.sansRegular, fontSize: 16, paddingVertical: 15 },
  matchSectionHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, width: '100%' },
  matchSectionCount: { fontFamily: Fonts.sansSemiBold, fontSize: 13, color: Theme.textSecondary },
  matchCard: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: Theme.cardWhite, borderRadius: 16, padding: 16, marginBottom: 10, borderWidth: 1, borderColor: Theme.divider, width: '100%' },
  matchAvatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#E2EFAE', alignItems: 'center', justifyContent: 'center' },
  matchAvatarText: { fontFamily: Fonts.sansBold, fontSize: 17, color: Theme.eyebrowGreen },
  matchCardNameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  matchCardName: { fontFamily: Fonts.sansSemiBold, fontSize: 17, color: Theme.textPrimary, width: 92 },
  matchCardMeta: { fontFamily: Fonts.sansRegular, fontSize: 13, color: Theme.textSecondary, marginTop: 2 },
  matchTypeTag: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  matchTypeTagSingles: { backgroundColor: Theme.cardTinted },
  matchTypeTagDoubles: { backgroundColor: '#E2EFAE' },
  matchTypeTagText: { fontFamily: Fonts.sansSemiBold, fontSize: 12 },
  matchTypeTagTextSingles: { color: '#0C447C' },
  matchTypeTagTextDoubles: { color: '#3B6D11' },
  matchResultDot: { width: 16, height: 16, borderRadius: 8 },
  matchResultDotWon: { backgroundColor: '#3BB273' },
  matchResultDotLost: { backgroundColor: '#E14444' },
  // Full match-log detail card — same fields/colors as the coach's own view
  // of a shared log (coach-player.tsx), used inside the tournament- and
  // opponent-detail modals. Sized up from the compact list-card equivalents
  // since this is the focused single-match detail view, not a scannable list.
  matchLogCard: { paddingVertical: 18, borderTopWidth: 1, borderTopColor: Theme.divider, gap: 10 },
  matchLogTopRow: { flexDirection: 'row', alignItems: 'center', width: '100%' },
  matchLogDate: { fontFamily: Fonts.sansRegular, fontSize: 15, color: Theme.textSecondary, marginTop: 2 },
  matchLogText: { fontFamily: Fonts.sansRegular, fontSize: 15, color: Theme.textSecondary, lineHeight: 21 },
  matchLogScore: { fontFamily: Fonts.sansBold, fontSize: 24, color: Theme.textPrimary },
  matchLogSection: { gap: 8, paddingTop: 10, borderTopWidth: 1, borderTopColor: Theme.divider },
  matchLogSectionLabel: { fontFamily: Fonts.sansBold, fontSize: 13, color: Theme.textSecondary, letterSpacing: 1 },
  matchChipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  matchChip: { borderRadius: 12, paddingHorizontal: 14, paddingVertical: 9 },
  matchChipStrength: { backgroundColor: 'rgba(46,204,113,0.10)', borderWidth: 1, borderColor: 'rgba(30,142,62,0.28)' },
  matchChipWeakness: { backgroundColor: 'rgba(231,76,60,0.08)', borderWidth: 1, borderColor: 'rgba(192,57,43,0.26)' },
  matchChipText: { fontFamily: Fonts.sansSemiBold, fontSize: 15 },
  matchChipStrengthText: { color: '#1E8E3E' },
  matchChipWeaknessText: { color: '#C0392B' },
  matchVideoLinkRow: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: Theme.cardTinted, borderRadius: 12, padding: 14 },
  matchVideoLinkText: { fontFamily: Fonts.sansSemiBold, fontSize: 16, color: Theme.eyebrowGreen },
  matchLoggedBy: { fontFamily: Fonts.sansRegular, fontSize: 13, color: Theme.textMuted, fontStyle: 'italic' },
  notesEditLink: { fontFamily: Fonts.sansSemiBold, fontSize: 16, color: Theme.eyebrowGreen },
  notesFieldLabel: { fontFamily: Fonts.sansSemiBold, fontSize: 15, color: Theme.textSecondary, marginTop: 6 },
  notesInput: { backgroundColor: Theme.cardTinted, borderRadius: 10, padding: 14, minHeight: 72, textAlignVertical: 'top', fontFamily: Fonts.sansRegular, fontSize: 17, color: Theme.textPrimary },
  notesEditorButtons: { flexDirection: 'row', gap: 10, justifyContent: 'flex-end', marginTop: 6 },
  notesCancelBtn: { paddingHorizontal: 18, paddingVertical: 12, borderRadius: 20 },
  notesCancelText: { fontFamily: Fonts.sansSemiBold, fontSize: 16, color: Theme.textSecondary },
  notesSaveBtn: { backgroundColor: Theme.eyebrowGreen, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 20 },
  notesSaveText: { fontFamily: Fonts.sansSemiBold, fontSize: 16, color: '#fff' },
  feedbackToggle: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingTop: 10, borderTopWidth: 1, borderTopColor: Theme.divider },
  feedbackToggleText: { flex: 1, fontFamily: Fonts.sansSemiBold, fontSize: 14, color: Theme.eyebrowGreen },
  feedbackThread: { gap: 8, paddingVertical: 6 },
  feedbackInputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  feedbackInput: { flex: 1, backgroundColor: Theme.cardTinted, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 10, fontFamily: Fonts.sansRegular, fontSize: 14, color: Theme.textPrimary, maxHeight: 100 },
  feedbackSendBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: Theme.eyebrowGreen, alignItems: 'center', justifyContent: 'center' },
  feedbackSendBtnDisabled: { opacity: 0.5 },
  switchChip: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: Theme.cardWhite, borderRadius: 24, paddingHorizontal: 14, paddingVertical: 10, borderWidth: 1, borderColor: Theme.divider },
  switchChipActive: { borderColor: Theme.eyebrowGreen, backgroundColor: '#E2EFAE' },
  switchAvatar: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: Theme.eyebrowGreen },
  switchChipText: { fontFamily: Fonts.sansSemiBold, fontSize: 14, color: Theme.textSecondary },
  switchChipTextActive: { color: Theme.textPrimary },
  unlinkText: { fontFamily: Fonts.sansSemiBold, fontSize: 13, color: '#FF6B6B' },
  managedBadge: { fontFamily: Fonts.sansSemiBold, fontSize: 12, color: Theme.eyebrowGreen, marginTop: 2 },
  useAsChildBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 },
  useAsChildText: { fontFamily: Fonts.sansSemiBold, fontSize: 13, color: Theme.eyebrowGreen },
  addChildModeRow: { flexDirection: 'row', gap: 10, marginTop: 14, marginBottom: 16 },
  addChildModeTab: { flex: 1, paddingVertical: 14, borderRadius: 14, backgroundColor: Theme.cardWhite, borderWidth: 1.5, borderColor: '#C9C6BB', alignItems: 'center' },
  addChildModeTabActive: { backgroundColor: Theme.eyebrowGreen, borderColor: Theme.eyebrowGreen },
  addChildModeText: { fontFamily: Fonts.sansBold, fontSize: 15, color: Theme.textSecondary, textAlign: 'center' },
  addChildModeTextActive: { color: '#FFFFFF' },
  addChildInput: {
    backgroundColor: Theme.background, borderRadius: 10, padding: 16, color: Theme.textPrimary,
    fontFamily: Fonts.sansRegular, fontSize: 16, marginBottom: 14,
    borderWidth: 1.5, borderColor: '#C9C6BB', width: '100%',
  },
  addChildHint: { fontFamily: Fonts.sansRegular, fontSize: 12, color: Theme.textMuted, marginTop: -6, marginBottom: 14 },
  noticeCard: { flexDirection: 'row', gap: 12, backgroundColor: Theme.cardTinted, borderRadius: 14, padding: 16, marginBottom: 16, alignItems: 'flex-start' },
  noticeText: { flex: 1, fontFamily: Fonts.sansRegular, fontSize: 14, color: Theme.textPrimary, lineHeight: 20 },
  pill: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 20, backgroundColor: Theme.cardWhite, borderWidth: 1, borderColor: Theme.divider },
  pillWrapRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 10 },
  pillActive: { backgroundColor: Theme.eyebrowGreen, borderColor: Theme.eyebrowGreen },
  pillText: { fontFamily: Fonts.sansSemiBold, fontSize: 14, color: Theme.textSecondary },
  pillTextActive: { color: '#FFFFFF' },
  // Coach pills stay dark-green-active (matches every other coach picker in
  // the app); day pills get their own lime-accent active color so the two
  // rows read as two distinct choices at a glance, not one long pill list.
  // Both sized up from the shared `pill` base (used elsewhere at its
  // smaller default) just for this Coach/Day picker.
  pillGroupLabel: { fontFamily: Fonts.sansBold, fontSize: 11, color: Theme.textMuted, letterSpacing: 1, marginBottom: 8 },
  reqPill: { paddingHorizontal: 18, paddingVertical: 13 },
  reqPillText: { fontSize: 16 },
  dayPillActive: { backgroundColor: Theme.limeAccent, borderColor: Theme.limeAccent },
  dayPillTextActive: { color: Theme.limeAccentDark },
  reportPaymentLink: { alignSelf: 'flex-end', marginTop: 16, paddingVertical: 9, paddingHorizontal: 18, borderRadius: 20, backgroundColor: Theme.limeAccent },
  reportPaymentLinkText: { fontFamily: Fonts.sansSemiBold, fontSize: 13, color: Theme.limeAccentDark },
  // Progress card — mirrors (tabs)/index.tsx's own Overview card structure,
  // with every font size bumped up a couple points for parent readability.
  sectionHeadline: { fontFamily: Fonts.serifMedium, fontSize: 26, color: Theme.textPrimary, marginTop: 4, marginBottom: 14 },
  progressCardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: Theme.cardWhite, borderRadius: 16, padding: 18, marginBottom: 22 },
  progressCardHeaderExpanded: { borderBottomLeftRadius: 0, borderBottomRightRadius: 0, marginBottom: 0 },
  progressHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  progressHeaderTitle: { fontFamily: Fonts.sansBold, fontSize: 19, color: Theme.textPrimary },
  progressHeaderRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  progressHeaderSub: { fontFamily: Fonts.sansRegular, fontSize: 15, color: Theme.textSecondary },
  progressCardBody: { backgroundColor: Theme.cardWhite, borderBottomLeftRadius: 16, borderBottomRightRadius: 16, paddingHorizontal: 18, paddingBottom: 18, marginBottom: 22, borderTopWidth: 1, borderTopColor: Theme.divider },
  progressTabRow: { flexDirection: 'row', gap: 8, paddingTop: 14, marginBottom: 16 },
  progressTab: { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 10, backgroundColor: Theme.background, borderWidth: 1, borderColor: Theme.divider },
  progressTabActive: { backgroundColor: '#D8F35C' },
  progressTabText: { fontFamily: Fonts.sansSemiBold, fontSize: 15, color: Theme.textSecondary },
  progressTabTextActive: { color: Theme.limeAccentDark },
  activityRangeRow: { flexDirection: 'row', gap: 6, marginBottom: 14 },
  activityRangePill: { flex: 1, alignItems: 'center', paddingVertical: 7, borderRadius: 8, backgroundColor: Theme.background },
  activityRangePillActive: { backgroundColor: Theme.limeAccentDark },
  activityRangePillText: { fontFamily: Fonts.sansSemiBold, fontSize: 13, color: Theme.textSecondary },
  activityRangePillTextActive: { color: '#FFFFFF' },
  progressSection: { gap: 10 },
  progressEmpty: { paddingVertical: 32, alignItems: 'center', gap: 10 },
  progressEmptyText: { fontFamily: Fonts.sansRegular, fontSize: 16, color: Theme.textSecondary, textAlign: 'center' },
  bestRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Theme.divider },
  bestIcon: { width: 34, height: 34, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  iconBadge: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  suggestionRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: Theme.background,
    borderRadius: 14, padding: 14, marginBottom: 10, width: '100%',
  },
  makeupBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#FDE7A8',
    borderRadius: 14, padding: 16, marginBottom: 16,
  },
  makeupBannerTitle: { fontFamily: Fonts.sansBold, fontSize: 15, color: '#8A6200' },
  makeupBannerSub: { fontFamily: Fonts.sansRegular, fontSize: 13, color: '#8A6200', marginTop: 2 },
  bestFitBadge: { backgroundColor: '#E2EFAE', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2 },
  bestFitBadgeText: { fontFamily: Fonts.sansBold, fontSize: 11, color: '#3B6D11' },
  bestName: { fontFamily: Fonts.sansSemiBold, flex: 1, fontSize: 17, color: Theme.textPrimary },
  bestStats: { flexDirection: 'row', gap: 12 },
  bestStat: { alignItems: 'center', minWidth: 32 },
  bestStatVal: { fontFamily: Fonts.sansBold, fontSize: 15, color: Theme.eyebrowGreen },
  bestStatLabel: { fontFamily: Fonts.sansRegular, fontSize: 13, color: Theme.textSecondary, marginTop: 1 },
  progressChartTitle: { fontFamily: Fonts.sansBold, fontSize: 13, color: Theme.textSecondary, letterSpacing: 1, marginBottom: 12 },
  weeklyChart: { flexDirection: 'row', alignItems: 'flex-end', gap: 5, height: 120 },
  weeklyCol: { flex: 1, alignItems: 'center', justifyContent: 'flex-end', gap: 4 },
  weeklyCount: { fontFamily: Fonts.sansSemiBold, fontSize: 13, color: Theme.textSecondary, height: 15 },
  weeklyBar: { width: '100%', borderRadius: 4 },
  weeklyLabel: { fontFamily: Fonts.sansSemiBold, fontSize: 13, color: Theme.textSecondary },
  weeklyLabelActive: { color: Theme.eyebrowGreen },
  catBreakRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  catBreakDot: { width: 8, height: 8, borderRadius: 4 },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  // Month calendar grid — mirrors (tabs)/calendar.tsx's own month view so
  // the parent's Calendar tab reads the same way the player's does, just
  // with private/group lesson dots instead of tournament/training/rest.
  monthNav: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, width: '100%' },
  monthArrow: { padding: 4 },
  monthTitle: { fontFamily: Fonts.serifMedium, fontSize: 24, color: Theme.textPrimary },
  dayHeaderRow: { flexDirection: 'row', marginBottom: 10, width: '100%' },
  dayHeaderCell: { flex: 1, alignItems: 'center' },
  dayHeaderText: { fontFamily: Fonts.sansSemiBold, fontSize: 14, color: Theme.textSecondary },
  calendarGrid: { width: '100%' },
  calendarRow: { flexDirection: 'row' },
  dayCell: { flex: 1, alignItems: 'center', paddingVertical: 11, minHeight: 62 },
  dayCellSelected: { backgroundColor: Theme.limeAccent, borderRadius: 12 },
  dayCellToday: { borderWidth: 1.5, borderColor: Theme.eyebrowGreen, borderRadius: 12 },
  dayCellText: { fontFamily: Fonts.sansSemiBold, fontSize: 17, color: Theme.textPrimary },
  dayCellTextSelected: { color: Theme.limeAccentDark },
  dayCellTextToday: { color: Theme.eyebrowGreen },
  // Tournament range picked inline on this grid (see markingTournament) —
  // mid-range days get a soft tint, the two tapped edge days get a solid
  // fill so the picked start/end read clearly at a glance.
  dayCellRangeMid: { backgroundColor: '#FADBD8', borderRadius: 12 },
  dayCellRangeEdge: { backgroundColor: LESSON_DOT_COLOR.tournament, borderRadius: 12 },
  dayCellTextRangeEdge: { color: '#FFFFFF' },
  dotRow: { flexDirection: 'row', gap: 4, marginTop: 5 },
  eventDot: { width: 7, height: 7, borderRadius: 3.5 },
  catBreakLabel: { fontFamily: Fonts.sansRegular, width: 78, fontSize: 14, color: Theme.textSecondary },
  catBreakTrack: { flex: 1, height: 6, backgroundColor: Theme.background, borderRadius: 3, overflow: 'hidden' },
  catBreakFill: { height: '100%', borderRadius: 3 },
  catBreakCount: { fontFamily: Fonts.sansSemiBold, width: 26, fontSize: 14, color: Theme.textPrimary, textAlign: 'right' },
  rowLine: { paddingVertical: 10, borderTopWidth: 1, borderTopColor: Theme.divider, width: '100%' },
  rowLineTitle: { fontFamily: Fonts.sansSemiBold, fontSize: 16, color: Theme.textPrimary },
  rowLineSub: { fontFamily: Fonts.sansRegular, fontSize: 14, color: Theme.textSecondary, marginTop: 2 },
  journalWeekHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10, marginTop: 8 },
  journalWeekHeader: { fontFamily: Fonts.sansBold, fontSize: 14, color: Theme.eyebrowGreen, letterSpacing: 0.5, textTransform: 'uppercase' },
  journalCard: { paddingVertical: 16, borderTopWidth: 1, borderTopColor: Theme.divider, width: '100%', gap: 6 },
  journalCardTopRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, width: '100%' },
  journalCardEyebrow: { fontFamily: Fonts.sansBold, fontSize: 12, color: Theme.textSecondary, letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 4 },
  journalCardTitle: { fontFamily: Fonts.sansSemiBold, fontSize: 17, color: Theme.textPrimary, lineHeight: 23 },
  attSwitchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width: '100%' },
  attSwitchLabel: { fontFamily: Fonts.sansBold, fontSize: 17 },
  miniActionBtn: { alignSelf: 'flex-start', backgroundColor: Theme.limeAccent, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 7, marginTop: 8 },
  miniActionBtnText: { fontFamily: Fonts.sansBold, fontSize: 13, color: Theme.limeAccentDark },
  miniDeclineBtn: { alignSelf: 'flex-start', backgroundColor: Theme.cardWhite, borderWidth: 1, borderColor: Theme.divider, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 7, marginTop: 8 },
  miniDeclineBtnText: { fontFamily: Fonts.sansSemiBold, fontSize: 13, color: Theme.textSecondary },
  confirmBtn: { backgroundColor: Theme.eyebrowGreen, borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 20 },
  confirmBtnText: { fontFamily: Fonts.sansBold, fontSize: 15, color: '#fff' },
  activityRow: { flexDirection: 'row', gap: 12, alignItems: 'center', paddingVertical: 13, borderTopWidth: 1, borderTopColor: Theme.divider, width: '100%' },
  slotGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  slotBtn: { width: '22%', backgroundColor: Theme.cardTinted, borderRadius: 10, paddingVertical: 10, alignItems: 'center' },
  slotBtnBusy: { backgroundColor: Theme.divider, opacity: 0.6 },
  slotBtnText: { fontFamily: Fonts.sansBold, fontSize: 14, color: Theme.eyebrowGreen },
  slotBtnStatus: { fontFamily: Fonts.sansRegular, fontSize: 10, color: Theme.eyebrowGreen, marginTop: 2 },
  slotBtnTextBusy: { color: Theme.textMuted },
  signOutBtn: { paddingVertical: 12, alignItems: 'center', marginTop: 20 },
  signOutText: { fontFamily: Fonts.sansSemiBold, fontSize: 15, color: '#FF6B6B' },
  profileHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  profileAvatar: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', backgroundColor: Theme.eyebrowGreen },
  profileAvatarText: { fontFamily: Fonts.sansBold, fontSize: 22, color: '#FFFFFF' },
  profileName: { fontFamily: Fonts.sansBold, fontSize: 19, color: Theme.textPrimary },
  profileEmail: { fontFamily: Fonts.sansRegular, fontSize: 14, color: Theme.textSecondary, marginTop: 2 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: Theme.background, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, maxHeight: '85%' },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 },
  modalTitle: { fontFamily: Fonts.serifMedium, fontSize: 22, color: Theme.textPrimary },
});
