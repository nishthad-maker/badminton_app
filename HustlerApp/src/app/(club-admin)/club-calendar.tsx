import { View, StyleSheet, ScrollView, TouchableOpacity, Modal, useWindowDimensions } from 'react-native';
import { Text } from '@/components/Text';
import { TextInput } from '@/components/TextInput';
import { Icon } from '@/components/icons/Icon';
import { MiniDatePicker, MiniDateRangePicker } from '@/components/MiniDatePicker';
import { TimePicker } from '@/components/TimePicker';
import { CoachDayGrid, CoachDayBlock } from '@/components/CoachDayGrid';
import { WeeklyGrid, GridBlock } from '@/components/WeeklyGrid';
import { SearchInput } from '@/components/SearchInput';
import { useState, useCallback, useEffect } from 'react';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Theme, Fonts, CategoryTheme } from '@/constants/theme';
import { supabase } from '../../lib/supabase';
import { showAlert, showConfirm } from '../../lib/ui';
import { getMyClub, getClubHours, searchClubRosterPlayers, PlayerSearchResult } from '../../lib/club';
import { colorForId } from '../../lib/colors';
import { getClubCourts, Court } from '../../lib/courts';
import { getGroupLessons, getRoster, addTimeSlot, updateTimeSlot, deleteTimeSlot, GroupLesson, RosterPlayer } from '../../lib/lessons';
import { getClubMaintenanceBlocksForDate, MaintenanceBlock } from '../../lib/maintenanceBlocks';
import { getRentalsForDate, createCourtRental, CourtRental } from '../../lib/rentals';
import { DAY_NAMES, formatTime12h, formatDateLong, timeToMinutes, firstName, localDateStr } from '../../lib/scheduling';
import { notifyWaitlistPromoted, notifyScheduleRequestApproved, notifyScheduleRequestRejected } from '../../lib/notifications';
import {
  requestLessonCancellation, getPendingCancellationRequests, approveCancellationRequest, declineCancellationRequest,
  getMyCancellationRequests, withdrawCancellationRequest, CancellationRequest,
} from '../../lib/cancellationRequests';
import { NoClubPrompt } from '@/components/NoClubPrompt';
import { SetupLockedPlaceholder } from '@/components/SetupLockedPlaceholder';
import { CoachTimeOffModal } from '@/components/CoachTimeOffModal';
import { getPlayerPrivateLessonPlans, addSessionsToPlan, PrivateLessonPlan } from '../../lib/privateLessonPlans';

const todayStr = () => localDateStr(new Date());

// Fixed, consistent colors for the day-grid blocks (both By court and By
// coach views) — a lesson's TYPE reads the same everywhere rather than
// varying per-coach. Pulled straight from the app's own category palette
// (constants/theme.ts CategoryTheme) instead of ad hoc bright colors, so the
// grid reads as "on brand" rather than a random rainbow: private is always
// blue, group is always amber (still a clear contrast against private,
// without the alarm-red of a raw red). Open uses the one category pair
// (recovery/purple) nothing else on this screen uses — footwork's light
// green is reserved for the day-strip's selected-day highlight instead, so
// the two don't read as the same color for different meanings.
const PRIVATE_BLOCK_COLOR = CategoryTheme.strength;
const GROUP_BLOCK_COLOR = CategoryTheme.endurance;
const OPEN_BLOCK_COLOR = CategoryTheme.recovery;
// Maintenance/rental blocks aren't part of the 4-entry CategoryTheme
// palette (all 4 are already spoken for on this screen) — ad hoc literals,
// scoped to just this screen.
const MAINTENANCE_BLOCK_COLOR = { bg: '#E4E1DC', fg: '#5C594F' };
const RENTAL_BLOCK_COLOR = { bg: '#E6D9F5', fg: '#6B3FA0' };

const startOfWeek = (d: Date) => {
  const copy = new Date(d);
  copy.setDate(copy.getDate() - copy.getDay());
  copy.setHours(0, 0, 0, 0);
  return copy;
};

const minutesToTime = (min: number) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

// Fallback window when a club hasn't set its own open_time/close_time yet
// (club_settings, editable in Club Settings) — the real hours are loaded
// into dayWindowStart/dayWindowEnd state in load() below.
const DEFAULT_DAY_WINDOW_START_MIN = 8 * 60;
const DEFAULT_DAY_WINDOW_END_MIN = 20 * 60;
// Gaps shorter than this aren't worth surfacing as a bookable "Open" card.
const MIN_OPEN_GAP_MINUTES = 30;

type Coach = { id: string; full_name: string };

type LessonEntry = {
  id: string; player_id: string; player_name: string; day_of_week: number; start_time: string; end_time: string;
  valid_until: string | null; coach_id: string; coach_name: string; court_id: string | null; court_name: string | null;
  plan_id: string | null;
};
type WaitEntry = { id: string; player_id: string; player_name: string; priority: number; status: string; offered_at: string | null; expires_at: string | null; preferred_note: string | null };
type ScheduleRequestEntry = {
  id: string; child_id: string; child_name: string; parent_id: string; day_of_week: number; start_time: string; end_time: string;
  replaces_schedule_assignment_id: string | null;
};

// embedded: true when rendered inside another screen (the coach's own
// Schedule tab) rather than as its own (club-admin) route — skips the
// redundant "Calendar" title/top padding since the host screen already
// supplies its own header above this.
// lockToSelf: true for the coach's own "[Name]" sub-tab — forces the
// by-coach view onto the logged-in coach with no coach picker and no way to
// switch to the club-wide view, since this instance of the screen is only
// ever meant to show one person's own day.
// restrictBooking: 'lessons' when rendered inside training.tsx's Calendar
// tab — the "Book" flow there only offers Private/Group; Member/rental
// booking now lives on its own screen (rental.tsx). Rentals still DISPLAY
// here for context (a coach shouldn't think a rented-out court is free),
// just can't be created from this screen anymore.
export default function ClubCalendarScreen({ embedded = false, lockToSelf = false, restrictBooking }: { embedded?: boolean; lockToSelf?: boolean; restrictBooking?: 'lessons' } = {}) {
  const params = useLocalSearchParams<{ view?: string; coachId?: string }>();

  // Both grid modes below only ever show one column at a time (one court, or
  // one coach) — so instead of the multi-column default width, stretch that
  // single column to fill the actual screen instead of leaving dead space.
  const { width: windowWidth } = useWindowDimensions();
  const gridColumnWidth = Math.max(240, windowWidth - 50 /* hour gutter */ - 48 /* screen padding */ - 8);

  const [hasClub, setHasClub] = useState(true);
  const [onboardingCompleted, setOnboardingCompleted] = useState(true);
  const [clubId, setClubId] = useState<string | null>(null);
  const [myId, setMyId] = useState<string | null>(null);
  const [isOwner, setIsOwner] = useState(false);
  const [canEditOthers, setCanEditOthers] = useState(false);
  const [coaches, setCoaches] = useState<Coach[]>([]);
  const [courts, setCourts] = useState<Court[]>([]);
  const [groupLessons, setGroupLessons] = useState<GroupLesson[]>([]);
  const [allLessons, setAllLessons] = useState<LessonEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  // By Coach view
  const [coachViewMode, setCoachViewMode] = useState<'court' | 'coach' | 'week'>('court');
  const [selectedCourtId, setSelectedCourtId] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [dayCancellations, setDayCancellations] = useState<Record<string, string>>({}); // schedule_assignment_id -> reason, for the selected date
  const [selectedCoachId, setSelectedCoachId] = useState<string | null>(null);
  const [timeOffModalVisible, setTimeOffModalVisible] = useState(false);
  const [waitlist, setWaitlist] = useState<WaitEntry[]>([]);
  const [claimHours, setClaimHours] = useState(24);
  const [scheduleRequests, setScheduleRequests] = useState<ScheduleRequestEntry[]>([]);
  // Manage Lessons/Pending Requests/Waitlist sections — requests and the
  // waitlist start open since they're time-sensitive (someone's waiting on a
  // response); Manage Lessons starts collapsed since it's just upkeep and can
  // run long, and shouldn't push the other two (or the day grid) further down.
  const [manageExpanded, setManageExpanded] = useState(false);
  const [requestsExpanded, setRequestsExpanded] = useState(true);
  const [waitlistExpanded, setWaitlistExpanded] = useState(true);

  // Group lesson roster modal (opened by tapping a group block/card)
  const [rosterTierId, setRosterTierId] = useState<string | null>(null);
  const [roster, setRoster] = useState<RosterPlayer[]>([]);
  // Which lesson_time_slots row the roster modal was opened FROM (tapping a
  // specific day/time block, not the "Group Lessons" list) — lets the modal
  // offer reschedule/remove for that one slot. Null when opened generically.
  const [rosterSlotId, setRosterSlotId] = useState<string | null>(null);
  const [slotRescheduleOpen, setSlotRescheduleOpen] = useState(false);
  const [slotRescheduleDay, setSlotRescheduleDay] = useState(1);
  const [slotRescheduleStart, setSlotRescheduleStart] = useState('16:00');
  const [slotRescheduleEnd, setSlotRescheduleEnd] = useState('17:00');
  const [slotRescheduleSaving, setSlotRescheduleSaving] = useState(false);

  // Tournament block modal
  const [blockLesson, setBlockLesson] = useState<LessonEntry | null>(null);
  const [blockStart, setBlockStart] = useState<string | null>(null);
  const [blockEnd, setBlockEnd] = useState<string | null>(null);

  // Cancel one date modal — also doubles as the "request a cancellation"
  // modal for a plain staff coach on their own day (see canFullyManage).
  const [cancelLesson, setCancelLesson] = useState<LessonEntry | null>(null);
  const [cancelDate, setCancelDate] = useState<string | null>(null);
  const [cancelNote, setCancelNote] = useState('');
  const [submittingCancel, setSubmittingCancel] = useState(false);
  const [myCancelRequests, setMyCancelRequests] = useState<CancellationRequest[]>([]);
  const [pendingCancelRequests, setPendingCancelRequests] = useState<CancellationRequest[]>([]);

  // Manage-lesson modal — opened by tapping a private lesson block directly
  // (Courts or Coaches view), instead of the old read-only alert. Reuses
  // cancelLesson/endLesson for two of its three actions; "Reschedule" is new.
  const [manageLesson, setManageLesson] = useState<LessonEntry | null>(null);
  const [manageLessonMode, setManageLessonMode] = useState<'view' | 'reschedule'>('view');
  const [rescheduleCoachId, setRescheduleCoachId] = useState<string | null>(null);
  const [rescheduleDay, setRescheduleDay] = useState(1);
  const [rescheduleStart, setRescheduleStart] = useState('16:00');
  const [rescheduleEnd, setRescheduleEnd] = useState('17:00');
  const [reschedulingSaving, setReschedulingSaving] = useState(false);
  // The plan-based session budget behind the tapped lesson, if any (null for
  // a one-off "just this week" booking, which has no plan/budget concept).
  const [manageLessonPlan, setManageLessonPlan] = useState<PrivateLessonPlan | null>(null);
  const [manageTopUpOpen, setManageTopUpOpen] = useState(false);
  const [manageTopUpAmount, setManageTopUpAmount] = useState('5');
  const [manageTopUpSaving, setManageTopUpSaving] = useState(false);

  // Promote-from-waitlist modal
  const [promoteEntry, setPromoteEntry] = useState<WaitEntry | null>(null);
  const [promoteDay, setPromoteDay] = useState(1);
  const [promoteStart, setPromoteStart] = useState('16:00');
  const [promoteEnd, setPromoteEnd] = useState('17:00');

  // Book-an-open-slot modal (tapped from an "Open" card in the day agenda) —
  // courtIds can have more than one when several courts share the exact same
  // open window and were merged into a single agenda row; bookCourtId is
  // which one the pending booking will actually use.
  const [bookSlot, setBookSlot] = useState<{ courtIds: string[]; courtNames: string[]; freeCoachIds: string[] } | null>(null);
  const [bookCourtId, setBookCourtId] = useState<string | null>(null);
  const [bookMode, setBookMode] = useState<'choose' | 'private' | 'group' | 'rental'>('choose');
  const [bookStart, setBookStart] = useState('16:00');
  const [bookEnd, setBookEnd] = useState('17:00');
  const [bookCoachId, setBookCoachId] = useState<string | null>(null);
  const [bookPlayerQuery, setBookPlayerQuery] = useState('');
  const [bookPlayerResults, setBookPlayerResults] = useState<PlayerSearchResult[]>([]);
  const [bookPlayer, setBookPlayer] = useState<PlayerSearchResult | null>(null);
  const [bookGroupLessonId, setBookGroupLessonId] = useState<string | null>(null);
  const [renterName, setRenterName] = useState('');
  const [renterEmail, setRenterEmail] = useState('');
  const [renterPhone, setRenterPhone] = useState('');
  const [bookSaving, setBookSaving] = useState(false);

  // Maintenance blocks + rentals fold into the same "not open" gap-walk as
  // lessons — both are per-date, so they're fetched alongside
  // dayCancellations rather than club-wide.
  const [dayMaintenanceBlocks, setDayMaintenanceBlocks] = useState<MaintenanceBlock[]>([]);
  const [dayRentals, setDayRentals] = useState<CourtRental[]>([]);
  // Real club hours replace the old hardcoded 8am-8pm window, falling back
  // to it when a club hasn't set its own hours yet.
  const [dayWindowStart, setDayWindowStart] = useState(DEFAULT_DAY_WINDOW_START_MIN);
  const [dayWindowEnd, setDayWindowEnd] = useState(DEFAULT_DAY_WINDOW_END_MIN);

  const load = async () => {
    const club = await getMyClub();
    if (!club) { setHasClub(false); setLoading(false); return; }
    setHasClub(true);
    setClubId(club.clubId);
    setIsOwner(club.role === 'owner');
    setCanEditOthers(club.canEditOtherSchedules);
    setOnboardingCompleted(club.onboardingCompleted);
    if (!club.onboardingCompleted) { setLoading(false); return; }

    const { data: { session } } = await supabase.auth.getSession();
    const me = session?.user.id ?? null;
    setMyId(me);

    // A plain id lookup rather than an embedded profiles(full_name) join —
    // avoids relying on the embed resolving correctly (see the same fix on
    // getChildLessons; an embed silently returning null for one row while
    // resolving fine for another isn't worth chasing further, a second
    // query by id always works regardless of the cause).
    // The owner is included explicitly (via clubs.owner_id) rather than
    // relying solely on their own club_coaches row — an owner can teach
    // private lessons too, and should show up here even if that row is
    // somehow missing or inactive.
    const [{ data: clubRow }, { data: coachRows }] = await Promise.all([
      supabase.from('clubs').select('owner_id').eq('id', club.clubId).single(),
      supabase.from('club_coaches').select('coach_id').eq('club_id', club.clubId).eq('status', 'active'),
    ]);
    const coachIds = [...new Set([
      ...(clubRow?.owner_id ? [clubRow.owner_id] : []),
      ...(coachRows ?? []).map((c: any) => c.coach_id),
    ])];
    const nameById: Record<string, string> = {};
    if (coachIds.length) {
      const { data: coachProfiles } = await supabase.from('profiles').select('id, full_name').in('id', coachIds);
      (coachProfiles ?? []).forEach((p: any) => { nameById[p.id] = p.full_name ?? 'Coach'; });
    }
    const coachList = coachIds.map((id: string) => ({ id, full_name: nameById[id] ?? 'Coach' }));
    setCoaches(coachList);
    setSelectedCoachId((prev) => prev ?? me ?? coachList[0]?.id ?? null);

    const clubCourts = await getClubCourts(club.clubId);
    setCourts(clubCourts);
    setSelectedCourtId((prev) => prev ?? clubCourts[0]?.id ?? null);
    setGroupLessons(await getGroupLessons(club.clubId));

    const hours = await getClubHours(club.clubId);
    setDayWindowStart(hours.openTime ? timeToMinutes(hours.openTime) : DEFAULT_DAY_WINDOW_START_MIN);
    setDayWindowEnd(hours.closeTime ? timeToMinutes(hours.closeTime) : DEFAULT_DAY_WINDOW_END_MIN);

    const { data: lessonRows } = await supabase
      .from('schedule_assignments')
      .select('id, player_id, day_of_week, start_time, end_time, valid_until, coach_id, court_id, plan_id, profiles!schedule_assignments_player_id_fkey(full_name), coach:profiles!schedule_assignments_coach_id_fkey(full_name), courts(name)')
      .eq('club_id', club.clubId);
    setAllLessons((lessonRows ?? []).map((l: any) => ({
      id: l.id, player_id: l.player_id, player_name: l.profiles?.full_name ?? 'Player',
      day_of_week: l.day_of_week, start_time: l.start_time, end_time: l.end_time, valid_until: l.valid_until,
      coach_id: l.coach_id, coach_name: l.coach?.full_name ?? 'Coach', court_id: l.court_id, court_name: l.courts?.name ?? null,
      plan_id: l.plan_id,
    })));

    setLoading(false);
  };

  useFocusEffect(useCallback(() => { load(); }, []));

  // Deep-link from Dashboard's Coaches chip row (a specific coachId) or its
  // Pending Actions banner (just "go to the per-coach view", no coach
  // specified — falls back to whichever coach load() already auto-selected).
  useEffect(() => {
    if (params.coachId) { setSelectedCoachId(params.coachId); setCoachViewMode('coach'); }
    else if (params.view === 'coach') { setCoachViewMode('coach'); }
  }, [params.coachId, params.view]);

  // lockToSelf pins this instance to the logged-in coach's own day — keep it
  // that way even if something upstream (e.g. the deep-link effect above)
  // would otherwise change it.
  useEffect(() => {
    if (lockToSelf && myId) { setSelectedCoachId(myId); setCoachViewMode('coach'); }
  }, [lockToSelf, myId]);

  const loadWaitlist = useCallback(async () => {
    if (!clubId || !selectedCoachId) { setWaitlist([]); return; }
    const { data: settingsRow } = await supabase.from('club_settings').select('waitlist_claim_hours').eq('club_id', clubId).single();
    setClaimHours(settingsRow?.waitlist_claim_hours ?? 24);
    const { data: waitRows } = await supabase
      .from('waitlist_entries')
      .select('id, player_id, priority, status, offered_at, expires_at, preferred_note, profiles!waitlist_entries_player_id_fkey(full_name)')
      .eq('club_id', clubId)
      .eq('coach_id', selectedCoachId)
      .in('status', ['waiting', 'offered'])
      .order('priority', { ascending: true });
    setWaitlist((waitRows ?? []).map((w: any) => ({
      id: w.id, player_id: w.player_id, player_name: w.profiles?.full_name ?? 'Player',
      priority: w.priority, status: w.status, offered_at: w.offered_at, expires_at: w.expires_at,
      preferred_note: w.preferred_note ?? null,
    })));
  }, [clubId, selectedCoachId]);

  useEffect(() => { loadWaitlist(); }, [loadWaitlist]);

  const loadScheduleRequests = useCallback(async () => {
    if (!clubId || !selectedCoachId) { setScheduleRequests([]); return; }
    const { data } = await supabase
      .from('schedule_requests')
      .select('id, child_id, parent_id, day_of_week, start_time, end_time, replaces_schedule_assignment_id, profiles!schedule_requests_child_id_fkey(full_name)')
      .eq('club_id', clubId)
      .eq('coach_id', selectedCoachId)
      .eq('status', 'pending')
      .order('created_at', { ascending: true });
    setScheduleRequests((data ?? []).map((r: any) => ({
      id: r.id, child_id: r.child_id, parent_id: r.parent_id, child_name: r.profiles?.full_name ?? 'Player',
      day_of_week: r.day_of_week, start_time: r.start_time, end_time: r.end_time,
      replaces_schedule_assignment_id: r.replaces_schedule_assignment_id ?? null,
    })));
  }, [clubId, selectedCoachId]);

  useEffect(() => { loadScheduleRequests(); }, [loadScheduleRequests]);

  const loadCancelRequests = useCallback(async () => {
    if (!clubId || !selectedCoachId) { setPendingCancelRequests([]); setMyCancelRequests([]); return; }
    if (isOwner || canEditOthers) {
      setPendingCancelRequests(await getPendingCancellationRequests(clubId, selectedCoachId));
    } else {
      setPendingCancelRequests([]);
    }
    if (selectedCoachId === myId) {
      setMyCancelRequests(await getMyCancellationRequests(myId, clubId));
    } else {
      setMyCancelRequests([]);
    }
  }, [clubId, selectedCoachId, myId, isOwner, canEditOthers]);

  useEffect(() => { loadCancelRequests(); }, [loadCancelRequests]);

  // Per-date cancellation status for the day-agenda's "Confirmed"/"Cancelled"
  // pill — schedule_assignments are recurring templates with no per-date
  // state of their own, so this is read from schedule_exceptions (the same
  // table the existing "Cancel One Date" action writes to) for just the
  // selected date's private lessons.
  useEffect(() => {
    const dateStr = localDateStr(selectedDate);
    const dayOfWeek = selectedDate.getDay();
    const ids = allLessons.filter((l) => l.day_of_week === dayOfWeek).map((l) => l.id);
    if (ids.length === 0) { setDayCancellations({}); return; }
    supabase
      .from('schedule_exceptions')
      .select('schedule_assignment_id, reason')
      .eq('date', dateStr)
      .in('schedule_assignment_id', ids)
      .then(({ data }) => {
        const map: Record<string, string> = {};
        (data ?? []).forEach((e: any) => { map[e.schedule_assignment_id] = e.reason; });
        setDayCancellations(map);
      });
  }, [selectedDate, allLessons]);

  // Maintenance blocks + rentals are both single-date rows (not recurring
  // templates like lessons), so they're refetched per selected date rather
  // than pulled club-wide in load() above.
  useEffect(() => {
    if (!clubId) { setDayMaintenanceBlocks([]); setDayRentals([]); return; }
    const dateStr = localDateStr(selectedDate);
    getClubMaintenanceBlocksForDate(clubId, dateStr).then(setDayMaintenanceBlocks);
    getRentalsForDate(clubId, dateStr).then(setDayRentals);
  }, [clubId, selectedDate]);

  const endLesson = (lesson: LessonEntry) => {
    showConfirm('End this lesson?', `Stop ${firstName(lesson.player_name)}'s recurring lesson entirely?`, async () => {
      await supabase.from('schedule_assignments').delete().eq('id', lesson.id);
      load();
    });
  };

  const openManageLesson = async (lesson: LessonEntry) => {
    setManageLesson(lesson);
    setManageLessonMode('view');
    setRescheduleCoachId(lesson.coach_id);
    setRescheduleDay(lesson.day_of_week);
    setRescheduleStart(lesson.start_time.slice(0, 5));
    setRescheduleEnd(lesson.end_time.slice(0, 5));
    setManageLessonPlan(null);
    setManageTopUpOpen(false);
    if (lesson.plan_id && clubId) {
      const plans = await getPlayerPrivateLessonPlans(clubId, lesson.player_id);
      setManageLessonPlan(plans.find((p) => p.id === lesson.plan_id) ?? null);
    }
  };

  const closeManageLesson = () => {
    setManageLesson(null);
    setManageLessonMode('view');
    setManageLessonPlan(null);
    setManageTopUpOpen(false);
  };

  const submitManageTopUp = async () => {
    if (!manageLessonPlan) return;
    const n = parseInt(manageTopUpAmount, 10);
    if (!Number.isFinite(n) || n <= 0) { showAlert('Invalid amount', 'Enter how many sessions to add.'); return; }
    setManageTopUpSaving(true);
    const res = await addSessionsToPlan(manageLessonPlan.id, n);
    setManageTopUpSaving(false);
    if (!res.ok) { showAlert('Error', res.message ?? 'Could not add sessions.'); return; }
    setManageTopUpOpen(false);
    setManageTopUpAmount('5');
    if (clubId && manageLesson) {
      const plans = await getPlayerPrivateLessonPlans(clubId, manageLesson.player_id);
      setManageLessonPlan(plans.find((p) => p.id === manageLessonPlan.id) ?? null);
    }
    load();
  };

  // A permanent edit to the recurring template (coach/day/time) — not a
  // one-off exception, which is what "Cancel This Date" (the existing
  // cancelLesson flow) is for.
  const submitReschedule = async () => {
    if (!manageLesson || !rescheduleCoachId) { showAlert('Missing coach', 'Pick a coach.'); return; }
    if (!rescheduleStart || !rescheduleEnd || rescheduleStart >= rescheduleEnd) { showAlert('Invalid time', 'Pick a start and end time, with end after start.'); return; }
    setReschedulingSaving(true);
    const { error } = await supabase.from('schedule_assignments').update({
      coach_id: rescheduleCoachId, day_of_week: rescheduleDay, start_time: rescheduleStart, end_time: rescheduleEnd,
    }).eq('id', manageLesson.id);
    setReschedulingSaving(false);
    if (error) { showAlert('Error', 'Could not reschedule that lesson.'); return; }
    closeManageLesson();
    load();
  };

  const closeCancelModal = () => {
    setCancelLesson(null);
    setCancelDate(null);
    setCancelNote('');
  };

  const submitCancelDate = async () => {
    if (!cancelLesson || !cancelDate) return;
    if (canFullyManage) {
      await supabase.from('schedule_exceptions').insert({ schedule_assignment_id: cancelLesson.id, date: cancelDate, reason: 'cancelled' });
      closeCancelModal();
      showAlert('Cancelled', `${firstName(cancelLesson.player_name)}'s lesson on ${formatDateLong(cancelDate)} was cancelled.`);
      load();
      return;
    }
    if (!myId || !clubId) return;
    setSubmittingCancel(true);
    const res = await requestLessonCancellation({
      scheduleAssignmentId: cancelLesson.id, coachId: myId, coachName: coaches.find((c) => c.id === myId)?.full_name ?? 'Your coach',
      clubId, cancelDate, note: cancelNote,
    });
    setSubmittingCancel(false);
    if (!res.ok) { showAlert('Error', res.message || 'Could not submit that request.'); return; }
    closeCancelModal();
    showAlert('Sent to your club', `Your request to cancel ${formatDateLong(cancelDate)} is waiting on approval.`);
    loadCancelRequests();
  };

  const approveCancelReq = (request: CancellationRequest, label: string) => {
    showConfirm('Approve this cancellation?', `${label} on ${formatDateLong(request.cancelDate)} will be marked cancelled.`, async () => {
      const res = await approveCancellationRequest(request, label);
      if (!res.ok) { showAlert('Error', 'Could not approve this request.'); return; }
      loadCancelRequests();
      load();
    });
  };

  const declineCancelReq = (request: CancellationRequest, label: string) => {
    showConfirm('Decline this cancellation?', `${label} on ${formatDateLong(request.cancelDate)} will stay on the schedule.`, async () => {
      const res = await declineCancellationRequest(request, label);
      if (!res.ok) { showAlert('Error', 'Could not decline this request.'); return; }
      loadCancelRequests();
    });
  };

  const withdrawMyCancelReq = (request: CancellationRequest) => {
    showConfirm('Withdraw this request?', 'Your club will no longer see this cancellation request.', async () => {
      const res = await withdrawCancellationRequest(request.id);
      if (!res.ok) { showAlert('Error', 'Could not withdraw this request.'); return; }
      loadCancelRequests();
    });
  };

  const submitTournamentBlock = async () => {
    if (!blockLesson || !blockStart || !blockEnd) { showAlert('Missing dates', 'Pick a start and end date.'); return; }
    if (blockEnd < blockStart) { showAlert('Invalid range', 'End date must be after the start date.'); return; }
    const { error } = await supabase.from('tournament_blocks').insert({ player_id: blockLesson.player_id, start_date: blockStart, end_date: blockEnd });
    if (error) { showAlert('Error', 'Could not create the tournament block.'); return; }
    setBlockLesson(null);
    setBlockStart(null);
    setBlockEnd(null);
    showAlert('Blocked', `${firstName(blockLesson.player_name)}'s lessons in that range were marked as tournament exceptions, with makeup credits created automatically.`);
  };

  const reorderWaitlist = async (index: number, direction: -1 | 1) => {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= waitlist.length) return;
    const a = waitlist[index];
    const b = waitlist[targetIndex];
    setBusyId(a.id);
    await Promise.all([
      supabase.from('waitlist_entries').update({ priority: b.priority }).eq('id', a.id),
      supabase.from('waitlist_entries').update({ priority: a.priority }).eq('id', b.id),
    ]);
    setBusyId(null);
    loadWaitlist();
  };

  const offerSlot = async (entry: WaitEntry) => {
    setBusyId(entry.id);
    const expiresAt = new Date(Date.now() + claimHours * 60 * 60 * 1000).toISOString();
    await supabase.from('waitlist_entries').update({ status: 'offered', offered_at: new Date().toISOString(), expires_at: expiresAt }).eq('id', entry.id);
    setBusyId(null);
    loadWaitlist();
  };

  const removeFromWaitlist = (entry: WaitEntry) => {
    showConfirm('Remove from waitlist?', `Remove ${firstName(entry.player_name)} from the waitlist?`, async () => {
      await supabase.from('waitlist_entries').delete().eq('id', entry.id);
      loadWaitlist();
    });
  };

  const openPromote = (entry: WaitEntry) => {
    setPromoteEntry(entry);
    setPromoteDay(1);
    setPromoteStart('16:00');
    setPromoteEnd('17:00');
  };

  const submitPromote = async () => {
    if (!clubId || !selectedCoachId || !promoteEntry) return;
    const { error } = await supabase.from('schedule_assignments').insert({
      club_id: clubId,
      player_id: promoteEntry.player_id,
      coach_id: selectedCoachId,
      day_of_week: promoteDay,
      start_time: promoteStart.trim(),
      end_time: promoteEnd.trim(),
      valid_from: todayStr(),
    });
    if (error) { showAlert('Error', 'Could not create the lesson slot.'); return; }
    await supabase.from('waitlist_entries').update({ status: 'converted' }).eq('id', promoteEntry.id);
    await notifyWaitlistPromoted(promoteEntry.player_id, 'a private lesson slot');
    setPromoteEntry(null);
    load();
  };

  const isExpired = (entry: WaitEntry) => entry.status === 'offered' && !!entry.expires_at && entry.expires_at < new Date().toISOString();

  const approveScheduleRequest = async (request: ScheduleRequestEntry) => {
    if (!clubId || !selectedCoachId) return;
    setBusyId(request.id);
    // Atomic RPC: insert the new lesson, drop the one it replaces, and mark
    // the request approved all in one transaction — see
    // 20260805160000_atomic_schedule_request_approval.sql for why this used
    // to be three separate unguarded calls and what that broke.
    const { error } = await supabase.rpc('approve_schedule_request', { p_request_id: request.id, p_coach_id: selectedCoachId });
    if (error) {
      setBusyId(null);
      showAlert('Error', 'Could not create the lesson. Please try again.');
      return;
    }
    await notifyScheduleRequestApproved(request.parent_id, request.child_name, `${DAY_NAMES[request.day_of_week]} ${formatTime12h(request.start_time)}–${formatTime12h(request.end_time)}`);
    setBusyId(null);
    loadScheduleRequests();
    load();
  };

  const rejectScheduleRequest = (request: ScheduleRequestEntry) => {
    showConfirm('Decline this request?', `Decline ${request.child_name}'s request for ${DAY_NAMES[request.day_of_week]} ${formatTime12h(request.start_time)}–${formatTime12h(request.end_time)}?`, async () => {
      setBusyId(request.id);
      const { data: { session } } = await supabase.auth.getSession();
      await supabase.from('schedule_requests').update({ status: 'rejected', reviewed_by: session?.user.id, reviewed_at: new Date().toISOString() }).eq('id', request.id);
      await notifyScheduleRequestRejected(request.parent_id, request.child_name, `${DAY_NAMES[request.day_of_week]} ${formatTime12h(request.start_time)}–${formatTime12h(request.end_time)}`);
      setBusyId(null);
      loadScheduleRequests();
    });
  };

  const openTierRoster = async (groupTierId: string, slotId?: string) => {
    setRosterTierId(groupTierId);
    setRosterSlotId(slotId ?? null);
    setSlotRescheduleOpen(false);
    setRoster(await getRoster(groupTierId));
  };

  const closeTierRoster = () => {
    setRosterTierId(null);
    setRosterSlotId(null);
    setSlotRescheduleOpen(false);
  };

  // Group lessons don't have a single "the coach" field on a slot — coach
  // assignment is the lesson-level main/assistant roster, already editable
  // in tiers.tsx — so a slot reschedule is day/time only, not coach.
  const openSlotReschedule = (slot: { day_of_week: number; start_time: string; end_time: string }) => {
    setSlotRescheduleDay(slot.day_of_week);
    setSlotRescheduleStart(slot.start_time.slice(0, 5));
    setSlotRescheduleEnd(slot.end_time.slice(0, 5));
    setSlotRescheduleOpen(true);
  };

  const submitSlotReschedule = async () => {
    if (!rosterSlotId) return;
    if (!slotRescheduleStart || !slotRescheduleEnd || slotRescheduleStart >= slotRescheduleEnd) { showAlert('Invalid time', 'Pick a start and end time, with end after start.'); return; }
    setSlotRescheduleSaving(true);
    // updateTimeSlot replaces the slot's court list wholesale with whatever
    // courtIds is passed — carry the slot's existing courts through
    // unchanged, or a plain day/time reschedule would silently strip them.
    const existingSlot = groupLessons.find((t) => t.id === rosterTierId)?.slots.find((s) => s.id === rosterSlotId);
    await updateTimeSlot(rosterSlotId, {
      day: slotRescheduleDay, start: slotRescheduleStart, end: slotRescheduleEnd,
      isRecurring: true, oneTimeDate: null, courtIds: existingSlot?.court_ids ?? [],
    });
    setSlotRescheduleSaving(false);
    closeTierRoster();
    load();
  };

  const removeSlot = () => {
    if (!rosterSlotId) return;
    showConfirm('Remove this slot?', 'This weekly time will no longer be part of the lesson.', async () => {
      await deleteTimeSlot(rosterSlotId);
      closeTierRoster();
      load();
    });
  };

  // ── Book an open court slot ──

  const closeBookModal = () => {
    setBookSlot(null);
    setBookCourtId(null);
    setBookMode('choose');
    setBookCoachId(null);
    setBookPlayer(null);
    setBookPlayerQuery('');
    setBookPlayerResults([]);
    setBookGroupLessonId(null);
    setRenterName('');
    setRenterEmail('');
    setRenterPhone('');
  };

  const searchBookPlayers = async (q: string) => {
    setBookPlayerQuery(q);
    if (!clubId) return;
    setBookPlayerResults(await searchClubRosterPlayers(q, clubId));
  };

  const submitPrivateBooking = async () => {
    if (!clubId || !bookSlot || !bookCourtId) return;
    if (!bookCoachId) { showAlert('Missing coach', 'Pick a coach.'); return; }
    if (!bookPlayer) { showAlert('Missing player', 'Pick a player.'); return; }
    if (!bookStart || !bookEnd || bookStart >= bookEnd) { showAlert('Invalid time', 'Pick a start and end time, with end after start.'); return; }
    setBookSaving(true);
    const dateStr = localDateStr(selectedDate);
    const { error } = await supabase.from('schedule_assignments').insert({
      club_id: clubId, player_id: bookPlayer.id, coach_id: bookCoachId,
      day_of_week: selectedDate.getDay(), start_time: bookStart, end_time: bookEnd,
      valid_from: dateStr, valid_until: dateStr, is_recurring: false, court_id: bookCourtId,
    });
    setBookSaving(false);
    if (error) { showAlert('Error', 'Could not book that slot.'); return; }
    closeBookModal();
    load();
  };

  const submitGroupBooking = async () => {
    if (!bookSlot || !bookCourtId || !bookGroupLessonId) { showAlert('Missing lesson', 'Pick which group lesson this slot is for.'); return; }
    if (!bookStart || !bookEnd || bookStart >= bookEnd) { showAlert('Invalid time', 'Pick a start and end time, with end after start.'); return; }
    setBookSaving(true);
    const dateStr = localDateStr(selectedDate);
    await addTimeSlot(bookGroupLessonId, {
      day: selectedDate.getDay(), start: bookStart, end: bookEnd,
      isRecurring: false, oneTimeDate: dateStr, courtIds: [bookCourtId],
    });
    setBookSaving(false);
    closeBookModal();
    load();
  };

  const submitRentalBooking = async () => {
    if (!clubId || !bookCourtId) return;
    if (!renterName.trim()) { showAlert('Missing name', "Enter the member's name."); return; }
    if (!renterEmail.trim()) { showAlert('Missing email', "Enter the member's email."); return; }
    if (!bookStart || !bookEnd || bookStart >= bookEnd) { showAlert('Invalid time', 'Pick a start and end time, with end after start.'); return; }
    setBookSaving(true);
    const res = await createCourtRental({
      clubId, courtId: bookCourtId, date: localDateStr(selectedDate),
      startTime: bookStart, endTime: bookEnd, renterName, renterEmail, renterPhone: renterPhone || null,
    });
    setBookSaving(false);
    if (!res.ok) { showAlert('Error', res.message ?? 'Could not book that rental.'); return; }
    closeBookModal();
    load();
  };

  const selectedDayOfWeek = selectedDate.getDay();

  // A private lesson created via enroll-private.tsx never gets a court (the
  // wizard has no court step — that's a physical-scheduling concern
  // decided later, here). Surface any court-less private lesson whose day
  // and time overlap this specific open slot, so the club can just assign
  // it here instead of editing the row directly in the DB.
  const courtlessLessonsForSlot = bookSlot
    ? allLessons.filter((l) =>
        !l.court_id && l.day_of_week === selectedDayOfWeek
        && timeToMinutes(l.start_time) < timeToMinutes(bookEnd) && timeToMinutes(bookStart) < timeToMinutes(l.end_time)
      )
    : [];

  const assignCourtToLesson = async (lesson: LessonEntry) => {
    if (!bookCourtId) return;
    const { error } = await supabase.from('schedule_assignments').update({ court_id: bookCourtId }).eq('id', lesson.id);
    if (error) { showAlert('Error', 'Could not assign that court.'); return; }
    closeBookModal();
    load();
  };

  // ── Derived data ──

  // The club schedules lessons, not the coach — so "it's my own day" no
  // longer implies full management (booking, waitlist, schedule requests).
  // canFullyManage is the real admin capability (owner, or a staff coach the
  // owner explicitly trusted with canEditOtherSchedules); isOwnDay only ever
  // unlocks the one self-service exception, requesting a cancellation.
  const canFullyManage = isOwner || canEditOthers;
  const isOwnDay = selectedCoachId === myId;
  const canSeeAnyActions = canFullyManage || isOwnDay;
  const canBookAnyCoach = canFullyManage;
  const coachLessons = allLessons.filter((l) => l.coach_id === selectedCoachId);

  const rosterTier = groupLessons.find((t) => t.id === rosterTierId) ?? null;

  // ── Shared block-building data (used by both view modes) ──

  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(startOfWeek(selectedDate));
    d.setDate(d.getDate() + i);
    return d;
  });
  const coachColumns = coaches.map((c) => ({ id: c.id, name: c.full_name }));

  // A block is always shown on the specific date it falls on (day-scoped in
  // Day view, or the matching weekday within the visible week in Week
  // view), so the date to cancel is already known — no need to make the
  // admin pick it again in a separate step.
  const occurrenceDateFor = (lesson: LessonEntry) => {
    const match = weekDays.find((d) => d.getDay() === lesson.day_of_week);
    return localDateStr(match ?? selectedDate);
  };

  const cancelLessonDate = (lesson: LessonEntry) => {
    const dateStr = occurrenceDateFor(lesson);
    showConfirm(
      'Cancel this date?',
      `${firstName(lesson.player_name)}'s lesson on ${formatDateLong(dateStr)} will be cancelled.`,
      async () => {
        await supabase.from('schedule_exceptions').insert({ schedule_assignment_id: lesson.id, date: dateStr, reason: 'cancelled' });
        load();
      },
      'Cancel Lesson'
    );
  };

  const dayPrivateBlocks: CoachDayBlock[] = allLessons
    .filter((l) => l.day_of_week === selectedDayOfWeek)
    .map((l) => ({
      id: l.id, coachIds: [l.coach_id], startTime: l.start_time, endTime: l.end_time,
      label: firstName(l.player_name), color: PRIVATE_BLOCK_COLOR,
    }));

  const dayGroupBlocks: CoachDayBlock[] = groupLessons.flatMap((lesson) => {
    const coachIds = lesson.coaches.map((c) => c.coach_id).filter((id) => coaches.some((co) => co.id === id));
    return lesson.slots
      .filter((s) => s.day_of_week === selectedDayOfWeek)
      .map((s) => ({
        id: `tier::${lesson.id}::${s.id}`, coachIds, startTime: s.start_time, endTime: s.end_time,
        label: lesson.name,
        sublabel: `${lesson.roster_count} player${lesson.roster_count === 1 ? '' : 's'}${lesson.coaches.length > 0 ? ` · ${lesson.coaches.map((c) => c.full_name).join(', ')}` : ''}`,
        color: GROUP_BLOCK_COLOR,
      }));
  });

  // ── All coaches, one week (coachViewMode === 'week') ──
  // Shows the recurring weekly PATTERN (day-of-week + time, exactly what
  // allLessons/groupLessons already carry), not exceptions/cancellations
  // for one specific real week — "a typical week at a glance," matching how
  // every other lens on this screen already treats a "day" as a
  // day-of-week pattern first and a real date second. Color-coded per
  // coach via colorForId (same helper coach avatars use elsewhere), so a
  // coach reads as one consistent color across the whole grid — two
  // coaches double-booked at once land in side-by-side lanes automatically
  // (WeeklyGrid's own overlap handling), not stacked.
  const weekGridBlocks: GridBlock[] = [
    ...allLessons.map((l) => ({
      id: l.id, dayOfWeek: l.day_of_week, startTime: l.start_time, endTime: l.end_time,
      label: firstName(l.player_name), sublabel: l.coach_name, color: colorForId(l.coach_id),
    })),
    ...groupLessons.flatMap((lesson) =>
      lesson.slots.map((s) => ({
        id: `tier::${lesson.id}::${s.id}`, dayOfWeek: s.day_of_week, startTime: s.start_time, endTime: s.end_time,
        label: lesson.name, sublabel: lesson.coaches[0]?.full_name ?? 'Group',
        color: lesson.coaches[0] ? colorForId(lesson.coaches[0].coach_id) : GROUP_BLOCK_COLOR,
      }))
    ),
  ];

  // ── One coach, one day (coachViewMode === 'coach') ──

  const singleCoachColumns = selectedCoachId ? coachColumns.filter((c) => c.id === selectedCoachId) : [];
  const singleCoachDayBlocks: CoachDayBlock[] = [
    ...dayPrivateBlocks.filter((b) => b.coachIds[0] === selectedCoachId),
    ...dayGroupBlocks.filter((b) => selectedCoachId && b.coachIds.includes(selectedCoachId)),
  ];

  // ── Shared helpers + raw booking data feeding the court-timeline below ──

  // A coach counts as free for a gap if they have no other private lesson or
  // group-lesson slot overlapping it that same day — checked club-wide, not
  // just on this court, since a coach can only be in one place at a time.
  const isCoachFree = (coachId: string, startMin: number, endMin: number) => {
    const privateBusy = allLessons.some((l) =>
      l.coach_id === coachId && l.day_of_week === selectedDayOfWeek &&
      timeToMinutes(l.start_time) < endMin && startMin < timeToMinutes(l.end_time)
    );
    if (privateBusy) return false;
    return !groupLessons.some((lesson) =>
      lesson.coaches.some((c) => c.coach_id === coachId) &&
      lesson.slots.some((s) => s.day_of_week === selectedDayOfWeek && timeToMinutes(s.start_time) < endMin && startMin < timeToMinutes(s.end_time))
    );
  };

  type CourtBooking = {
    id: string; courtId: string; startMin: number; endMin: number; kind: 'private' | 'group' | 'maintenance' | 'rental';
    title: string; chips: { label: string; color: { bg: string; fg: string } }[];
    onPress: () => void;
  };

  const courtBookings: CourtBooking[] = [
    ...allLessons.filter((l) => l.day_of_week === selectedDayOfWeek && l.court_id).map((l) => {
      const cancelled = dayCancellations[l.id] === 'cancelled';
      return {
        id: l.id, courtId: l.court_id as string, startMin: timeToMinutes(l.start_time), endMin: timeToMinutes(l.end_time),
        kind: 'private' as const, title: cancelled ? `${firstName(l.player_name)} (Cancelled)` : firstName(l.player_name),
        chips: [{ label: l.coach_name, color: PRIVATE_BLOCK_COLOR }],
        onPress: () => openManageLesson(l),
      };
    }),
    ...groupLessons.flatMap((lesson) =>
      lesson.slots.filter((s) => s.day_of_week === selectedDayOfWeek).flatMap((s) =>
        s.court_ids.map((courtId) => ({
          id: `tier::${lesson.id}::${s.id}::${courtId}`, courtId, startMin: timeToMinutes(s.start_time), endMin: timeToMinutes(s.end_time),
          kind: 'group' as const, title: lesson.name,
          chips: [{ label: `${lesson.roster_count} player${lesson.roster_count === 1 ? '' : 's'}`, color: GROUP_BLOCK_COLOR }],
          onPress: () => openTierRoster(lesson.id, s.id),
        }))
      )
    ),
    ...dayMaintenanceBlocks.map((b) => ({
      id: `maint::${b.id}`, courtId: b.courtId, startMin: timeToMinutes(b.startTime), endMin: timeToMinutes(b.endTime),
      kind: 'maintenance' as const, title: b.reason ?? 'Maintenance',
      chips: [{ label: 'Closed', color: MAINTENANCE_BLOCK_COLOR }],
      onPress: () => showAlert(b.reason ?? 'Maintenance', `${formatTime12h(b.startTime)}–${formatTime12h(b.endTime)}`),
    })),
    ...dayRentals.map((r) => ({
      id: `rental::${r.id}`, courtId: r.courtId, startMin: timeToMinutes(r.startTime), endMin: timeToMinutes(r.endTime),
      kind: 'rental' as const, title: r.renterName,
      chips: [{ label: r.renterEmail, color: RENTAL_BLOCK_COLOR }],
      onPress: () => showAlert(r.renterName, `${r.renterEmail}${r.renterPhone ? `\n${r.renterPhone}` : ''}\n${formatTime12h(r.startTime)}–${formatTime12h(r.endTime)}`),
    })),
  ];

  // ── One court, one day, as an actual timeline (coachViewMode === 'court') ──
  // Same visual language as the by-coach grid below — a single column (this
  // court), booked lessons colored by whichever coach is teaching, and open
  // gaps rendered as their own (dimmer, tappable-if-bookable) blocks instead
  // of a text summary. Reuses CoachDayGrid itself: "coaches" here just means
  // "columns", and a court is exactly one column.

  type CourtGridBlock = CoachDayBlock & { onPressOverride: () => void; isOpenBookable?: boolean };

  const selectedCourt = courts.find((c) => c.id === selectedCourtId) ?? null;
  const courtColumns = selectedCourt ? [{ id: selectedCourt.id, name: selectedCourt.name }] : [];

  const courtDayBlocks: CourtGridBlock[] = [];
  if (selectedCourtId) {
    const bookings = courtBookings.filter((b) => b.courtId === selectedCourtId).sort((a, b) => a.startMin - b.startMin);
    let cursor = dayWindowStart;

    const pushOpenBlock = (start: number, end: number) => {
      if (end - start < MIN_OPEN_GAP_MINUTES) return;
      const freeCoachIds = coaches.filter((c) => isCoachFree(c.id, start, end)).map((c) => c.id);
      const isBookable = canBookAnyCoach && freeCoachIds.length > 0;
      courtDayBlocks.push({
        id: `open::${start}`, coachIds: [selectedCourtId as string], startTime: minutesToTime(start), endTime: minutesToTime(end),
        label: 'Open',
        footerLabel: isBookable ? 'Book' : undefined,
        color: OPEN_BLOCK_COLOR,
        isOpenBookable: isBookable,
        onPressOverride: () => {
          if (!isBookable || !selectedCourt) return;
          setBookSlot({ courtIds: [selectedCourt.id], courtNames: [selectedCourt.name], freeCoachIds });
          setBookMode('choose');
          setBookStart(minutesToTime(start));
          setBookEnd(minutesToTime(end));
          setBookCoachId(freeCoachIds[0] ?? null);
          setBookCourtId(selectedCourt.id);
        },
      });
    };

    bookings.forEach((b) => {
      if (b.startMin > cursor) pushOpenBlock(cursor, b.startMin);
      courtDayBlocks.push({
        id: b.id, coachIds: [selectedCourtId as string], startTime: minutesToTime(b.startMin), endTime: minutesToTime(b.endMin),
        label: b.title, sublabel: b.chips[0]?.label, color: b.chips[0]?.color ?? GROUP_BLOCK_COLOR,
        onPressOverride: b.onPress,
      });
      cursor = Math.max(cursor, b.endMin);
    });
    pushOpenBlock(cursor, dayWindowEnd);
  }

  const handleCourtBlockPress = (block: CourtGridBlock) => block.onPressOverride();

  const handleDayGridBlockPress = (block: CoachDayBlock) => {
    if (block.id.startsWith('tier::')) {
      const [, groupTierId, slotId] = block.id.split('::');
      openTierRoster(groupTierId, slotId);
      return;
    }
    const lesson = allLessons.find((l) => l.id === block.id);
    if (lesson) { openManageLesson(lesson); return; }
    showAlert(block.label, `${block.sublabel ?? ''}\n${formatTime12h(block.startTime)}–${formatTime12h(block.endTime)}`);
  };

  if (!loading && !hasClub) {
    return (
      <View style={styles.container}>
        <NoClubPrompt />
      </View>
    );
  }

  if (!loading && !onboardingCompleted) {
    return (
      <View style={styles.container}>
        <SetupLockedPlaceholder />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {!embedded && (
        <View style={styles.header}>
          <Text style={styles.title}>Calendar</Text>
        </View>
      )}

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={[styles.scroll, embedded && { paddingTop: 16 }]}>
        {loading ? (
          <Text style={styles.muted} maxFontSizeMultiplier={1.3}>Loading...</Text>
        ) : (
          <>
            {!lockToSelf && (
              <View style={styles.subToggleRow}>
                <TouchableOpacity style={[styles.segmentBtn, coachViewMode === 'court' && styles.segmentBtnActive]} onPress={() => setCoachViewMode('court')}>
                  <Text style={[styles.segmentText, coachViewMode === 'court' && styles.segmentTextActive]} maxFontSizeMultiplier={1.3}>Courts</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.segmentBtn, coachViewMode === 'coach' && styles.segmentBtnActive]} onPress={() => setCoachViewMode('coach')}>
                  <Text style={[styles.segmentText, coachViewMode === 'coach' && styles.segmentTextActive]} maxFontSizeMultiplier={1.3}>Coaches</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.segmentBtn, coachViewMode === 'week' && styles.segmentBtnActive]} onPress={() => setCoachViewMode('week')}>
                  <Text style={[styles.segmentText, coachViewMode === 'week' && styles.segmentTextActive]} maxFontSizeMultiplier={1.3}>Week</Text>
                </TouchableOpacity>
              </View>
            )}

            {coachViewMode !== 'week' && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }} contentContainerStyle={{ gap: 8 }}>
                {weekDays.map((d) => {
                  const isSelected = d.toDateString() === selectedDate.toDateString();
                  return (
                    <TouchableOpacity key={d.toISOString()} style={[styles.dayStripCell, isSelected && styles.dayStripCellActive]} onPress={() => setSelectedDate(d)}>
                      <Text style={[styles.dayStripDayName, isSelected && styles.dayStripDayNameActive]} maxFontSizeMultiplier={1.2}>{DAY_NAMES[d.getDay()].slice(0, 3)}</Text>
                      <Text style={[styles.dayStripDate, isSelected && styles.dayStripDateActive]} maxFontSizeMultiplier={1.2}>{d.getDate()}</Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            )}

            {coachViewMode === 'court' ? (
              <>
                {courts.length > 0 && (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 14 }} contentContainerStyle={{ gap: 10 }}>
                    {courts.map((court) => (
                      <TouchableOpacity key={court.id} style={[styles.pill, selectedCourtId === court.id && styles.courtPillActive]} onPress={() => setSelectedCourtId(court.id)}>
                        <Text style={[styles.pillText, selectedCourtId === court.id && styles.courtPillTextActive]} maxFontSizeMultiplier={1.3}>{court.name}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                )}
                {courtColumns.length === 0 ? (
                  <Text style={styles.emptyText} maxFontSizeMultiplier={1.3}>No courts set up yet.</Text>
                ) : (
                  <CoachDayGrid
                    coaches={courtColumns}
                    blocks={courtDayBlocks}
                    onPressBlock={handleCourtBlockPress as (b: CoachDayBlock) => void}
                    columnWidth={gridColumnWidth}
                    hourHeight={72}
                  />
                )}
              </>
            ) : coachViewMode === 'coach' ? (
              <>
                {!lockToSelf && coaches.length > 0 && (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 14 }} contentContainerStyle={{ gap: 10 }}>
                    {coaches.map((c) => (
                      <TouchableOpacity key={c.id} style={[styles.pill, selectedCoachId === c.id && styles.pillActive]} onPress={() => setSelectedCoachId(c.id)}>
                        <Text style={[styles.pillText, selectedCoachId === c.id && styles.pillTextActive]} maxFontSizeMultiplier={1.3}>{c.full_name}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                )}
                {singleCoachColumns.length === 0 || singleCoachDayBlocks.length === 0 ? (
                  <Text style={styles.emptyText} maxFontSizeMultiplier={1.3}>Nothing scheduled for {DAY_NAMES[selectedDayOfWeek]}.</Text>
                ) : (
                  <CoachDayGrid
                    coaches={singleCoachColumns}
                    blocks={singleCoachDayBlocks}
                    onPressBlock={handleDayGridBlockPress}
                    columnWidth={gridColumnWidth}
                    hourHeight={72}
                  />
                )}

                {selectedCoachId && isOwner && (
                  <TouchableOpacity style={styles.offTimeBtn} onPress={() => setTimeOffModalVisible(true)}>
                    <Icon name="tune" size={18} color={Theme.eyebrowGreen} />
                    <Text style={styles.offTimeBtnText} maxFontSizeMultiplier={1.3}>Break Time &amp; Days Off</Text>
                    <Icon name="chevron-right" size={18} color={Theme.textSecondary} />
                  </TouchableOpacity>
                )}

                {!canSeeAnyActions && (
                  <Text style={[styles.hint, { marginTop: 16 }]} maxFontSizeMultiplier={1.3}>Read-only — you don't have permission to edit this coach's schedule. Ask your club admin to grant it.</Text>
                )}

                {canFullyManage && (
                  <>
                    <TouchableOpacity style={[styles.mgmtSectionHeader, { marginTop: 24 }]} onPress={() => setRequestsExpanded((v) => !v)}>
                      <Icon name="calendar-edit" size={20} color={Theme.textPrimary} />
                      <Text style={styles.mgmtSectionTitle}>Pending Schedule Requests</Text>
                      {scheduleRequests.length > 0 && (
                        <View style={styles.mgmtBadgeUrgent}>
                          <Text style={styles.mgmtBadgeUrgentText}>{scheduleRequests.length}</Text>
                        </View>
                      )}
                      <View style={{ flex: 1 }} />
                      <Icon name={requestsExpanded ? 'chevron-up' : 'chevron-down'} size={22} color={Theme.textSecondary} />
                    </TouchableOpacity>
                    {requestsExpanded && (
                      scheduleRequests.length === 0 ? (
                        <Text style={styles.emptyText} maxFontSizeMultiplier={1.3}>No schedule requests waiting on this coach.</Text>
                      ) : (
                        scheduleRequests.map((request) => (
                          <View key={request.id} style={styles.lessonCard}>
                            <View style={{ flex: 1 }}>
                              <Text style={styles.lessonName}>
                                {firstName(request.child_name)}{request.replaces_schedule_assignment_id ? ' — reschedule' : ''}
                              </Text>
                              <Text style={styles.lessonMeta} maxFontSizeMultiplier={1.3}>{DAY_NAMES[request.day_of_week]} · {formatTime12h(request.start_time)}–{formatTime12h(request.end_time)}</Text>
                            </View>
                            <View style={styles.lessonActions}>
                              <TouchableOpacity style={styles.smallBtn} onPress={() => approveScheduleRequest(request)} disabled={busyId === request.id}>
                                <Text style={styles.smallBtnText}>{busyId === request.id ? '...' : 'Approve'}</Text>
                              </TouchableOpacity>
                              <TouchableOpacity onPress={() => rejectScheduleRequest(request)} disabled={busyId === request.id}>
                                <Icon name="close-circle-outline" size={24} color="#FF6B6B" />
                              </TouchableOpacity>
                            </View>
                          </View>
                        ))
                      )
                    )}

                    <TouchableOpacity style={[styles.mgmtSectionHeader, { marginTop: 20 }]} onPress={() => setWaitlistExpanded((v) => !v)}>
                      <Icon name="account-multiple" size={20} color={Theme.textPrimary} />
                      <Text style={styles.mgmtSectionTitle}>Waitlist</Text>
                      {waitlist.length > 0 && (
                        <View style={styles.mgmtBadgeUrgent}>
                          <Text style={styles.mgmtBadgeUrgentText}>{waitlist.length}</Text>
                        </View>
                      )}
                      <View style={{ flex: 1 }} />
                      <Icon name={waitlistExpanded ? 'chevron-up' : 'chevron-down'} size={22} color={Theme.textSecondary} />
                    </TouchableOpacity>
                    {waitlistExpanded && (
                      waitlist.length === 0 ? (
                        <Text style={styles.emptyText} maxFontSizeMultiplier={1.3}>No one is waitlisted for this coach.</Text>
                      ) : (
                        waitlist.map((entry, i) => (
                          <View key={entry.id} style={styles.waitCard}>
                            <View style={styles.priorityBadge}><Text style={styles.priorityText}>{i + 1}</Text></View>
                            <View style={{ flex: 1 }}>
                              <Text style={styles.lessonName}>{firstName(entry.player_name)}</Text>
                              <Text style={styles.lessonMeta} maxFontSizeMultiplier={1.3}>
                                {entry.status === 'waiting' && 'Waiting'}
                                {entry.status === 'offered' && !isExpired(entry) && 'Offered — awaiting response'}
                                {entry.status === 'offered' && isExpired(entry) && 'Offer expired — try next in line'}
                              </Text>
                              {!!entry.preferred_note && (
                                <Text style={styles.lessonMeta} maxFontSizeMultiplier={1.3}>Wants: {entry.preferred_note}</Text>
                              )}
                            </View>
                            <View style={styles.lessonActions}>
                              <TouchableOpacity onPress={() => reorderWaitlist(i, -1)} disabled={i === 0 || busyId === entry.id}>
                                <Icon name="chevron-up" size={22} color={i === 0 ? Theme.textMuted : Theme.textPrimary} />
                              </TouchableOpacity>
                              <TouchableOpacity onPress={() => reorderWaitlist(i, 1)} disabled={i === waitlist.length - 1 || busyId === entry.id}>
                                <Icon name="chevron-down" size={22} color={i === waitlist.length - 1 ? Theme.textMuted : Theme.textPrimary} />
                              </TouchableOpacity>
                              {entry.status === 'waiting' && (
                                <TouchableOpacity style={styles.smallBtn} onPress={() => offerSlot(entry)} disabled={busyId === entry.id}>
                                  <Text style={styles.smallBtnText}>Offer</Text>
                                </TouchableOpacity>
                              )}
                              <TouchableOpacity style={styles.smallBtn} onPress={() => openPromote(entry)}>
                                <Text style={styles.smallBtnText}>Promote</Text>
                              </TouchableOpacity>
                              <TouchableOpacity onPress={() => removeFromWaitlist(entry)}>
                                <Icon name="close-circle-outline" size={24} color="#FF6B6B" />
                              </TouchableOpacity>
                            </View>
                          </View>
                        ))
                      )
                    )}

                    {pendingCancelRequests.length > 0 && (
                      <>
                        <View style={[styles.mgmtSectionHeader, { marginTop: 20 }]}>
                          <Icon name="calendar-remove-outline" size={20} color={Theme.textPrimary} />
                          <Text style={styles.mgmtSectionTitle}>Cancellation Requests</Text>
                          <View style={styles.mgmtBadgeUrgent}>
                            <Text style={styles.mgmtBadgeUrgentText}>{pendingCancelRequests.length}</Text>
                          </View>
                        </View>
                        {pendingCancelRequests.map((request) => {
                          const lesson = allLessons.find((l) => l.id === request.scheduleAssignmentId);
                          const label = lesson ? `${firstName(lesson.player_name)}'s lesson` : 'This lesson';
                          return (
                            <View key={request.id} style={styles.lessonCard}>
                              <View style={{ flex: 1 }}>
                                <Text style={styles.lessonName}>{label}</Text>
                                <Text style={styles.lessonMeta} maxFontSizeMultiplier={1.3}>{formatDateLong(request.cancelDate)}{request.note ? ` · ${request.note}` : ''}</Text>
                              </View>
                              <View style={styles.lessonActions}>
                                <TouchableOpacity style={styles.smallBtn} onPress={() => approveCancelReq(request, label)}>
                                  <Text style={styles.smallBtnText}>Approve</Text>
                                </TouchableOpacity>
                                <TouchableOpacity onPress={() => declineCancelReq(request, label)}>
                                  <Icon name="close-circle-outline" size={24} color="#FF6B6B" />
                                </TouchableOpacity>
                              </View>
                            </View>
                          );
                        })}
                      </>
                    )}
                  </>
                )}

                {canSeeAnyActions && (
                  <>
                    <TouchableOpacity style={[styles.mgmtSectionHeader, { marginTop: 20 }]} onPress={() => setManageExpanded((v) => !v)}>
                      <Icon name="whistle-outline" size={20} color={Theme.textPrimary} />
                      <Text style={styles.mgmtSectionTitle}>Manage Lessons</Text>
                      {coachLessons.length > 0 && (
                        <View style={styles.mgmtBadge}>
                          <Text style={styles.mgmtBadgeText}>{coachLessons.length}</Text>
                        </View>
                      )}
                      <View style={{ flex: 1 }} />
                      <Icon name={manageExpanded ? 'chevron-up' : 'chevron-down'} size={22} color={Theme.textSecondary} />
                    </TouchableOpacity>
                    {manageExpanded && (
                      coachLessons.length === 0 ? (
                        <Text style={styles.emptyText} maxFontSizeMultiplier={1.3}>Nothing to manage yet.</Text>
                      ) : (
                        coachLessons.map((lesson) => {
                          const myPendingReq = myCancelRequests.find((r) => r.scheduleAssignmentId === lesson.id && r.status === 'pending');
                          return (
                            <View key={lesson.id} style={styles.lessonCard}>
                              <View style={{ flex: 1 }}>
                                <Text style={styles.lessonName}>{firstName(lesson.player_name)}</Text>
                                <Text style={styles.lessonMeta} maxFontSizeMultiplier={1.3}>{DAY_NAMES[lesson.day_of_week]} · {formatTime12h(lesson.start_time)}–{formatTime12h(lesson.end_time)}</Text>
                                {!canFullyManage && myPendingReq && (
                                  <Text style={styles.lessonMeta} maxFontSizeMultiplier={1.3}>Cancellation requested for {formatDateLong(myPendingReq.cancelDate)} — pending approval</Text>
                                )}
                              </View>
                              <View style={styles.lessonActions}>
                                {canFullyManage ? (
                                  <>
                                    <TouchableOpacity onPress={() => { setCancelLesson(lesson); setCancelDate(todayStr()); }}>
                                      <Icon name="calendar-edit" size={24} color={Theme.textSecondary} />
                                    </TouchableOpacity>
                                    <TouchableOpacity onPress={() => { setBlockLesson(lesson); setBlockStart(todayStr()); setBlockEnd(todayStr()); }}>
                                      <Icon name="trophy-outline" size={24} color={Theme.flameOrange} />
                                    </TouchableOpacity>
                                    <TouchableOpacity onPress={() => endLesson(lesson)}>
                                      <Icon name="trash-can-outline" size={24} color="#FF6B6B" />
                                    </TouchableOpacity>
                                  </>
                                ) : myPendingReq ? (
                                  <TouchableOpacity style={styles.smallBtn} onPress={() => withdrawMyCancelReq(myPendingReq)}>
                                    <Text style={styles.smallBtnText}>Withdraw</Text>
                                  </TouchableOpacity>
                                ) : (
                                  <TouchableOpacity style={styles.smallBtn} onPress={() => { setCancelLesson(lesson); setCancelDate(todayStr()); setCancelNote(''); }}>
                                    <Text style={styles.smallBtnText}>Request cancel</Text>
                                  </TouchableOpacity>
                                )}
                              </View>
                            </View>
                          );
                        })
                      )
                    )}
                  </>
                )}
              </>
            ) : (
              <>
                {coaches.length > 0 && (
                  <View style={styles.weekLegendRow}>
                    {coaches.map((c) => (
                      <View key={c.id} style={styles.weekLegendItem}>
                        <View style={[styles.weekLegendSwatch, { backgroundColor: colorForId(c.id).bg }]} />
                        <Text style={styles.weekLegendText} maxFontSizeMultiplier={1.2}>{firstName(c.full_name)}</Text>
                      </View>
                    ))}
                  </View>
                )}
                <WeeklyGrid
                  blocks={weekGridBlocks}
                  onPressBlock={(b) => handleDayGridBlockPress(b as unknown as CoachDayBlock)}
                  hourHeight={48}
                />
              </>
            )}
          </>
        )}
      </ScrollView>

      {/* Cancel one date modal — direct cancel for canFullyManage, a
          cancellation request otherwise */}
      <Modal visible={!!cancelLesson} transparent animationType="fade" onRequestClose={closeCancelModal}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{canFullyManage ? 'Cancel One Date' : 'Request Cancellation'}</Text>
              <TouchableOpacity onPress={closeCancelModal}>
                <Icon name="close-circle-outline" size={26} color={Theme.textPrimary} />
              </TouchableOpacity>
            </View>
            <Text style={styles.formLabel} maxFontSizeMultiplier={1.3}>{firstName(cancelLesson?.player_name)} — pick the date to cancel</Text>
            <MiniDatePicker value={cancelDate} onChange={setCancelDate} minDate={todayStr()} />
            {!canFullyManage && (
              <>
                <Text style={[styles.formLabel, { marginTop: 12 }]} maxFontSizeMultiplier={1.3}>Note for your club (optional)</Text>
                <TextInput
                  style={styles.formInput}
                  value={cancelNote}
                  onChangeText={setCancelNote}
                  placeholder="e.g. feeling sick"
                  placeholderTextColor={Theme.textSecondary}
                />
              </>
            )}
            <TouchableOpacity style={[styles.saveBtn, submittingCancel && styles.saveBtnDisabled]} onPress={submitCancelDate} disabled={submittingCancel}>
              <Text style={styles.saveBtnText}>
                {canFullyManage ? 'Cancel This Date' : submittingCancel ? 'Sending...' : 'Send Request'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Tournament block modal */}
      <Modal visible={!!blockLesson} transparent animationType="fade" onRequestClose={() => setBlockLesson(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Block for Tournament</Text>
              <TouchableOpacity onPress={() => setBlockLesson(null)}>
                <Icon name="close-circle-outline" size={26} color={Theme.textPrimary} />
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={styles.formLabel} maxFontSizeMultiplier={1.3}>
                {firstName(blockLesson?.player_name)} — {!blockStart ? 'tap the first day.' : !blockEnd ? 'now tap the last day.' : `${formatDateLong(blockStart)} – ${formatDateLong(blockEnd)}`}
              </Text>
              <MiniDateRangePicker startValue={blockStart} endValue={blockEnd} onChangeStart={setBlockStart} onChangeEnd={setBlockEnd} minDate={todayStr()} accentColor={Theme.flameOrange} />
              <Text style={styles.hint} maxFontSizeMultiplier={1.3}>Lessons in this range auto-become tournament exceptions, and makeup credits are created for each missed date.</Text>
              <TouchableOpacity style={styles.saveBtn} onPress={submitTournamentBlock}>
                <Text style={styles.saveBtnText}>Confirm Block</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Promote modal */}
      <Modal visible={!!promoteEntry} transparent animationType="fade" onRequestClose={() => setPromoteEntry(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Promote {firstName(promoteEntry?.player_name)}</Text>
              <TouchableOpacity onPress={() => setPromoteEntry(null)}>
                <Icon name="close-circle-outline" size={26} color={Theme.textPrimary} />
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={styles.formLabel} maxFontSizeMultiplier={1.3}>Pick the open day and time for their new lesson</Text>
              <View style={styles.pillWrapRow}>
                {DAY_NAMES.map((d, i) => (
                  <TouchableOpacity key={d} style={[styles.pill, promoteDay === i && styles.pillActive]} onPress={() => setPromoteDay(i)}>
                    <Text style={[styles.pillText, promoteDay === i && styles.pillTextActive]} maxFontSizeMultiplier={1.3}>{d.slice(0, 3)}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={styles.formLabel} maxFontSizeMultiplier={1.3}>Start time</Text>
              <TimePicker value={promoteStart} onChange={setPromoteStart} />

              <Text style={styles.formLabel} maxFontSizeMultiplier={1.3}>End time</Text>
              <TimePicker value={promoteEnd} onChange={setPromoteEnd} />

              <TouchableOpacity style={styles.saveBtn} onPress={submitPromote}>
                <Text style={styles.saveBtnText}>Confirm & Book</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Group lesson roster modal — when opened from tapping a specific
          day/time block (rosterSlotId set), also offers reschedule/remove
          for that one slot. Opened from the "Group Lessons" list instead
          (no slotId) skips straight to just the roster. */}
      <Modal visible={!!rosterTierId} transparent animationType="fade" onRequestClose={closeTierRoster}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{rosterTier?.name ?? 'Roster'}</Text>
              <TouchableOpacity onPress={closeTierRoster}>
                <Icon name="close-circle-outline" size={26} color={Theme.textPrimary} />
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              {rosterSlotId && (
                slotRescheduleOpen ? (
                  <View>
                    <Text style={styles.formLabel} maxFontSizeMultiplier={1.3}>Day</Text>
                    <View style={styles.pillWrapRow}>
                      {DAY_NAMES.map((d, i) => (
                        <TouchableOpacity key={d} style={[styles.pill, slotRescheduleDay === i && styles.pillActive]} onPress={() => setSlotRescheduleDay(i)}>
                          <Text style={[styles.pillText, slotRescheduleDay === i && styles.pillTextActive]} maxFontSizeMultiplier={1.3}>{d.slice(0, 3)}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                    <Text style={styles.formLabel} maxFontSizeMultiplier={1.3}>Start</Text>
                    <TimePicker value={slotRescheduleStart} onChange={setSlotRescheduleStart} />
                    <Text style={styles.formLabel} maxFontSizeMultiplier={1.3}>End</Text>
                    <TimePicker value={slotRescheduleEnd} onChange={setSlotRescheduleEnd} />
                    <View style={styles.wizardNavRow}>
                      <TouchableOpacity style={styles.navBackBtn} onPress={() => setSlotRescheduleOpen(false)}>
                        <Text style={styles.navBackText} maxFontSizeMultiplier={1.3}>Back</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={[styles.saveBtn, styles.wizardSaveBtn, slotRescheduleSaving && styles.saveBtnDisabled]} onPress={submitSlotReschedule} disabled={slotRescheduleSaving}>
                        <Text style={styles.saveBtnText}>{slotRescheduleSaving ? 'Saving...' : 'Save'}</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ) : (
                  <View style={styles.wizardNavRow}>
                    <TouchableOpacity style={styles.smallBtn} onPress={() => openSlotReschedule(rosterTier!.slots.find((s) => s.id === rosterSlotId)!)}>
                      <Text style={styles.smallBtnText}>Reschedule This Slot</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.smallBtn, { backgroundColor: 'rgba(231,76,60,0.12)' }]} onPress={removeSlot}>
                      <Text style={[styles.smallBtnText, { color: '#E74C3C' }]}>Remove Slot</Text>
                    </TouchableOpacity>
                  </View>
                )
              )}
              {roster.length === 0 ? (
                <Text style={styles.muted} maxFontSizeMultiplier={1.3}>No one assigned yet.</Text>
              ) : (
                roster.map((r) => (
                  <View key={r.id} style={styles.searchResultRow}>
                    <Text style={styles.playerName}>{firstName(r.player_name)}</Text>
                  </View>
                ))
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Manage private lesson modal — opened by tapping a private lesson
          block directly. Reschedule is a permanent edit to the recurring
          template; the other two reuse the existing cancelLesson/endLesson
          machinery from the Manage Lessons list. */}
      <Modal visible={!!manageLesson} transparent animationType="fade" onRequestClose={closeManageLesson}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{firstName(manageLesson?.player_name)}</Text>
              <TouchableOpacity onPress={closeManageLesson}>
                <Icon name="close-circle-outline" size={26} color={Theme.textPrimary} />
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              {manageLessonMode === 'view' ? (
                <>
                  <Text style={styles.hint} maxFontSizeMultiplier={1.3}>
                    {manageLesson && `${DAY_NAMES[manageLesson.day_of_week]} · ${formatTime12h(manageLesson.start_time)}–${formatTime12h(manageLesson.end_time)} with ${manageLesson.coach_name}`}
                  </Text>
                  {manageLessonPlan && (
                    <View style={styles.planRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.playerName}>
                          {manageLessonPlan.sessionsUsed} / {manageLessonPlan.totalSessions} sessions used
                          {manageLessonPlan.status === 'exhausted' ? ' · Exhausted' : ''}
                        </Text>
                        <Text style={styles.planSubtext} maxFontSizeMultiplier={1.3}>
                          {Math.max(0, manageLessonPlan.totalSessions - manageLessonPlan.sessionsUsed)} remaining
                        </Text>
                      </View>
                      {manageTopUpOpen ? (
                        <View style={styles.topUpRow}>
                          <TextInput style={styles.topUpInput} value={manageTopUpAmount} onChangeText={setManageTopUpAmount} keyboardType="number-pad" maxLength={3} />
                          <TouchableOpacity onPress={submitManageTopUp} disabled={manageTopUpSaving}>
                            <Icon name="check-circle-outline" size={22} color={Theme.eyebrowGreen} />
                          </TouchableOpacity>
                          <TouchableOpacity onPress={() => setManageTopUpOpen(false)}>
                            <Icon name="close-circle-outline" size={22} color={Theme.textMuted} />
                          </TouchableOpacity>
                        </View>
                      ) : (
                        <TouchableOpacity onPress={() => { setManageTopUpOpen(true); setManageTopUpAmount('5'); }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                          <Icon name="plus-circle-outline" size={22} color={Theme.eyebrowGreen} />
                        </TouchableOpacity>
                      )}
                    </View>
                  )}
                  <TouchableOpacity style={styles.saveBtn} onPress={() => setManageLessonMode('reschedule')}>
                    <Text style={styles.saveBtnText}>Reschedule</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.saveBtn, styles.saveBtnSecondary]}
                    onPress={() => {
                      if (manageLesson) {
                        if (canFullyManage) {
                          cancelLessonDate(manageLesson);
                        } else {
                          setCancelLesson(manageLesson);
                          setCancelDate(occurrenceDateFor(manageLesson));
                        }
                      }
                      closeManageLesson();
                    }}
                  >
                    <Text style={[styles.saveBtnText, { color: Theme.eyebrowGreen }]}>Cancel This Date</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.saveBtn, { backgroundColor: 'rgba(231,76,60,0.12)' }]}
                    onPress={() => { if (manageLesson) endLesson(manageLesson); closeManageLesson(); }}
                  >
                    <Text style={[styles.saveBtnText, { color: '#E74C3C' }]}>End Entirely</Text>
                  </TouchableOpacity>
                </>
              ) : (
                <>
                  <Text style={styles.formLabel} maxFontSizeMultiplier={1.3}>Coach</Text>
                  <View style={styles.pillWrapRow}>
                    {coaches.map((c) => (
                      <TouchableOpacity key={c.id} style={[styles.pill, rescheduleCoachId === c.id && styles.pillActive]} onPress={() => setRescheduleCoachId(c.id)}>
                        <Text style={[styles.pillText, rescheduleCoachId === c.id && styles.pillTextActive]} maxFontSizeMultiplier={1.3}>{c.full_name}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  <Text style={styles.formLabel} maxFontSizeMultiplier={1.3}>Day</Text>
                  <View style={styles.pillWrapRow}>
                    {DAY_NAMES.map((d, i) => (
                      <TouchableOpacity key={d} style={[styles.pill, rescheduleDay === i && styles.pillActive]} onPress={() => setRescheduleDay(i)}>
                        <Text style={[styles.pillText, rescheduleDay === i && styles.pillTextActive]} maxFontSizeMultiplier={1.3}>{d.slice(0, 3)}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  <Text style={styles.formLabel} maxFontSizeMultiplier={1.3}>Start</Text>
                  <TimePicker value={rescheduleStart} onChange={setRescheduleStart} />
                  <Text style={styles.formLabel} maxFontSizeMultiplier={1.3}>End</Text>
                  <TimePicker value={rescheduleEnd} onChange={setRescheduleEnd} />
                  <View style={styles.wizardNavRow}>
                    <TouchableOpacity style={styles.navBackBtn} onPress={() => setManageLessonMode('view')}>
                      <Text style={styles.navBackText} maxFontSizeMultiplier={1.3}>Back</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.saveBtn, styles.wizardSaveBtn, reschedulingSaving && styles.saveBtnDisabled]} onPress={submitReschedule} disabled={reschedulingSaving}>
                      <Text style={styles.saveBtnText}>{reschedulingSaving ? 'Saving...' : 'Save'}</Text>
                    </TouchableOpacity>
                  </View>
                </>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Book an open court slot — choose private or group, then fill it in */}
      <Modal visible={!!bookSlot} transparent animationType="fade" onRequestClose={closeBookModal}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Book {courts.find((c) => c.id === bookCourtId)?.name ?? bookSlot?.courtNames.join(', ')}</Text>
              <TouchableOpacity onPress={closeBookModal}>
                <Icon name="close-circle-outline" size={26} color={Theme.textPrimary} />
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              {bookMode === 'choose' && (
                <>
                  <Text style={styles.hint} maxFontSizeMultiplier={1.3}>{formatTime12h(bookStart)} – {formatTime12h(bookEnd)} on {DAY_NAMES[selectedDayOfWeek]}. What do you want to schedule?</Text>

                  {bookSlot && bookSlot.courtIds.length > 1 && (
                    <>
                      <Text style={styles.formLabel} maxFontSizeMultiplier={1.3}>Which court?</Text>
                      <View style={styles.pillWrapRow}>
                        {bookSlot.courtIds.map((id) => {
                          const name = courts.find((c) => c.id === id)?.name ?? 'Court';
                          return (
                            <TouchableOpacity key={id} style={[styles.pill, bookCourtId === id && styles.pillActive]} onPress={() => setBookCourtId(id)}>
                              <Text style={[styles.pillText, bookCourtId === id && styles.pillTextActive]} maxFontSizeMultiplier={1.3}>{name}</Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    </>
                  )}

                  {courtlessLessonsForSlot.length > 0 && (
                    <>
                      <Text style={styles.formLabel} maxFontSizeMultiplier={1.3}>Or assign an existing private lesson</Text>
                      {courtlessLessonsForSlot.map((l) => (
                        <TouchableOpacity key={l.id} style={styles.searchResultRow} onPress={() => assignCourtToLesson(l)}>
                          <Text style={styles.playerName}>{firstName(l.player_name)}</Text>
                          <Text style={styles.hint} maxFontSizeMultiplier={1.3}>{l.coach_name} · {formatTime12h(l.start_time)}–{formatTime12h(l.end_time)}</Text>
                        </TouchableOpacity>
                      ))}
                      <Text style={[styles.hint, { marginTop: 4 }]} maxFontSizeMultiplier={1.3}>— or schedule something new —</Text>
                    </>
                  )}

                  <TouchableOpacity style={styles.saveBtn} onPress={() => setBookMode('private')}>
                    <Text style={styles.saveBtnText}>Private Lesson</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.saveBtn, styles.saveBtnSecondary]} onPress={() => setBookMode('group')}>
                    <Text style={[styles.saveBtnText, { color: Theme.eyebrowGreen }]}>Group Lesson</Text>
                  </TouchableOpacity>
                  {restrictBooking !== 'lessons' && (
                    <TouchableOpacity style={[styles.saveBtn, styles.saveBtnSecondary]} onPress={() => setBookMode('rental')}>
                      <Text style={[styles.saveBtnText, { color: Theme.eyebrowGreen }]}>Member</Text>
                    </TouchableOpacity>
                  )}
                </>
              )}

              {bookMode === 'private' && (
                <>
                  <Text style={styles.formLabel} maxFontSizeMultiplier={1.3}>Start</Text>
                  <TimePicker value={bookStart} onChange={setBookStart} />
                  <Text style={styles.formLabel} maxFontSizeMultiplier={1.3}>End</Text>
                  <TimePicker value={bookEnd} onChange={setBookEnd} />

                  <Text style={styles.formLabel} maxFontSizeMultiplier={1.3}>Coach</Text>
                  <View style={styles.pillWrapRow}>
                    {coaches.map((c) => (
                      <TouchableOpacity key={c.id} style={[styles.pill, bookCoachId === c.id && styles.pillActive]} onPress={() => setBookCoachId(c.id)}>
                        <Text style={[styles.pillText, bookCoachId === c.id && styles.pillTextActive]} maxFontSizeMultiplier={1.3}>{c.full_name}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  <Text style={styles.formLabel} maxFontSizeMultiplier={1.3}>Player</Text>
                  {bookPlayer ? (
                    <View style={styles.searchResultRow}>
                      <Text style={styles.playerName}>{bookPlayer.full_name}</Text>
                      <TouchableOpacity onPress={() => setBookPlayer(null)}>
                        <Icon name="close-circle-outline" size={20} color={Theme.textSecondary} />
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <>
                      <SearchInput value={bookPlayerQuery} onChangeText={searchBookPlayers} placeholder="Search by name or email" />
                      {bookPlayerResults.map((p) => (
                        <TouchableOpacity key={p.id} style={styles.searchResultRow} onPress={() => { setBookPlayer(p); setBookPlayerQuery(''); setBookPlayerResults([]); }}>
                          <Text style={styles.playerName}>{p.full_name}</Text>
                        </TouchableOpacity>
                      ))}
                    </>
                  )}

                  <View style={styles.wizardNavRow}>
                    <TouchableOpacity style={styles.navBackBtn} onPress={() => setBookMode('choose')}>
                      <Text style={styles.navBackText} maxFontSizeMultiplier={1.3}>Back</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.saveBtn, styles.wizardSaveBtn, bookSaving && styles.saveBtnDisabled]} onPress={submitPrivateBooking} disabled={bookSaving}>
                      <Text style={styles.saveBtnText}>{bookSaving ? 'Booking...' : 'Book Private Lesson'}</Text>
                    </TouchableOpacity>
                  </View>
                </>
              )}

              {bookMode === 'group' && (
                <>
                  <Text style={styles.formLabel} maxFontSizeMultiplier={1.3}>Start</Text>
                  <TimePicker value={bookStart} onChange={setBookStart} />
                  <Text style={styles.formLabel} maxFontSizeMultiplier={1.3}>End</Text>
                  <TimePicker value={bookEnd} onChange={setBookEnd} />

                  <Text style={styles.formLabel} maxFontSizeMultiplier={1.3}>Which group lesson?</Text>
                  {groupLessons.length === 0 ? (
                    <Text style={styles.emptyText} maxFontSizeMultiplier={1.3}>No group lessons yet — create one in the Group Lessons tab first.</Text>
                  ) : (
                    groupLessons.map((lesson) => (
                      <TouchableOpacity
                        key={lesson.id}
                        style={[styles.searchResultRow, bookGroupLessonId === lesson.id && styles.searchResultRowSelected]}
                        onPress={() => setBookGroupLessonId(lesson.id)}
                      >
                        <Text style={styles.playerName}>{lesson.name}</Text>
                        {bookGroupLessonId === lesson.id && <Icon name="check-circle-outline" size={20} color={Theme.eyebrowGreen} />}
                      </TouchableOpacity>
                    ))
                  )}

                  <View style={styles.wizardNavRow}>
                    <TouchableOpacity style={styles.navBackBtn} onPress={() => setBookMode('choose')}>
                      <Text style={styles.navBackText} maxFontSizeMultiplier={1.3}>Back</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.saveBtn, styles.wizardSaveBtn, (bookSaving || !bookGroupLessonId) && styles.saveBtnDisabled]} onPress={submitGroupBooking} disabled={bookSaving || !bookGroupLessonId}>
                      <Text style={styles.saveBtnText}>{bookSaving ? 'Booking...' : 'Add This Slot'}</Text>
                    </TouchableOpacity>
                  </View>
                </>
              )}

              {bookMode === 'rental' && (
                <>
                  <Text style={styles.formLabel} maxFontSizeMultiplier={1.3}>Start</Text>
                  <TimePicker value={bookStart} onChange={setBookStart} />
                  <Text style={styles.formLabel} maxFontSizeMultiplier={1.3}>End</Text>
                  <TimePicker value={bookEnd} onChange={setBookEnd} />

                  <Text style={styles.formLabel} maxFontSizeMultiplier={1.3}>Member's name</Text>
                  <TextInput style={styles.formInput} value={renterName} onChangeText={setRenterName} placeholder="Name" placeholderTextColor={Theme.textSecondary} />

                  <Text style={styles.formLabel} maxFontSizeMultiplier={1.3}>Email</Text>
                  <TextInput style={styles.formInput} value={renterEmail} onChangeText={setRenterEmail} placeholder="Email" placeholderTextColor={Theme.textSecondary} keyboardType="email-address" autoCapitalize="none" />

                  <Text style={styles.formLabel} maxFontSizeMultiplier={1.3}>Phone — optional</Text>
                  <TextInput style={styles.formInput} value={renterPhone} onChangeText={setRenterPhone} placeholder="Phone number" placeholderTextColor={Theme.textSecondary} keyboardType="phone-pad" />

                  <View style={styles.wizardNavRow}>
                    <TouchableOpacity style={styles.navBackBtn} onPress={() => setBookMode('choose')}>
                      <Text style={styles.navBackText} maxFontSizeMultiplier={1.3}>Back</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.saveBtn, styles.wizardSaveBtn, (bookSaving || !renterName.trim() || !renterEmail.trim()) && styles.saveBtnDisabled]} onPress={submitRentalBooking} disabled={bookSaving || !renterName.trim() || !renterEmail.trim()}>
                      <Text style={styles.saveBtnText}>{bookSaving ? 'Booking...' : 'Book'}</Text>
                    </TouchableOpacity>
                  </View>
                </>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {timeOffModalVisible && selectedCoachId && clubId && (
        <CoachTimeOffModal
          clubId={clubId}
          coach={{ id: selectedCoachId, full_name: coaches.find((c) => c.id === selectedCoachId)?.full_name ?? 'Coach' }}
          visible={timeOffModalVisible}
          onClose={() => setTimeOffModalVisible(false)}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Theme.background },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingLeft: 60, paddingRight: 24, paddingTop: 60, paddingBottom: 12 },
  title: { fontFamily: Fonts.serifMedium, fontSize: 30, color: Theme.textPrimary },
  addBtn: { padding: 4 },
  scroll: { paddingHorizontal: 24, paddingBottom: 100 },
  muted: { fontFamily: Fonts.sansRegular, fontSize: 16, color: Theme.textSecondary, fontStyle: 'italic', marginTop: 20 },
  emptyText: { fontFamily: Fonts.sansRegular, fontSize: 16, color: Theme.textSecondary, fontStyle: 'italic', marginBottom: 8 },
  hint: { fontFamily: Fonts.sansRegular, fontSize: 14, color: Theme.textSecondary, lineHeight: 19, marginBottom: 14 },
  // Same white-track/dark-green-active language as the pill picker below
  // (Theme.eyebrowGreen, already the app's real accent color) rather than a
  // bright ad hoc green — keeps this control looking like part of the app.
  subToggleRow: {
    flexDirection: 'row', gap: 4, marginBottom: 18,
    backgroundColor: Theme.cardWhite, borderRadius: 16, padding: 4,
    borderWidth: 1, borderColor: Theme.divider,
  },
  segmentBtn: { flex: 1, alignItems: 'center', paddingVertical: 11, borderRadius: 12 },
  segmentBtnActive: { backgroundColor: Theme.eyebrowGreen },
  weekLegendRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 12 },
  weekLegendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  weekLegendSwatch: { width: 10, height: 10, borderRadius: 5 },
  weekLegendText: { fontFamily: Fonts.sansSemiBold, fontSize: 12, color: Theme.textSecondary },
  segmentText: { fontFamily: Fonts.sansSemiBold, fontSize: 16, color: Theme.eyebrowGreen },
  segmentTextActive: { color: '#FFFFFF' },
  dayStripCell: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 14, gap: 2 },
  dayStripCellActive: { backgroundColor: Theme.eyebrowGreen },
  dayStripDayName: { fontFamily: Fonts.sansSemiBold, fontSize: 15, color: Theme.textSecondary },
  dayStripDayNameActive: { color: '#FFFFFF' },
  dayStripDate: { fontFamily: Fonts.sansBold, fontSize: 20, color: Theme.textPrimary },
  dayStripDateActive: { color: '#FFFFFF' },
  lessonCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: Theme.cardWhite, borderRadius: 16, padding: 18, marginBottom: 12, gap: 12 },
  lessonName: { fontFamily: Fonts.sansSemiBold, fontSize: 17, color: Theme.textPrimary },
  lessonMeta: { fontFamily: Fonts.sansRegular, fontSize: 15, color: Theme.textSecondary, marginTop: 3 },
  lessonActions: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  waitCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: Theme.cardWhite, borderRadius: 16, padding: 18, marginBottom: 12, gap: 12 },
  priorityBadge: { width: 30, height: 30, borderRadius: 15, backgroundColor: Theme.cardTinted, alignItems: 'center', justifyContent: 'center' },
  priorityText: { fontFamily: Fonts.sansBold, fontSize: 15, color: Theme.eyebrowGreen },
  smallBtn: { backgroundColor: Theme.limeAccent, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8 },
  smallBtnText: { fontFamily: Fonts.sansBold, fontSize: 14, color: Theme.limeAccentDark },
  offTimeBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: Theme.cardWhite,
    borderRadius: 12, borderWidth: 1, borderColor: Theme.divider, paddingVertical: 14, paddingHorizontal: 16, marginTop: 16,
  },
  offTimeBtnText: { flex: 1, fontFamily: Fonts.sansSemiBold, fontSize: 14, color: Theme.textPrimary },
  mgmtSectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 },
  mgmtSectionTitle: { fontFamily: Fonts.sansBold, fontSize: 18, color: Theme.textPrimary },
  mgmtBadge: { backgroundColor: Theme.cardTinted, borderRadius: 12, paddingHorizontal: 9, paddingVertical: 3, minWidth: 24, alignItems: 'center' },
  mgmtBadgeText: { fontFamily: Fonts.sansBold, fontSize: 13, color: Theme.eyebrowGreen },
  mgmtBadgeUrgent: { backgroundColor: '#FBDAB3', borderRadius: 12, paddingHorizontal: 9, paddingVertical: 3, minWidth: 24, alignItems: 'center' },
  mgmtBadgeUrgentText: { fontFamily: Fonts.sansBold, fontSize: 13, color: '#854F0B' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: Theme.background, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, maxHeight: '85%' },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 },
  modalTitle: { fontFamily: Fonts.serifMedium, fontSize: 22, color: Theme.textPrimary, flexShrink: 1 },
  formLabel: { fontFamily: Fonts.sansSemiBold, fontSize: 15, color: Theme.textSecondary, marginBottom: 8, marginTop: 4 },
  formInput: { backgroundColor: Theme.cardWhite, borderRadius: 10, padding: 16, color: Theme.textPrimary, fontFamily: Fonts.sansRegular, fontSize: 16, marginBottom: 10, borderWidth: 1, borderColor: Theme.divider },
  pill: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 20, backgroundColor: Theme.cardWhite, borderWidth: 1, borderColor: Theme.divider },
  pillRow: { flexDirection: 'row', gap: 10, marginBottom: 10 },
  pillWrapRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 10 },
  pillActive: { backgroundColor: Theme.eyebrowGreen, borderColor: Theme.eyebrowGreen },
  pillText: { fontFamily: Fonts.sansSemiBold, fontSize: 16, color: Theme.textSecondary },
  pillTextActive: { color: '#FFFFFF' },
  // Court picker only — coach picker (and the booking modal's coach picker)
  // keep the dark-green `pillActive` above.
  courtPillActive: { backgroundColor: CategoryTheme.footwork.bg, borderColor: CategoryTheme.footwork.bg },
  courtPillTextActive: { color: CategoryTheme.footwork.fg },
  saveBtn: { backgroundColor: Theme.limeAccent, borderRadius: 30, paddingVertical: 16, alignItems: 'center', marginTop: 14, marginBottom: 24 },
  saveBtnSecondary: { backgroundColor: Theme.cardTinted, marginTop: 0 },
  saveBtnDisabled: { opacity: 0.6 },
  saveBtnText: { fontFamily: Fonts.sansBold, color: Theme.limeAccentDark, fontSize: 16 },
  wizardNavRow: { flexDirection: 'row', gap: 12, marginTop: 16, marginBottom: 24, alignItems: 'center' },
  wizardSaveBtn: { flex: 1, marginTop: 0, marginBottom: 0 },
  navBackBtn: { paddingHorizontal: 18, paddingVertical: 14 },
  navBackText: { fontFamily: Fonts.sansSemiBold, fontSize: 15, color: Theme.textSecondary },
  searchResultRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: Theme.cardWhite, borderRadius: 12, padding: 14, marginBottom: 10 },
  searchResultRowSelected: { borderWidth: 2, borderColor: Theme.eyebrowGreen },
  playerName: { fontFamily: Fonts.sansSemiBold, fontSize: 16, color: Theme.textPrimary },
  planRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: Theme.cardTinted, borderRadius: 12, padding: 12, marginBottom: 14, gap: 10 },
  planSubtext: { fontFamily: Fonts.sansRegular, fontSize: 13, color: Theme.textSecondary, marginTop: 2 },
  topUpRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  topUpInput: {
    backgroundColor: Theme.background, borderRadius: 8, borderWidth: 1, borderColor: Theme.divider,
    width: 44, height: 36, textAlign: 'center', fontFamily: Fonts.sansSemiBold, fontSize: 14, color: Theme.textPrimary,
  },
});
