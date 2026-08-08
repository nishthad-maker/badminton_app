import { View, StyleSheet, ScrollView, TouchableOpacity, Modal, Alert, Linking } from 'react-native';
import { TextInput } from '@/components/TextInput';
import { Text } from '@/components/Text';
import { useLocalSearchParams, useFocusEffect } from 'expo-router';
import { useState, useEffect, useCallback, useRef } from 'react';
import { Icon } from '@/components/icons/Icon';
import { Theme, Fonts } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import { cancelTournamentReminder, scheduleTournamentReminder } from '@/lib/tournamentReminders';
import { MiniDatePicker } from '@/components/MiniDatePicker';
import { getPlayerClubMembership, getClubHours, PlayerClubMembership } from '@/lib/club';
import {
  getMyLessons, getMyGroupLessons, getGroupLessonRoster, markTournamentDates, ChildLesson, ChildGroupLesson,
  getCoachesForScheduling, getCoachAvailability, isSlotOpen, requestReschedule, ClubCoach,
  joinCoachWaitlist, getMyWaitlist, leaveCoachWaitlist, MyWaitlistEntry,
  getCourtAvailability, isAnyCourtOpen, ClubCourtAvailability,
  getMyPayments, submitPlayerPaymentReport, ChildPayment,
} from '@/lib/playerClub';
import { getLinkedParents } from '@/lib/parentLink';
import { RosterPlayer } from '@/lib/lessons';
import { DAY_NAMES, formatTime12h, formatDateLong, firstName } from '@/lib/scheduling';
import { getAttendanceForDate, setAttendance, statusFor, nextOccurrenceDate, AttendanceStatus } from '@/lib/attendance';
import { LESSON_DOT_COLOR } from '@/lib/colors';
import { maybeRemindUpcoming } from '@/lib/lessonReminders';
import { getPlayerMakeupCredits, getMakeupSuggestions, requestMakeupSlot, confirmProposedMakeupSlot, declineProposedMakeupSlot, MakeupCredit, MakeupSuggestion } from '@/lib/makeup';
import { JournalSheet, localDateStr } from '@/components/JournalSheet';

type CalendarEvent = {
  id: string;
  title: string;
  event_type: string;
  event_date: string;
  event_end_date: string | null;
  start_time: string | null;
  end_time: string | null;
  location: string | null;
  notes: string | null;
  registration_deadline: string | null;
  registration_link: string | null;
  reminder_notification_id: string | null;
  created_at: string;
};

const EVENT_TYPES = [
  { key: 'tournament', label: 'Tournament', icon: 'trophy', color: '#E74C3C' },
  { key: 'training', label: 'Training', icon: 'lightning-bolt', color: '#2ECC71' },
  { key: 'rest', label: 'Rest Day', icon: 'bed', color: '#3498DB' },
  { key: 'custom', label: 'Custom', icon: 'star', color: '#F1C40F' },
];

const DEADLINE_COLOR = '#F39C12';
// Matches the vivid strength/footwork blue+green already used in the parent
// dashboard's Progress > Category Breakdown chart, so the same lesson-type
// colors read consistently across both the player's and parent's calendars.

const addDays = (dateStr: string, days: number) => {
  const d = new Date(`${dateStr}T00:00:00`);
  d.setDate(d.getDate() + days);
  return localDateStr(d);
};

const formatShortDate = (dateStr: string) =>
  new Date(`${dateStr}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

// Relative pill options for the (optional) multi-day end date — the
// registration deadline uses an exact calendar date via MiniDatePicker
// instead, since "3 days before" etc. was too imprecise for that field.
const END_DATE_OFFSETS = [0, 1, 2, 3, 4, 5, 6, 7];

const getEventColor = (type: string) => {
  return EVENT_TYPES.find(t => t.key === type)?.color ?? '#F1C40F';
};

const getEventIcon = (type: string) => {
  return EVENT_TYPES.find(t => t.key === type)?.icon ?? 'star';
};

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const DAY_HEADERS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const PAYMENT_METHODS: { key: 'cash' | 'card' | 'e_transfer' | 'other'; label: string }[] = [
  { key: 'cash', label: 'Cash' }, { key: 'card', label: 'Card' }, { key: 'e_transfer', label: 'E-transfer' }, { key: 'other', label: 'Other' },
];

const showAlert = (title: string, message: string) => {
  if (typeof window !== 'undefined') {
    window.alert(`${title}\n\n${message}`);
  } else {
    Alert.alert(title, message);
  }
};

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

export default function CalendarScreen() {
  const params = useLocalSearchParams();
  const [user, setUser] = useState<any>(null);
  const [events, setEvents] = useState<CalendarEvent[]>([]);

  const today = new Date();
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const [selectedDate, setSelectedDate] = useState<string>(
    localDateStr(today)
  );

  const [showModal, setShowModal] = useState(false);
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null);
  const [formTitle, setFormTitle] = useState('');
  const [formType, setFormType] = useState('training');
  const [formStartTime, setFormStartTime] = useState('');
  const [formEndTime, setFormEndTime] = useState('');
  const [formLocation, setFormLocation] = useState('');
  const [formNotes, setFormNotes] = useState('');

  // Tournament-only fields
  const [formEndDate, setFormEndDate] = useState('');
  const [formRegistrationDeadline, setFormRegistrationDeadline] = useState('');
  const [formRegistrationLink, setFormRegistrationLink] = useState('');
  const [showRegistrationDetails, setShowRegistrationDetails] = useState(false);

  // Prompted right after saving a personal "Tournament" event, so marking a
  // tournament on the calendar and telling the club about it (which auto-
  // creates private-lesson makeup credits + excludes group lessons that
  // week via the generate_tournament_exceptions() DB trigger) don't stay two
  // disconnected actions the player has to remember to do separately.
  const [showTournamentSyncModal, setShowTournamentSyncModal] = useState(false);
  const [tournamentSyncRange, setTournamentSyncRange] = useState<{ name: string; start: string; end: string } | null>(null);
  const [syncingTournament, setSyncingTournament] = useState(false);

  // Club schedule (private/group lessons + makeup credits) — moved here from
  // the Train tab so a player's actual schedule lives alongside their
  // personal calendar, where they'd look for "when is my next thing."
  const [myId, setMyId] = useState<string | null>(null);
  // A linked parent owns scheduling (reschedule/coach-times/makeup-slot
  // picking) to avoid both sides submitting conflicting requests for the
  // same lesson — payment self-report stays available either way (no
  // conflict risk there). See getLinkedParents in lib/parentLink.ts.
  const [hasLinkedParent, setHasLinkedParent] = useState(false);
  const [membership, setMembership] = useState<PlayerClubMembership | null>(null);
  const [clubHours, setClubHours] = useState<{ openTime: string | null; closeTime: string | null }>({ openTime: null, closeTime: null });
  const [myLessons, setMyLessons] = useState<ChildLesson[]>([]);
  const [myGroupLessons, setMyGroupLessons] = useState<ChildGroupLesson[]>([]);
  const [privateAtt, setPrivateAtt] = useState<Record<string, AttendanceStatus>>({});
  const [groupAtt, setGroupAtt] = useState<Record<string, AttendanceStatus>>({});
  const [makeupCredits, setMakeupCredits] = useState<MakeupCredit[]>([]);
  const [makeupAtt, setMakeupAtt] = useState<Record<string, AttendanceStatus>>({});
  const [rosterLesson, setRosterLesson] = useState<ChildGroupLesson | null>(null);
  const [roster, setRoster] = useState<RosterPlayer[]>([]);
  const [postLessonPrompt, setPostLessonPrompt] = useState(false);
  const promptedLessonsRef = useRef<Set<string>>(new Set());

  // Makeup slot suggestions — picking one submits it to the coach for
  // approval rather than booking it instantly (mirrors the tournament-sync
  // request/approve pattern above).
  const [makeupSlotCredit, setMakeupSlotCredit] = useState<MakeupCredit | null>(null);
  const [makeupSuggestions, setMakeupSuggestions] = useState<MakeupSuggestion[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [requestingSlot, setRequestingSlot] = useState<string | null>(null);

  // Manage Schedule — direct paths for the 3 things that used to be either
  // buried in Profile (tournament dates) or missing entirely (reschedule,
  // waitlist, coach availability), all reachable from one place instead of
  // bouncing Home -> Profile -> Calendar. Tournament dates reuses the
  // existing add-event flow (openAddModal below) rather than a second
  // calendar-range picker stacked on top of the calendar screen itself.
  const [showPayModal, setShowPayModal] = useState(false);
  const [payments, setPayments] = useState<ChildPayment[]>([]);
  const [paymentNote, setPaymentNote] = useState('');
  const [payMethod, setPayMethod] = useState<'cash' | 'card' | 'e_transfer' | 'other'>('cash');
  const [savingPayment, setSavingPayment] = useState(false);
  const [showRescheduleModal, setShowRescheduleModal] = useState(false);
  const [rescheduleLesson, setRescheduleLesson] = useState<ChildLesson | null>(null);
  const [rescheduleDay, setRescheduleDay] = useState<number | null>(null);
  const [rescheduleBusy, setRescheduleBusy] = useState<{ start: string; end: string }[]>([]);
  const [rescheduleCourts, setRescheduleCourts] = useState<ClubCourtAvailability>({ courtIds: [], busyByCourtId: {} });
  const [loadingRescheduleBusy, setLoadingRescheduleBusy] = useState(false);
  const [submittingReschedule, setSubmittingReschedule] = useState<string | null>(null);

  const [showAvailabilityModal, setShowAvailabilityModal] = useState(false);
  const [schedulingCoaches, setSchedulingCoaches] = useState<ClubCoach[]>([]);
  const [availabilityCoachId, setAvailabilityCoachId] = useState<string | null>(null);
  const [availabilityDay, setAvailabilityDay] = useState<number>(new Date().getDay());
  const [availabilityBusy, setAvailabilityBusy] = useState<{ start: string; end: string }[]>([]);
  const [loadingAvailability, setLoadingAvailability] = useState(false);
  const [myWaitlist, setMyWaitlist] = useState<MyWaitlistEntry[]>([]);
  const [joiningWaitlist, setJoiningWaitlist] = useState(false);
  const [waitlistNoteModal, setWaitlistNoteModal] = useState(false);
  const [waitlistNote, setWaitlistNote] = useState('');

  useEffect(() => {
    loadUser();
  }, []);

  useEffect(() => {
    if (user) loadEvents();
  }, [user, viewMonth, viewYear]);

  useFocusEffect(useCallback(() => { loadClubSchedule(); }, []));

  const loadClubSchedule = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) return;
    setMyId(session.user.id);
    getLinkedParents(session.user.id).then((parents) => setHasLinkedParent(parents.length > 0));
    const active = await getPlayerClubMembership(session.user.id);
    setMembership(active);
    setClubHours(active ? await getClubHours(active.clubId) : { openTime: null, closeTime: null });

    if (!active) {
      setMyLessons([]); setMyGroupLessons([]); setPrivateAtt({}); setGroupAtt({}); setMakeupCredits([]); setMakeupAtt({});
      return;
    }

    const [lessons, groups] = await Promise.all([
      getMyLessons(session.user.id, active.clubId),
      getMyGroupLessons(session.user.id, active.clubId),
    ]);
    setMyLessons(lessons);
    setMyGroupLessons(groups);

    const [privEntries, groupEntries] = await Promise.all([
      Promise.all(lessons.map(async (l) => {
        const m = await getAttendanceForDate({ scheduleAssignmentId: l.id, lessonDate: nextOccurrenceDate(l.day_of_week) });
        return [l.id, statusFor(m, session.user.id)] as const;
      })),
      Promise.all(groups.map(async (g) => {
        const m = await getAttendanceForDate({ groupTierId: g.groupTierId, lessonDate: nextOccurrenceDate(g.day_of_week) });
        return [g.id, statusFor(m, session.user.id)] as const;
      })),
    ]);
    setPrivateAtt(Object.fromEntries(privEntries));
    setGroupAtt(Object.fromEntries(groupEntries));
    const credits = await getPlayerMakeupCredits(session.user.id);
    setMakeupCredits(credits);
    const scheduled = credits.filter((m) => m.status === 'scheduled' && m.scheduledDate);
    const makeupEntries = await Promise.all(scheduled.map(async (m) => {
      const map = await getAttendanceForDate({
        scheduleAssignmentId: m.scheduleAssignmentId ?? undefined,
        groupTierId: m.groupTierId ?? undefined,
        lessonDate: m.scheduledDate!,
      });
      return [`${m.kind}_${m.id}`, statusFor(map, session.user.id)] as const;
    }));
    setMakeupAtt(Object.fromEntries(makeupEntries));

    maybeRemindUpcoming(session.user.id, [
      ...lessons.map((l) => ({ id: l.id, day_of_week: l.day_of_week, start_time: l.start_time, label: `Private lesson with ${l.coach_name}` })),
      ...groups.map((g) => ({ id: g.id, day_of_week: g.day_of_week, start_time: g.start_time, label: g.name })),
    ]);

    // Post-private-lesson journal prompt — best-effort, client-triggered
    // (fires on app open/focus within ~90 min of a private lesson's
    // end-time; no server-side cron exists to push this at the exact
    // moment the lesson ends).
    const now = new Date();
    const todayKey = localDateStr(now);
    const justEnded = lessons.find((l) => {
      if (l.day_of_week !== now.getDay()) return false;
      const [eh, em] = l.end_time.split(':').map(Number);
      const endTs = new Date(now);
      endTs.setHours(eh, em, 0, 0);
      const diffMin = (now.getTime() - endTs.getTime()) / 60000;
      return diffMin >= 0 && diffMin <= 90;
    });
    if (justEnded) {
      const key = `${justEnded.id}_${todayKey}`;
      if (!promptedLessonsRef.current.has(key)) {
        promptedLessonsRef.current.add(key);
        setPostLessonPrompt(true);
      }
    }
  };

  const togglePrivateAttendance = (l: ChildLesson) => {
    if (!myId) return;
    const att = statusFor(privateAtt, l.id);
    if (att.coachOverride) { showAlert('Locked', 'Your coach has set this attendance manually — contact them to change it.'); return; }
    const date = nextOccurrenceDate(l.day_of_week);
    const nextVal = !att.attending;
    const apply = async () => {
      const res = await setAttendance({ scheduleAssignmentId: l.id, playerId: myId, lessonDate: date, attending: nextVal, actorRole: 'player' });
      if (!res.ok) { showAlert('Could not update attendance', res.message || ''); return; }
      setPrivateAtt((prev) => ({ ...prev, [l.id]: { attending: nextVal, coachOverride: false, toggledBy: 'player', exists: true } }));
    };
    if (att.attending) {
      showConfirm('Mark not attending?', `Confirm you won't be at this lesson on ${formatDateLong(date)}.`, apply);
    } else {
      apply();
    }
  };

  const toggleGroupAttendance = (g: ChildGroupLesson) => {
    if (!myId) return;
    const att = statusFor(groupAtt, g.id);
    if (att.coachOverride) { showAlert('Locked', 'Your coach or a tournament block has set this attendance — contact your coach to change it.'); return; }
    const date = nextOccurrenceDate(g.day_of_week);
    const nextVal = !att.attending;
    const apply = async () => {
      const res = await setAttendance({ groupTierId: g.groupTierId, playerId: myId, lessonDate: date, attending: nextVal, actorRole: 'player' });
      if (!res.ok) { showAlert('Could not update attendance', res.message || ''); return; }
      setGroupAtt((prev) => ({ ...prev, [g.id]: { attending: nextVal, coachOverride: false, toggledBy: 'player', exists: true } }));
    };
    if (att.attending) {
      showConfirm('Mark not attending?', `Confirm you won't be at ${g.name} on ${formatDateLong(date)}.`, apply);
    } else {
      apply();
    }
  };

  // Same table/RPC as a regular lesson, just keyed by the makeup's own
  // one-off scheduledDate — marking not-attending sends this specific
  // credit back to 'owed' (20260803230000_makeup_attendance_toggle.sql)
  // rather than leaving a stale "confirmed" entry around.
  const toggleMakeupAttendance = (m: MakeupCredit) => {
    if (!myId || !m.scheduledDate) return;
    const key = `${m.kind}_${m.id}`;
    const att = statusFor(makeupAtt, key);
    if (att.coachOverride) { showAlert('Locked', "This makeup's attendance was set by the coach — contact them to change it."); return; }
    const nextVal = !att.attending;
    const apply = async () => {
      const res = await setAttendance({
        scheduleAssignmentId: m.scheduleAssignmentId ?? undefined,
        groupTierId: m.groupTierId ?? undefined,
        playerId: myId, lessonDate: m.scheduledDate!, attending: nextVal, actorRole: 'player',
      });
      if (!res.ok) { showAlert('Could not update attendance', res.message || ''); return; }
      setMakeupAtt((prev) => ({ ...prev, [key]: { attending: nextVal, coachOverride: false, toggledBy: 'player', exists: true } }));
      if (!nextVal) loadClubSchedule();
    };
    if (att.attending) {
      showConfirm('Mark not attending?', `Confirm you won't be at this makeup on ${formatDateLong(m.scheduledDate!)}.`, apply);
    } else {
      apply();
    }
  };

  const openRoster = async (lesson: ChildGroupLesson) => {
    setRosterLesson(lesson);
    setRoster(await getGroupLessonRoster(lesson.groupTierId));
  };

  const openMakeupSlotPicker = async (credit: MakeupCredit) => {
    setMakeupSlotCredit(credit);
    setMakeupSuggestions([]);
    setLoadingSuggestions(true);
    setMakeupSuggestions(await getMakeupSuggestions(credit.id));
    setLoadingSuggestions(false);
  };

  const selectMakeupSuggestion = async (suggestion: MakeupSuggestion) => {
    if (!makeupSlotCredit || !myId) return;
    const key = `${suggestion.date}_${suggestion.startTime}`;
    setRequestingSlot(key);
    const res = await requestMakeupSlot({
      creditId: makeupSlotCredit.id, playerId: myId, coachId: suggestion.coachId, label: makeupSlotCredit.label,
      date: suggestion.date, startTime: suggestion.startTime, endTime: suggestion.endTime, courtId: suggestion.courtId,
    });
    setRequestingSlot(null);
    if (!res.ok) { showAlert('Error', res.message || 'Could not request that slot.'); return; }
    setMakeupSlotCredit(null);
    showAlert('Sent to your coach', `Your requested time — ${formatDateLong(suggestion.date)} at ${formatTime12h(suggestion.startTime)} with ${suggestion.coachName} — is waiting on approval.`);
    loadClubSchedule();
  };

  const confirmProposedSlot = (credit: MakeupCredit) => {
    if (!credit.scheduledDate || !credit.scheduledStartTime) return;
    showConfirm('Confirm this time?', `${credit.label} — ${formatDateLong(credit.scheduledDate)} at ${formatTime12h(credit.scheduledStartTime)}.`, async () => {
      const res = await confirmProposedMakeupSlot(credit);
      if (!res.ok) { showAlert('Error', 'Could not confirm this makeup time.'); return; }
      loadClubSchedule();
    });
  };

  const declineProposedSlot = (credit: MakeupCredit) => {
    showConfirm("Can't make this time?", `Your coach will be told, and ${credit.label} goes back to needing a makeup slot.`, async () => {
      const res = await declineProposedMakeupSlot(credit);
      if (!res.ok) { showAlert('Error', 'Could not decline this makeup time.'); return; }
      loadClubSchedule();
    });
  };

  // ── Report a Payment — always available, regardless of a linked parent
  // (unlike scheduling, two reports of the same payment isn't a conflict —
  // the club just sees it twice and reviews either).
  const openPayModal = async () => {
    if (!membership) return;
    setPaymentNote('');
    setPayMethod('cash');
    setShowPayModal(true);
    if (myId) setPayments(await getMyPayments(myId, membership.clubId));
  };

  const submitPayment = async () => {
    if (!myId || !membership || !paymentNote.trim()) { showAlert('Missing info', 'Write what this payment is for.'); return; }
    setSavingPayment(true);
    const result = await submitPlayerPaymentReport({ clubId: membership.clubId, playerId: myId, note: paymentNote, method: payMethod });
    setSavingPayment(false);
    if (!result.ok) { showAlert('Error', result.message ?? 'Could not submit.'); return; }
    setShowPayModal(false);
    showAlert('Sent', 'Your club will review this payment report.');
  };

  // ── Manage Schedule: reschedule an existing private lesson -----------------

  const RESCHEDULE_WINDOW_START_MIN = 8 * 60;
  const RESCHEDULE_WINDOW_END_MIN = 20 * 60;
  const timeToMin = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
  const minToTime = (min: number) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}:00`;

  const openRescheduleModal = () => {
    setShowRescheduleModal(true);
    setRescheduleLesson(null);
    setRescheduleDay(null);
    setRescheduleBusy([]);
  };

  const pickRescheduleLesson = (l: ChildLesson) => {
    setRescheduleLesson(l);
    setRescheduleDay(null);
    setRescheduleBusy([]);
  };

  const pickRescheduleDay = async (dow: number) => {
    if (!rescheduleLesson || !membership) return;
    setRescheduleDay(dow);
    setLoadingRescheduleBusy(true);
    const [busy, courts] = await Promise.all([
      getCoachAvailability(membership.clubId, rescheduleLesson.coach_id, dow),
      getCourtAvailability(membership.clubId, dow),
    ]);
    setRescheduleBusy(busy);
    setRescheduleCourts(courts);
    setLoadingRescheduleBusy(false);
  };

  const rescheduleSlotOptions = (() => {
    if (rescheduleDay === null || !rescheduleLesson) return [] as { start: string; end: string }[];
    const duration = timeToMin(rescheduleLesson.end_time) - timeToMin(rescheduleLesson.start_time);
    const opts: { start: string; end: string }[] = [];
    for (let m = RESCHEDULE_WINDOW_START_MIN; m + duration <= RESCHEDULE_WINDOW_END_MIN; m += 30) {
      const start = minToTime(m);
      const end = minToTime(m + duration);
      if (isSlotOpen(rescheduleBusy, start, end) && isAnyCourtOpen(rescheduleCourts, start, end)) opts.push({ start, end });
    }
    return opts;
  })();

  const submitReschedule = async (slot: { start: string; end: string }) => {
    if (!rescheduleLesson || !myId || !membership || rescheduleDay === null) return;
    const key = `${rescheduleDay}_${slot.start}`;
    setSubmittingReschedule(key);
    const res = await requestReschedule({
      playerId: myId, coachId: rescheduleLesson.coach_id, clubId: membership.clubId,
      dayOfWeek: rescheduleDay, start: slot.start, end: slot.end, replacesAssignmentId: rescheduleLesson.id,
    });
    setSubmittingReschedule(null);
    if (!res.ok) { showAlert('Error', res.message || 'Could not submit that request.'); return; }
    setShowRescheduleModal(false);
    showAlert('Sent to your club', `Your request to move to ${DAY_NAMES[rescheduleDay]} ${formatTime12h(slot.start)} is waiting on approval — your current lesson stays on the calendar until then.`);
  };

  // ── Manage Schedule: coach availability + waitlist --------------------------

  const openAvailabilityModal = async () => {
    if (!membership) return;
    setShowAvailabilityModal(true);
    setAvailabilityCoachId(null);
    setAvailabilityBusy([]);
    const [coaches, waitlist] = await Promise.all([
      getCoachesForScheduling(membership.clubId),
      myId ? getMyWaitlist(myId) : Promise.resolve([]),
    ]);
    setSchedulingCoaches(coaches);
    setMyWaitlist(waitlist);
  };

  const pickAvailabilityCoach = async (coachId: string) => {
    if (!membership) return;
    setAvailabilityCoachId(coachId);
    const dow = new Date().getDay();
    setAvailabilityDay(dow);
    setLoadingAvailability(true);
    setAvailabilityBusy(await getCoachAvailability(membership.clubId, coachId, dow));
    setLoadingAvailability(false);
  };

  const pickAvailabilityDay = async (dow: number) => {
    setAvailabilityDay(dow);
    if (!membership || !availabilityCoachId) return;
    setLoadingAvailability(true);
    setAvailabilityBusy(await getCoachAvailability(membership.clubId, availabilityCoachId, dow));
    setLoadingAvailability(false);
  };

  const isOnWaitlistFor = (coachId: string) => myWaitlist.some((w) => w.coachId === coachId && (w.status === 'waiting' || w.status === 'offered'));

  const joinWaitlistForCoach = async () => {
    if (!myId || !membership || !availabilityCoachId) return;
    setJoiningWaitlist(true);
    const res = await joinCoachWaitlist(membership.clubId, myId, availabilityCoachId, waitlistNote);
    setJoiningWaitlist(false);
    if (!res.ok) { showAlert('Error', res.message || 'Could not join the waitlist.'); return; }
    setWaitlistNoteModal(false);
    setWaitlistNote('');
    setMyWaitlist(await getMyWaitlist(myId));
    showAlert('Added', "You're on the waitlist — your club will offer you a slot when one opens up.");
  };

  const leaveWaitlistEntry = (entry: MyWaitlistEntry) => {
    showConfirm('Leave this waitlist?', `Leave the waitlist for ${entry.coachName}?`, async () => {
      const res = await leaveCoachWaitlist(entry.id);
      if (!res.ok) { showAlert('Error', 'Could not leave the waitlist.'); return; }
      if (myId) setMyWaitlist(await getMyWaitlist(myId));
    });
  };

  useEffect(() => {
    if (params.addDate && typeof params.addDate === 'string') {
      setSelectedDate(params.addDate);
      const d = new Date(params.addDate + 'T00:00:00');
      setViewYear(d.getFullYear());
      setViewMonth(d.getMonth());
      const type = typeof params.addType === 'string' ? params.addType : undefined;
      openAddModal(params.addDate, type);
    }
  }, [params.addDate]);

  const loadUser = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    setUser(session?.user ?? null);
  };

  const loadEvents = async () => {
    if (!user) return;

    const startDate = localDateStr(new Date(viewYear, viewMonth - 1, 1));
    const endDate = localDateStr(new Date(viewYear, viewMonth + 2, 0));

    // A tournament's own start date might fall outside the viewed range while
    // its end date or registration deadline falls inside it (e.g. a deadline
    // set weeks ahead of the event) — catch those too, not just event_date.
    const { data } = await supabase
      .from('calendar_events')
      .select('*')
      .eq('user_id', user.id)
      .or(
        `and(event_date.gte.${startDate},event_date.lte.${endDate}),` +
        `and(event_end_date.gte.${startDate},event_end_date.lte.${endDate}),` +
        `and(registration_deadline.gte.${startDate},registration_deadline.lte.${endDate})`
      )
      .order('event_date', { ascending: true })
      .order('start_time', { ascending: true });

    if (data) setEvents(data as CalendarEvent[]);
  };

  const openAddModal = (date?: string, type?: string) => {
    setEditingEvent(null);
    setFormTitle('');
    setFormType(type ?? 'training');
    setFormStartTime('');
    setFormEndTime('');
    setFormLocation('');
    setFormNotes('');
    setFormEndDate('');
    setFormRegistrationDeadline('');
    setFormRegistrationLink('');
    setShowRegistrationDetails(false);
    if (date) setSelectedDate(date);
    setShowModal(true);
  };

  const openEditModal = (event: CalendarEvent) => {
    setEditingEvent(event);
    setFormTitle(event.title);
    setFormType(event.event_type);
    setFormStartTime(event.start_time ?? '');
    setFormEndTime(event.end_time ?? '');
    setFormLocation(event.location ?? '');
    setFormNotes(event.notes ?? '');
    setFormEndDate(event.event_end_date ?? '');
    setFormRegistrationDeadline(event.registration_deadline ?? '');
    setFormRegistrationLink(event.registration_link ?? '');
    setShowRegistrationDetails(!!(event.registration_deadline || event.registration_link));
    setSelectedDate(event.event_date);
    setShowModal(true);
  };

  const saveEvent = async () => {
    if (!formTitle.trim()) {
      showAlert('Title required', 'Please enter a title for your event.');
      return;
    }
    if (formType === 'tournament' && !formLocation.trim()) {
      showAlert('Location required', 'Please enter a location for this tournament.');
      return;
    }
    if (formType === 'tournament' && formRegistrationDeadline && formRegistrationDeadline >= selectedDate) {
      showAlert('Invalid deadline', 'Registration deadline must be before the tournament starts.');
      return;
    }
    if (!user) return;

    const isTournament = formType === 'tournament';
    const eventData = {
      user_id: user.id,
      title: formTitle.trim(),
      event_type: formType,
      event_date: selectedDate,
      start_time: isTournament ? null : (formStartTime || null),
      end_time: isTournament ? null : (formEndTime || null),
      location: formLocation.trim() || null,
      notes: formNotes.trim() || null,
      event_end_date: isTournament ? (formEndDate || null) : null,
      registration_deadline: isTournament ? (formRegistrationDeadline || null) : null,
      registration_link: isTournament ? (formRegistrationLink.trim() || null) : null,
    };

    // Cancel whatever reminder this event had before — covers edits that
    // change or remove the deadline, and non-tournament saves that shouldn't
    // have one at all.
    if (editingEvent?.reminder_notification_id) {
      await cancelTournamentReminder(editingEvent.reminder_notification_id);
    }

    let savedId = editingEvent?.id ?? null;
    if (editingEvent) {
      await supabase.from('calendar_events').update(eventData).eq('id', editingEvent.id);
    } else {
      const { data: inserted } = await supabase.from('calendar_events').insert(eventData).select('id').single();
      savedId = inserted?.id ?? null;
    }

    if (isTournament && savedId) {
      try {
        const notificationId = await scheduleTournamentReminder(savedId, formTitle.trim(), formRegistrationDeadline || null);
        await supabase.from('calendar_events').update({ reminder_notification_id: notificationId }).eq('id', savedId);
      } catch (e) {
        console.log('Could not schedule tournament reminder:', e);
      }
    }

    setShowModal(false);
    loadEvents();

    if (isTournament && membership) {
      setTournamentSyncRange({ name: formTitle.trim(), start: selectedDate, end: formEndDate || selectedDate });
      setShowTournamentSyncModal(true);
    }
  };

  // Every date the tournament spans, capped generously — tournaments are
  // short, so this only guards against a malformed/reversed range looping.
  const datesInRange = (start: string, end: string) => {
    const dates: string[] = [];
    let d = new Date(`${start}T00:00:00`);
    const endD = new Date(`${end}T00:00:00`);
    let guard = 0;
    while (d <= endD && guard < 60) {
      dates.push(localDateStr(d));
      d.setDate(d.getDate() + 1);
      guard++;
    }
    return dates;
  };

  const tournamentSyncLessons = (() => {
    if (!tournamentSyncRange) return { priv: [] as ChildLesson[], grp: [] as ChildGroupLesson[] };
    const dows = new Set(datesInRange(tournamentSyncRange.start, tournamentSyncRange.end).map((d) => new Date(`${d}T00:00:00`).getDay()));
    return {
      priv: myLessons.filter((l) => dows.has(l.day_of_week)),
      grp: myGroupLessons.filter((g) => dows.has(g.day_of_week)),
    };
  })();

  const confirmTournamentSync = async () => {
    if (!myId || !tournamentSyncRange) return;
    setSyncingTournament(true);
    const res = await markTournamentDates(myId, tournamentSyncRange.name, tournamentSyncRange.start, tournamentSyncRange.end);
    setSyncingTournament(false);
    if (!res.ok) { showAlert('Error', res.message || 'Could not save the tournament dates.'); return; }
    setShowTournamentSyncModal(false);
    showAlert('Marked', "Your club's been told — makeup credits were created for your private lessons and you're excluded from group lessons that week.");
    loadClubSchedule();
  };

  const deleteEvent = (event: CalendarEvent) => {
    showConfirm('Delete Event', `Delete "${event.title}"?`, async () => {
      await cancelTournamentReminder(event.reminder_notification_id);
      await supabase.from('calendar_events').delete().eq('id', event.id);
      loadEvents();
    });
  };

  const getDaysInMonth = (year: number, month: number) => new Date(year, month + 1, 0).getDate();

  const getFirstDayOfMonth = (year: number, month: number) => {
    const d = new Date(year, month, 1).getDay();
    return d === 0 ? 6 : d - 1;
  };

  const prevMonth = () => {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear(viewYear - 1);
    } else {
      setViewMonth(viewMonth - 1);
    }
  };

  const nextMonth = () => {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear(viewYear + 1);
    } else {
      setViewMonth(viewMonth + 1);
    }
  };

  const goToToday = () => {
    setViewYear(today.getFullYear());
    setViewMonth(today.getMonth());
    setSelectedDate(localDateStr(today));
  };

  const getEventsForDate = (dateStr: string) => {
    return events.filter(e => {
      if (e.event_type === 'tournament' && e.event_end_date) {
        return dateStr >= e.event_date && dateStr <= e.event_end_date;
      }
      return e.event_date === dateStr;
    });
  };

  // Registration-deadline marker is deliberately separate from the
  // tournament's own day dots — it's a different date, not another event.
  const getDeadlinesForDate = (dateStr: string) => {
    return events.filter(e => e.event_type === 'tournament' && e.registration_deadline === dateStr);
  };

  // A day can be a registration deadline for a tournament that isn't
  // otherwise happening that day (its own event dates are elsewhere) —
  // include it here too so tapping either marker reveals the same detail.
  const selectedEvents = (() => {
    const dateEvents = getEventsForDate(selectedDate);
    const deadlineOnly = getDeadlinesForDate(selectedDate).filter(
      (d) => !dateEvents.some((e) => e.id === d.id)
    );
    return [...dateEvents, ...deadlineOnly];
  })();

  // Club lessons recur weekly by day-of-week, not a single calendar_events
  // row — so "does this date have a lesson" is a day-of-week match, not a
  // date lookup, and every date sharing that weekday counts (not just the
  // "next occurrence" used for attendance).
  const hasPrivateLessonOnDate = (dateStr: string) => {
    const dow = new Date(`${dateStr}T00:00:00`).getDay();
    return myLessons.some((l) => l.day_of_week === dow);
  };
  const hasGroupLessonOnDate = (dateStr: string) => {
    const dow = new Date(`${dateStr}T00:00:00`).getDay();
    return myGroupLessons.some((g) => g.day_of_week === dow);
  };
  // Unlike the recurring day-of-week checks above, a scheduled makeup is a
  // one-off — it lives on the exact calendar date the coach/club booked it
  // for, not a recurring weekday.
  const hasMakeupOnDate = (dateStr: string) => makeupCredits.some((m) => m.status === 'scheduled' && m.scheduledDate === dateStr);

  type DayItem =
    | { kind: 'personal'; time: string | null; event: CalendarEvent }
    | { kind: 'private'; time: string; lesson: ChildLesson }
    | { kind: 'group'; time: string; lesson: ChildGroupLesson }
    | { kind: 'makeup'; time: string; credit: MakeupCredit };

  // Merges the player's own events with any club lesson that recurs on this
  // date's weekday, so a lesson shows up as "training" right in the day's
  // list rather than only in a separate club-schedule block.
  const dayItems: DayItem[] = (() => {
    const dow = new Date(`${selectedDate}T00:00:00`).getDay();
    const personal: DayItem[] = selectedEvents.map((event) => ({ kind: 'personal', time: event.start_time, event }));
    const priv: DayItem[] = myLessons.filter((l) => l.day_of_week === dow).map((l) => ({ kind: 'private', time: l.start_time, lesson: l }));
    const grp: DayItem[] = myGroupLessons.filter((g) => g.day_of_week === dow).map((g) => ({ kind: 'group', time: g.start_time, lesson: g }));
    const makeup: DayItem[] = makeupCredits
      .filter((m) => m.status === 'scheduled' && m.scheduledDate === selectedDate)
      .map((m) => ({ kind: 'makeup', time: m.scheduledStartTime ?? '', credit: m }));
    return [...personal, ...priv, ...grp, ...makeup].sort((a, b) => (a.time ?? '').localeCompare(b.time ?? ''));
  })();

  const pendingMakeupCredits = makeupCredits.filter((m) => m.status !== 'done');

  const formatSelectedDate = () => {
    const d = new Date(selectedDate + 'T00:00:00');
    return d.toLocaleDateString('en-US', {
      weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
    });
  };

  const renderCalendarGrid = () => {
    const daysInMonth = getDaysInMonth(viewYear, viewMonth);
    const firstDay = getFirstDayOfMonth(viewYear, viewMonth);
    const todayStr = localDateStr(today);

    const cells = [];

    for (let i = 0; i < firstDay; i++) {
      cells.push(<View key={`empty-${i}`} style={styles.dayCell} />);
    }

    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const isToday = dateStr === todayStr;
      const isSelected = dateStr === selectedDate;
      const dayEvents = getEventsForDate(dateStr);
      const dayDeadlines = getDeadlinesForDate(dateStr);
      const dayHasPrivate = hasPrivateLessonOnDate(dateStr);
      const dayHasGroup = hasGroupLessonOnDate(dateStr);
      const dayHasMakeup = hasMakeupOnDate(dateStr);

      cells.push(
        <TouchableOpacity
          key={day}
          style={[
            styles.dayCell,
            isSelected && styles.dayCellSelected,
            isToday && !isSelected && styles.dayCellToday,
          ]}
          onPress={() => setSelectedDate(dateStr)}
          onLongPress={() => {
            setSelectedDate(dateStr);
            openAddModal(dateStr);
          }}
        >
          {dayDeadlines.length > 0 && (
            <View style={styles.deadlineBadge}>
              <Icon name="clock-outline" size={9} color="#FFFFFF" />
            </View>
          )}
          <Text style={[
            styles.dayCellText,
            isSelected && styles.dayCellTextSelected,
            isToday && !isSelected && styles.dayCellTextToday,
          ]}>
            {day}
          </Text>
          {(dayEvents.length > 0 || dayHasPrivate || dayHasGroup || dayHasMakeup) && (
            <View style={styles.dotRow}>
              {dayEvents.slice(0, 2).map((e, i) => (
                <View
                  key={i}
                  style={[styles.eventDot, { backgroundColor: getEventColor(e.event_type) }]}
                />
              ))}
              {dayHasPrivate && <View style={[styles.eventDot, { backgroundColor: LESSON_DOT_COLOR.private }]} />}
              {dayHasGroup && <View style={[styles.eventDot, { backgroundColor: LESSON_DOT_COLOR.group }]} />}
              {dayHasMakeup && <View style={[styles.eventDot, { backgroundColor: LESSON_DOT_COLOR.makeup }]} />}
            </View>
          )}
        </TouchableOpacity>
      );
    }

    const rows = [];
    for (let i = 0; i < cells.length; i += 7) {
      const rowCells = cells.slice(i, i + 7);
      while (rowCells.length < 7) {
        rowCells.push(<View key={`pad-${i}-${rowCells.length}`} style={styles.dayCell} />);
      }
      rows.push(
        <View key={`row-${i}`} style={styles.calendarRow}>
          {rowCells}
        </View>
      );
    }

    return rows;
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Calendar</Text>
        <TouchableOpacity onPress={goToToday}>
          <Text style={styles.todayBtn}>Today</Text>
        </TouchableOpacity>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        {membership && (
          <View style={styles.clubBanner}>
            <View style={styles.clubBannerRow}>
              <View style={styles.clubBannerIconWrap}>
                <Icon name="office-building-outline" size={22} color={Theme.textPrimary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.clubBannerTitle}>{membership.clubName} Schedule</Text>
                <Text style={styles.clubBannerDesc}>Training days are highlighted below</Text>
              </View>
            </View>
            {hasLinkedParent && (
              <View style={styles.parentHandlesRow}>
                <Icon name="information-outline" size={14} color={Theme.textSecondary} />
                <Text style={styles.parentHandlesText}>Your parent manages scheduling and payments for you</Text>
              </View>
            )}
            <View style={styles.manageActionsRow}>
              <TouchableOpacity style={styles.manageActionBtn} onPress={() => openAddModal(selectedDate, 'tournament')}>
                <Icon name="trophy-outline" size={14} color={Theme.textPrimary} />
                <Text style={styles.manageActionText}>Tournament</Text>
              </TouchableOpacity>
              {!hasLinkedParent && myLessons.length > 0 && (
                <TouchableOpacity style={styles.manageActionBtn} onPress={openRescheduleModal}>
                  <Icon name="calendar-sync-outline" size={14} color={Theme.textPrimary} />
                  <Text style={styles.manageActionText}>Reschedule</Text>
                </TouchableOpacity>
              )}
              {!hasLinkedParent && (
                <TouchableOpacity style={styles.manageActionBtn} onPress={openAvailabilityModal}>
                  <Icon name="account-clock-outline" size={14} color={Theme.textPrimary} />
                  <Text style={styles.manageActionText}>Coach times</Text>
                </TouchableOpacity>
              )}
              {!hasLinkedParent && (
                <TouchableOpacity style={styles.manageActionBtn} onPress={openPayModal}>
                  <Icon name="clipboard-text-outline" size={14} color={Theme.textPrimary} />
                  <Text style={styles.manageActionText}>Report Payment</Text>
                </TouchableOpacity>
              )}
            </View>
            {/* Makeup scheduling (find a slot, confirm a proposed time, chase
                a missed lesson) is the parent's job once one's linked — see
                parentHandlesText above. Once a credit is actually scheduled
                it moves onto the calendar itself (gold dot, tap the date) —
                same convention as the parent's own dashboard — so this list
                only ever needs to show things still awaiting action. */}
            {!hasLinkedParent && pendingMakeupCredits.filter((m) => m.status !== 'scheduled').map((m) => (
              <View key={`${m.kind}_${m.id}`}>
                <View style={styles.clubBannerMakeupRow}>
                  <Icon name="refresh" size={13} color={Theme.textPrimary} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.clubBannerMakeupText}>
                      {m.label} {m.status === 'pending_approval'
                        ? `— waiting on your coach's approval (${formatDateLong(m.scheduledDate!)} at ${m.scheduledStartTime ? formatTime12h(m.scheduledStartTime) : ''})`
                        : m.status === 'proposed'
                          ? `— your coach suggested ${formatDateLong(m.scheduledDate!)} at ${m.scheduledStartTime ? formatTime12h(m.scheduledStartTime) : ''}`
                          : `— needs a makeup slot (missed ${formatDateLong(m.missedDate)})`}
                    </Text>
                  </View>
                  {m.status === 'owed' && m.kind === 'private' && (
                    <TouchableOpacity style={styles.findSlotBtn} onPress={() => openMakeupSlotPicker(m)}>
                      <Text style={styles.findSlotBtnText}>Find a slot</Text>
                    </TouchableOpacity>
                  )}
                </View>
                {m.status === 'proposed' && (
                  <View style={styles.proposedActionRow}>
                    <TouchableOpacity style={styles.proposedDeclineBtn} onPress={() => declineProposedSlot(m)}>
                      <Text style={styles.proposedDeclineBtnText}>Not this time</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.findSlotBtn} onPress={() => confirmProposedSlot(m)}>
                      <Text style={styles.findSlotBtnText}>Confirm</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            ))}
          </View>
        )}

        <View style={styles.calendarCard}>
          <View style={styles.monthNav}>
            <TouchableOpacity onPress={prevMonth} style={styles.monthArrow}>
              <Icon name="chevron-left" size={28} color={Theme.textPrimary} />
            </TouchableOpacity>
            <Text style={styles.monthTitle}>
              {MONTH_NAMES[viewMonth]} {viewYear}
            </Text>
            <TouchableOpacity onPress={nextMonth} style={styles.monthArrow}>
              <Icon name="chevron-right" size={28} color={Theme.textPrimary} />
            </TouchableOpacity>
          </View>

          <View style={styles.dayHeaderRow}>
            {DAY_HEADERS.map(d => (
              <View key={d} style={styles.dayHeaderCell}>
                <Text style={styles.dayHeaderText}>{d}</Text>
              </View>
            ))}
          </View>

          <View style={styles.calendarGrid}>
            {renderCalendarGrid()}
          </View>

          <View style={styles.calendarDivider} />

          <View style={styles.legendRow}>
            {EVENT_TYPES.filter(t => t.key !== 'training').map(t => (
              <View key={t.key} style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: t.color }]} />
                <Text style={styles.legendLabel}>{t.label}</Text>
              </View>
            ))}
            {myLessons.length > 0 && (
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: LESSON_DOT_COLOR.private }]} />
                <Text style={styles.legendLabel}>Private</Text>
              </View>
            )}
            {myGroupLessons.length > 0 && (
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: LESSON_DOT_COLOR.group }]} />
                <Text style={styles.legendLabel}>Group</Text>
              </View>
            )}
            {makeupCredits.some((m) => m.status === 'scheduled') && (
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: LESSON_DOT_COLOR.makeup }]} />
                <Text style={styles.legendLabel}>Makeup</Text>
              </View>
            )}
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, styles.legendDeadlineDot]}>
                <Icon name="clock-outline" size={7} color="#FFFFFF" />
              </View>
              <Text style={styles.legendLabel}>Reg. deadline</Text>
            </View>
          </View>
        </View>

        <View style={styles.selectedDateCard}>
          <View style={styles.selectedDateHeader}>
            <Text style={styles.selectedDateTitle}>{formatSelectedDate()}</Text>
            <TouchableOpacity
              style={styles.addBtn}
              onPress={() => openAddModal()}
            >
              <Icon name="plus" size={20} color={Theme.limeAccentDark} />
            </TouchableOpacity>
          </View>

          {dayItems.length === 0 ? (
            <View style={styles.noEventsWrap}>
              <Text style={styles.noEventsText}>No events planned</Text>
              <TouchableOpacity onPress={() => openAddModal()}>
                <Text style={styles.addEventLink}>+ Add an event</Text>
              </TouchableOpacity>
            </View>
          ) : (
            dayItems.map((item) => {
              if (item.kind === 'personal') {
                const event = item.event;
                return (
                  <View key={event.id} style={styles.eventCard}>
                    <View style={[styles.eventColorBar, { backgroundColor: getEventColor(event.event_type) }]} />
                    <View style={styles.eventContent}>
                      <View style={styles.eventTopRow}>
                        <View style={styles.eventTitleRow}>
                          <Icon
                            name={getEventIcon(event.event_type) as any}
                            size={16}
                            color={getEventColor(event.event_type)}
                          />
                          <Text style={styles.eventTitle}>{event.title}</Text>
                        </View>
                        <View style={styles.eventActions}>
                          <TouchableOpacity onPress={() => openEditModal(event)}>
                            <Icon name="pencil-outline" size={18} color={Theme.textSecondary} />
                          </TouchableOpacity>
                          <TouchableOpacity onPress={() => deleteEvent(event)}>
                            <Icon name="trash-can-outline" size={18} color="#FF6B6B" />
                          </TouchableOpacity>
                        </View>
                      </View>
                      {event.start_time && (
                        <View style={styles.eventDetailRow}>
                          <Icon name="clock-outline" size={13} color={Theme.textSecondary} />
                          <Text style={styles.eventDetailText}>
                            {formatTime12h(event.start_time)}{event.end_time ? ` — ${formatTime12h(event.end_time)}` : ''}
                          </Text>
                        </View>
                      )}
                      {event.location && (
                        <View style={styles.eventDetailRow}>
                          <Icon name="map-marker-outline" size={13} color={Theme.textSecondary} />
                          <Text style={styles.eventDetailText}>{event.location}</Text>
                        </View>
                      )}
                      {event.event_type === 'tournament' && event.event_end_date && event.event_end_date !== event.event_date && (
                        <View style={styles.eventDetailRow}>
                          <Icon name="calendar-blank-outline" size={13} color={Theme.textSecondary} />
                          <Text style={styles.eventDetailText}>
                            {formatShortDate(event.event_date)} – {formatShortDate(event.event_end_date)}
                          </Text>
                        </View>
                      )}
                      {event.event_type === 'tournament' && event.registration_deadline && (
                        <View style={styles.eventDetailRow}>
                          <Icon name="clock-outline" size={13} color={DEADLINE_COLOR} />
                          <Text style={[styles.eventDetailText, styles.eventDeadlineText]}>
                            Registration closes {formatShortDate(event.registration_deadline)}
                          </Text>
                        </View>
                      )}
                      {event.notes && (
                        <Text style={styles.eventNotes}>{event.notes}</Text>
                      )}
                      {event.event_type === 'tournament' && event.registration_link && (
                        <TouchableOpacity
                          style={styles.signUpBtn}
                          onPress={() => Linking.openURL(event.registration_link!)}
                        >
                          <Icon name="link-variant" size={15} color="#FFFFFF" />
                          <Text style={styles.signUpBtnText}>Sign up</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>
                );
              }

              if (item.kind === 'private') {
                const l = item.lesson;
                const att = statusFor(privateAtt, l.id);
                const isNextOccurrence = selectedDate === nextOccurrenceDate(l.day_of_week);
                return (
                  <View key={`priv_${l.id}`} style={styles.eventCard}>
                    <View style={[styles.eventColorBar, { backgroundColor: getEventColor('training') }]} />
                    <View style={styles.eventContent}>
                      <View style={styles.eventTopRow}>
                        <View style={styles.eventTitleRow}>
                          <Icon name="lightning-bolt" size={16} color={getEventColor('training')} />
                          <Text style={styles.eventTitle}>Private lesson · {l.coach_name}</Text>
                        </View>
                        {isNextOccurrence ? (
                          <TouchableOpacity onPress={() => togglePrivateAttendance(l)}>
                            <Icon name={att.attending ? 'check-circle' : 'close-circle'} size={18} color={att.attending ? Theme.eyebrowGreen : '#c0392b'} />
                          </TouchableOpacity>
                        ) : (
                          <Text style={styles.recurringTag}>Recurring</Text>
                        )}
                      </View>
                      <View style={styles.eventDetailRow}>
                        <Icon name="clock-outline" size={13} color={Theme.textSecondary} />
                        <Text style={styles.eventDetailText}>
                          {formatTime12h(l.start_time)} — {formatTime12h(l.end_time)}{l.court_name ? ` · ${l.court_name}` : ''}
                        </Text>
                      </View>
                    </View>
                  </View>
                );
              }

              if (item.kind === 'makeup') {
                const m = item.credit;
                const att = statusFor(makeupAtt, `${m.kind}_${m.id}`);
                return (
                  <View key={`makeup_${m.kind}_${m.id}`} style={styles.eventCard}>
                    <View style={[styles.eventColorBar, { backgroundColor: LESSON_DOT_COLOR.makeup }]} />
                    <View style={styles.eventContent}>
                      <View style={styles.eventTopRow}>
                        <View style={styles.eventTitleRow}>
                          <Icon name="refresh" size={18} color={LESSON_DOT_COLOR.makeup} />
                          <Text style={styles.eventTitle}>Makeup: {m.label}</Text>
                        </View>
                        <TouchableOpacity onPress={() => toggleMakeupAttendance(m)}>
                          <Icon name={att.attending ? 'check-circle' : 'close-circle'} size={18} color={att.attending ? Theme.eyebrowGreen : '#c0392b'} />
                        </TouchableOpacity>
                      </View>
                      <View style={styles.eventDetailRow}>
                        <Icon name="clock-outline" size={13} color={Theme.textSecondary} />
                        <Text style={styles.eventDetailText}>
                          {m.scheduledStartTime ? formatTime12h(m.scheduledStartTime) : ''} — {m.scheduledEndTime ? formatTime12h(m.scheduledEndTime) : ''}{m.scheduledCourtName ? ` · ${m.scheduledCourtName}` : ''}
                        </Text>
                      </View>
                    </View>
                  </View>
                );
              }

              const g = item.lesson;
              const att = statusFor(groupAtt, g.id);
              const isNextOccurrence = selectedDate === nextOccurrenceDate(g.day_of_week);
              return (
                <View key={`grp_${g.id}`} style={styles.eventCard}>
                  <View style={[styles.eventColorBar, { backgroundColor: getEventColor('training') }]} />
                  <View style={styles.eventContent}>
                    <View style={styles.eventTopRow}>
                      <TouchableOpacity style={styles.eventTitleRow} onPress={() => openRoster(g)}>
                        <Icon name="lightning-bolt" size={18} color={getEventColor('training')} />
                        <Text style={styles.eventTitle}>{g.name}</Text>
                      </TouchableOpacity>
                      {isNextOccurrence ? (
                        <TouchableOpacity onPress={() => toggleGroupAttendance(g)}>
                          <Icon name={att.attending ? 'check-circle' : 'close-circle'} size={20} color={att.attending ? Theme.eyebrowGreen : '#c0392b'} />
                        </TouchableOpacity>
                      ) : (
                        <Text style={styles.recurringTag}>Recurring</Text>
                      )}
                    </View>
                    <View style={styles.eventDetailRow}>
                      <Icon name="clock-outline" size={14} color={Theme.textSecondary} />
                      <Text style={styles.eventDetailText}>
                        {formatTime12h(g.start_time)} — {formatTime12h(g.end_time)}
                      </Text>
                    </View>
                    <TouchableOpacity style={styles.eventRosterRow} onPress={() => openRoster(g)}>
                      <Icon name="account-multiple" size={14} color={Theme.textSecondary} />
                      <Text style={styles.eventDetailText} numberOfLines={1}>
                        {g.coach_name || 'Coach TBD'}
                      </Text>
                      <Icon name="chevron-right" size={16} color={Theme.textMuted} />
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })
          )}
        </View>
      </ScrollView>

      <Modal visible={!!rosterLesson} transparent animationType="fade" onRequestClose={() => setRosterLesson(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{rosterLesson?.name}</Text>
              <TouchableOpacity onPress={() => setRosterLesson(null)}>
                <Icon name="close" size={24} color={Theme.textPrimary} />
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              {roster.length === 0 ? (
                <Text style={styles.clubEmptyText}>No one else is enrolled yet.</Text>
              ) : (
                roster.map((r) => (
                  <View key={r.id} style={styles.rosterRow}>
                    <Text style={styles.clubRowTitle}>{firstName(r.player_name)}</Text>
                  </View>
                ))
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal visible={showPayModal} transparent animationType="fade" onRequestClose={() => setShowPayModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Report a Payment</Text>
              <TouchableOpacity onPress={() => setShowPayModal(false)}>
                <Icon name="close" size={24} color={Theme.textPrimary} />
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={styles.syncIntro}>What's this for?</Text>
              <TextInput
                style={styles.paymentInput}
                value={paymentNote}
                onChangeText={setPaymentNote}
                placeholder="e.g. October payment"
                placeholderTextColor={Theme.textSecondary}
              />

              <Text style={[styles.syncIntro, { marginTop: 14 }]}>Method</Text>
              <View style={styles.dayPillRow}>
                {PAYMENT_METHODS.map((m) => (
                  <TouchableOpacity key={m.key} style={[styles.dayPill, payMethod === m.key && styles.dayPillActive]} onPress={() => setPayMethod(m.key)}>
                    <Text style={styles.dayPillText}>{m.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={[styles.syncIntro, { marginTop: 14 }]}>Payment history</Text>
              {payments.length === 0 ? (
                <Text style={styles.paymentEmptyText}>No payment records yet.</Text>
              ) : (
                payments.map((p) => (
                  <View key={p.id} style={styles.paymentRow}>
                    <Text style={styles.slotCardTitle}>{p.label}</Text>
                    <Text style={styles.slotCardSub}>
                      {p.payment_status === 'paid' ? 'Paid' : p.payment_status === 'pending' ? 'Pending review' : p.payment_status === 'rejected' ? 'Not confirmed' : 'Unpaid'}
                      {p.payment_method ? ` · ${p.payment_method}` : ''}
                    </Text>
                  </View>
                ))
              )}

              <TouchableOpacity style={[styles.saveBtn, { marginTop: 16 }, savingPayment && { opacity: 0.6 }]} onPress={submitPayment} disabled={savingPayment}>
                <Text style={styles.saveBtnText}>{savingPayment ? 'Submitting...' : 'Submit Report'}</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal visible={showRescheduleModal} transparent animationType="fade" onRequestClose={() => setShowRescheduleModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Reschedule a Class</Text>
              <TouchableOpacity onPress={() => setShowRescheduleModal(false)}>
                <Icon name="close" size={24} color={Theme.textPrimary} />
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              {!rescheduleLesson ? (
                <>
                  <Text style={styles.syncIntro}>Which lesson do you want to move?</Text>
                  {myLessons.map((l) => (
                    <TouchableOpacity key={l.id} style={styles.slotCard} onPress={() => pickRescheduleLesson(l)}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.slotCardTitle}>{DAY_NAMES[l.day_of_week]} · {formatTime12h(l.start_time)}–{formatTime12h(l.end_time)}</Text>
                        <Text style={styles.slotCardSub}>with {l.coach_name}</Text>
                      </View>
                      <Icon name="chevron-right" size={20} color={Theme.textMuted} />
                    </TouchableOpacity>
                  ))}
                </>
              ) : (
                <>
                  <Text style={styles.syncIntro}>
                    Moving your {DAY_NAMES[rescheduleLesson.day_of_week]} {formatTime12h(rescheduleLesson.start_time)} lesson with {rescheduleLesson.coach_name}. Pick a new day:
                  </Text>
                  <View style={styles.dayPillRow}>
                    {DAY_NAMES.map((name, dow) => (
                      <TouchableOpacity key={dow} style={[styles.dayPill, rescheduleDay === dow && styles.dayPillActive]} onPress={() => pickRescheduleDay(dow)}>
                        <Text style={[styles.dayPillText, rescheduleDay === dow && styles.dayPillTextActive]}>{name.slice(0, 3)}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  {rescheduleDay !== null && (
                    loadingRescheduleBusy ? (
                      <Text style={styles.muted}>Checking {rescheduleLesson.coach_name}'s schedule...</Text>
                    ) : rescheduleSlotOptions.length === 0 ? (
                      <Text style={styles.muted}>No open times that day — try another.</Text>
                    ) : (
                      rescheduleSlotOptions.map((slot) => {
                        const key = `${rescheduleDay}_${slot.start}`;
                        return (
                          <View key={key} style={styles.slotCard}>
                            <Text style={styles.slotCardTitle}>{formatTime12h(slot.start)}–{formatTime12h(slot.end)}</Text>
                            <TouchableOpacity style={styles.selectSlotBtn} onPress={() => submitReschedule(slot)} disabled={submittingReschedule === key}>
                              <Text style={styles.selectSlotBtnText}>{submittingReschedule === key ? '...' : 'Request'}</Text>
                            </TouchableOpacity>
                          </View>
                        );
                      })
                    )
                  )}
                </>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal visible={showAvailabilityModal} transparent animationType="fade" onRequestClose={() => setShowAvailabilityModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Coach Availability</Text>
              <TouchableOpacity onPress={() => setShowAvailabilityModal(false)}>
                <Icon name="close" size={24} color={Theme.textPrimary} />
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={styles.syncIntro}>Pick a coach to see their week, or join their waitlist if they're full.</Text>
              <View style={styles.dayPillRow}>
                {schedulingCoaches.map((c) => (
                  <TouchableOpacity key={c.id} style={[styles.dayPill, availabilityCoachId === c.id && styles.dayPillActive]} onPress={() => pickAvailabilityCoach(c.id)}>
                    <Text style={[styles.dayPillText, availabilityCoachId === c.id && styles.dayPillTextActive]}>{c.full_name}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              {availabilityCoachId && (
                <>
                  <View style={styles.dayPillRow}>
                    {DAY_NAMES.map((name, dow) => (
                      <TouchableOpacity key={dow} style={[styles.dayPill, availabilityDay === dow && styles.dayPillActive]} onPress={() => pickAvailabilityDay(dow)}>
                        <Text style={[styles.dayPillText, availabilityDay === dow && styles.dayPillTextActive]}>{name.slice(0, 3)}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  {loadingAvailability ? (
                    <Text style={styles.muted}>Loading...</Text>
                  ) : availabilityBusy.length === 0 ? (
                    <Text style={styles.muted}>
                      Wide open all day ({clubHours.openTime && clubHours.closeTime ? `${formatTime12h(clubHours.openTime)}–${formatTime12h(clubHours.closeTime)}` : '8am–8pm'}).
                    </Text>
                  ) : (
                    [...availabilityBusy].sort((a, b) => a.start.localeCompare(b.start)).map((w, i) => (
                      <View key={i} style={styles.slotCard}>
                        <Text style={styles.slotCardSub}>Busy {formatTime12h(w.start)}–{formatTime12h(w.end)}</Text>
                      </View>
                    ))
                  )}
                  {isOnWaitlistFor(availabilityCoachId) ? (
                    <Text style={[styles.muted, { marginTop: 12 }]}>You're already on this coach's waitlist.</Text>
                  ) : (
                    <TouchableOpacity style={[styles.saveBtn, joiningWaitlist && { opacity: 0.6 }]} onPress={() => setWaitlistNoteModal(true)} disabled={joiningWaitlist}>
                      <Text style={styles.saveBtnText}>{joiningWaitlist ? 'Joining...' : 'Join Waitlist for This Coach'}</Text>
                    </TouchableOpacity>
                  )}
                </>
              )}
              {myWaitlist.length > 0 && (
                <>
                  <Text style={styles.waitlistSectionLabel}>YOUR WAITLIST SPOTS</Text>
                  {myWaitlist.map((w) => (
                    <View key={w.id} style={styles.clubBannerMakeupRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.clubBannerMakeupText}>
                          {w.coachName} — {w.status === 'offered' ? 'a slot opened up!' : w.status === 'waiting' ? 'waiting' : w.status}
                        </Text>
                      </View>
                      {w.status === 'waiting' && (
                        <TouchableOpacity onPress={() => leaveWaitlistEntry(w)}>
                          <Text style={styles.proposedDeclineBtnText}>Leave</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  ))}
                </>
              )}
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
                <Icon name="close" size={24} color={Theme.textPrimary} />
              </TouchableOpacity>
            </View>
            <Text style={styles.syncIntro}>
              The waitlist isn't tied to a specific day — it just puts you in line for this coach. Your club reaches out when a slot opens up. Add a note below so they know what to offer.
            </Text>
            <Text style={[styles.formLabel, { marginTop: 12 }]}>Preferred day/time (optional)</Text>
            <TextInput
              style={styles.formInput}
              placeholder="e.g. Monday afternoons"
              placeholderTextColor={Theme.textSecondary}
              value={waitlistNote}
              onChangeText={setWaitlistNote}
            />
            <TouchableOpacity style={[styles.saveBtn, { marginTop: 16 }, joiningWaitlist && { opacity: 0.6 }]} onPress={joinWaitlistForCoach} disabled={joiningWaitlist}>
              <Text style={styles.saveBtnText}>{joiningWaitlist ? 'Joining...' : 'Join Waitlist'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={showTournamentSyncModal} transparent animationType="fade" onRequestClose={() => setShowTournamentSyncModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Tell {membership?.clubName}?</Text>
              <TouchableOpacity onPress={() => setShowTournamentSyncModal(false)}>
                <Icon name="close" size={24} color={Theme.textPrimary} />
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              {(tournamentSyncLessons.priv.length > 0 || tournamentSyncLessons.grp.length > 0) && (
                <>
                  <Text style={styles.syncIntro}>You have these during that time:</Text>
                  {tournamentSyncLessons.priv.map((l) => (
                    <View key={l.id} style={styles.syncRow}>
                      <Icon name="lightning-bolt" size={14} color={getEventColor('training')} />
                      <Text style={styles.syncRowText}>Private lesson with {l.coach_name}</Text>
                    </View>
                  ))}
                  {tournamentSyncLessons.grp.map((g) => (
                    <View key={g.id} style={styles.syncRow}>
                      <Icon name="lightning-bolt" size={14} color={getEventColor('training')} />
                      <Text style={styles.syncRowText}>{g.name}</Text>
                    </View>
                  ))}
                </>
              )}
              <Text style={styles.syncNote}>
                Marking these dates with your club creates makeup credits for private lessons and excludes you from group lessons that week — no need to message your coach.
              </Text>
              <TouchableOpacity style={[styles.saveBtn, syncingTournament && { opacity: 0.6 }]} onPress={confirmTournamentSync} disabled={syncingTournament}>
                <Text style={styles.saveBtnText}>{syncingTournament ? 'Marking...' : 'Mark With Club'}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.syncSkipBtn} onPress={() => setShowTournamentSyncModal(false)}>
                <Text style={styles.syncSkipText}>Not now</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal visible={!!makeupSlotCredit} transparent animationType="fade" onRequestClose={() => setMakeupSlotCredit(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalTitle}>Pick a makeup time</Text>
                {makeupSuggestions[0] && (
                  <Text style={styles.modalDate}>With {makeupSuggestions[0].coachName}, near your missed lesson</Text>
                )}
              </View>
              <TouchableOpacity onPress={() => setMakeupSlotCredit(null)}>
                <Icon name="close" size={24} color={Theme.textPrimary} />
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              {loadingSuggestions ? (
                <Text style={styles.muted}>Looking for open slots...</Text>
              ) : makeupSuggestions.length === 0 ? (
                <Text style={styles.muted}>No open slots found in the next few weeks — ask your coach to help schedule this makeup.</Text>
              ) : (
                <>
                  {makeupSuggestions[0]?.isDifferentCoach && (
                    <Text style={styles.syncNote}>Your original coach had nothing open — here's another club coach instead.</Text>
                  )}
                  {makeupSuggestions.map((s) => {
                    const key = `${s.date}_${s.startTime}`;
                    return (
                      <View key={key} style={[styles.slotCard, s.isBestFit && styles.slotCardBest]}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.slotCardTitle}>
                            {formatShortDate(s.date)} · {formatTime12h(s.startTime)}–{formatTime12h(s.endTime)}
                          </Text>
                          <Text style={styles.slotCardSub}>
                            {s.courtName ? `${s.courtName} · ` : ''}{s.coachName}
                          </Text>
                        </View>
                        {s.isBestFit && (
                          <View style={styles.bestFitPill}>
                            <Text style={styles.bestFitPillText}>Best fit</Text>
                          </View>
                        )}
                        <TouchableOpacity
                          style={[styles.selectSlotBtn, requestingSlot === key && { opacity: 0.6 }]}
                          onPress={() => selectMakeupSuggestion(s)}
                          disabled={!!requestingSlot}
                        >
                          <Text style={styles.selectSlotBtnText}>{requestingSlot === key ? 'Sending...' : 'Select'}</Text>
                        </TouchableOpacity>
                      </View>
                    );
                  })}
                  <Text style={styles.syncNote}>
                    Your original slot opens up for other students once your coach confirms this.
                  </Text>
                </>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      <JournalSheet
        visible={postLessonPrompt}
        onClose={() => setPostLessonPrompt(false)}
        entryDate={localDateStr()}
        forceNew
        onSaved={() => setPostLessonPrompt(false)}
      />

      <Modal
        visible={showModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>
                  {editingEvent ? 'Edit Event' : 'Add Event'}
                </Text>
                <Text style={styles.modalDate}>
                  {new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-US', {
                    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
                  })}
                </Text>
              </View>
              <TouchableOpacity onPress={() => setShowModal(false)}>
                <Icon name="close" size={24} color={Theme.textPrimary} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={styles.formLabel}>Title *</Text>
              <TextInput
                style={styles.formInput}
                placeholder="e.g. Leg Day, Tournament"
                placeholderTextColor={Theme.textSecondary}
                value={formTitle}
                onChangeText={setFormTitle}
              />

              <Text style={styles.formLabel}>Type</Text>
              <View style={styles.typePillRow}>
                {EVENT_TYPES.map(t => (
                  <TouchableOpacity
                    key={t.key}
                    style={[
                      styles.typePill,
                      formType === t.key && { backgroundColor: t.color, borderColor: t.color },
                    ]}
                    onPress={() => setFormType(t.key)}
                  >
                    <Icon
                      name={t.icon as any}
                      size={14}
                      color={formType === t.key ? '#FFFFFF' : Theme.textSecondary}
                    />
                    <Text style={[
                      styles.typePillText,
                      formType === t.key && styles.typePillTextActive,
                    ]}>
                      {t.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {formType !== 'tournament' && (
                <>
                  <Text style={styles.formLabel}>Time (optional)</Text>
                  <View style={styles.timeRow}>
                    <TextInput
                      style={[styles.formInput, { flex: 1 }]}
                      placeholder="Start (e.g. 9:00 AM)"
                      placeholderTextColor={Theme.textSecondary}
                      value={formStartTime}
                      onChangeText={setFormStartTime}
                    />
                    <Text style={styles.timeDash}>—</Text>
                    <TextInput
                      style={[styles.formInput, { flex: 1 }]}
                      placeholder="End (e.g. 11:00 AM)"
                      placeholderTextColor={Theme.textSecondary}
                      value={formEndTime}
                      onChangeText={setFormEndTime}
                    />
                  </View>
                </>
              )}

              <Text style={styles.formLabel}>{formType === 'tournament' ? 'Location *' : 'Location (optional)'}</Text>
              <TextInput
                style={styles.formInput}
                placeholder="e.g. Community Center"
                placeholderTextColor={Theme.textSecondary}
                value={formLocation}
                onChangeText={setFormLocation}
              />

              {formType === 'tournament' && (
                <>
                  <Text style={styles.formLabel}>Ends (optional — for multi-day tournaments)</Text>
                  <View style={styles.typePillRow}>
                    {END_DATE_OFFSETS.map((offset) => {
                      const value = offset === 0 ? '' : addDays(selectedDate, offset);
                      const active = offset === 0 ? formEndDate === '' : formEndDate === value;
                      return (
                        <TouchableOpacity
                          key={offset}
                          style={[styles.smallPill, active && styles.smallPillActive]}
                          onPress={() => setFormEndDate(value)}
                        >
                          <Text style={[styles.smallPillText, active && styles.smallPillTextActive]}>
                            {offset === 0 ? 'Single day' : `+${offset}d`}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>

                  <TouchableOpacity
                    style={styles.collapsibleHeader}
                    onPress={() => setShowRegistrationDetails((v) => !v)}
                  >
                    <Text style={styles.collapsibleHeaderText}>Registration details (optional)</Text>
                    <Icon
                      name={showRegistrationDetails ? 'chevron-up' : 'chevron-down'}
                      size={18}
                      color={Theme.textSecondary}
                    />
                  </TouchableOpacity>

                  {showRegistrationDetails && (
                    <>
                      <Text style={styles.formLabel}>Registration deadline</Text>
                      <View style={styles.deadlineHeaderRow}>
                        <Text style={styles.deadlineValueText}>
                          {formRegistrationDeadline ? `Closes ${formatShortDate(formRegistrationDeadline)}` : 'No deadline set'}
                        </Text>
                        {!!formRegistrationDeadline && (
                          <TouchableOpacity onPress={() => setFormRegistrationDeadline('')}>
                            <Text style={styles.deadlineClearText}>Clear</Text>
                          </TouchableOpacity>
                        )}
                      </View>
                      <MiniDatePicker
                        value={formRegistrationDeadline || null}
                        onChange={setFormRegistrationDeadline}
                        maxDate={addDays(selectedDate, -1)}
                        accentColor={DEADLINE_COLOR}
                      />

                      <Text style={styles.formLabel}>Registration link</Text>
                      <TextInput
                        style={styles.formInput}
                        placeholder="https://tournamentsoftware.com/..."
                        placeholderTextColor={Theme.textSecondary}
                        value={formRegistrationLink}
                        onChangeText={setFormRegistrationLink}
                        autoCapitalize="none"
                        autoCorrect={false}
                        keyboardType="url"
                      />

                      <Text style={styles.formLabel}>Notes</Text>
                      <TextInput
                        style={[styles.formInput, styles.formNotesInput]}
                        placeholder="Any details to remember..."
                        placeholderTextColor={Theme.textSecondary}
                        value={formNotes}
                        onChangeText={setFormNotes}
                        multiline
                        numberOfLines={3}
                      />
                    </>
                  )}
                </>
              )}

              {formType !== 'tournament' && (
                <>
                  <Text style={styles.formLabel}>Notes (optional)</Text>
                  <TextInput
                    style={[styles.formInput, styles.formNotesInput]}
                    placeholder="Any details to remember..."
                    placeholderTextColor={Theme.textSecondary}
                    value={formNotes}
                    onChangeText={setFormNotes}
                    multiline
                    numberOfLines={3}
                  />
                </>
              )}

              <TouchableOpacity style={styles.saveBtn} onPress={saveEvent}>
                <Text style={styles.saveBtnText}>
                  {editingEvent ? 'Save Changes' : 'Add Event'}
                </Text>
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
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 60,
    paddingBottom: 16,
  },
  headerTitle: { fontFamily: Fonts.serifMedium, fontSize: 20, color: Theme.textPrimary },
  todayBtn: { fontSize: 14, color: Theme.eyebrowGreen, fontWeight: '600' },
  scroll: { paddingHorizontal: 24, paddingBottom: 120 },
  calendarCard: {
    backgroundColor: Theme.cardWhite,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Theme.divider,
    padding: 20,
    marginBottom: 16,
  },
  calendarDivider: {
    height: 1,
    backgroundColor: Theme.divider,
    marginVertical: 16,
  },
  monthNav: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  monthArrow: { padding: 4 },
  monthTitle: { fontSize: 24, fontWeight: 'bold', color: Theme.textPrimary },
  dayHeaderRow: { flexDirection: 'row', marginBottom: 8 },
  dayHeaderCell: { flex: 1, alignItems: 'center' },
  dayHeaderText: { fontSize: 14, fontWeight: '600', color: Theme.textSecondary },
  calendarGrid: { marginBottom: 16 },
  calendarRow: { flexDirection: 'row' },
  dayCell: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    minHeight: 58,
  },
  dayCellSelected: {
    backgroundColor: Theme.limeAccent,
    borderRadius: 14,
  },
  dayCellToday: {
    borderWidth: 1.5,
    borderColor: Theme.eyebrowGreen,
    borderRadius: 14,
  },
  dayCellText: { fontSize: 18, color: Theme.textPrimary, fontWeight: '500' },
  dayCellTextSelected: { color: Theme.limeAccentDark, fontWeight: 'bold' },
  dayCellTextToday: { color: Theme.eyebrowGreen, fontWeight: 'bold' },
  dotRow: {
    flexDirection: 'row',
    gap: 3,
    marginTop: 5,
  },
  eventDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  legendRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 20,
    paddingHorizontal: 4,
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendDeadlineDot: {
    width: 12, height: 12, borderRadius: 6, backgroundColor: DEADLINE_COLOR,
    alignItems: 'center', justifyContent: 'center',
  },
  legendLabel: { fontSize: 13, color: Theme.textSecondary },
  deadlineBadge: {
    position: 'absolute', top: 4, right: 4,
    width: 14, height: 14, borderRadius: 7,
    backgroundColor: DEADLINE_COLOR, alignItems: 'center', justifyContent: 'center',
  },
  selectedDateCard: {
    backgroundColor: Theme.cardWhite,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },
  selectedDateHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  selectedDateTitle: { fontSize: 16, fontWeight: 'bold', color: Theme.textPrimary },
  addBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Theme.limeAccent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  noEventsWrap: { alignItems: 'center', paddingVertical: 20, gap: 8 },
  noEventsText: { fontSize: 15, color: Theme.textSecondary, fontStyle: 'italic' },
  addEventLink: { fontSize: 13, color: Theme.eyebrowGreen, fontWeight: '600' },
  eventCard: {
    flexDirection: 'row',
    marginBottom: 12,
    borderRadius: 10,
    backgroundColor: Theme.background,
    overflow: 'hidden',
  },
  eventColorBar: { width: 4 },
  eventContent: { flex: 1, padding: 14 },
  eventTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  eventTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  eventTitle: { fontSize: 17, fontWeight: '700', color: Theme.textPrimary },
  eventActions: { flexDirection: 'row', gap: 12 },
  eventDetailRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 6 },
  eventDetailText: { fontSize: 15, color: Theme.textSecondary },
  eventRosterRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 6 },
  eventNotes: { fontSize: 13, color: Theme.textSecondary, marginTop: 6, fontStyle: 'italic' },
  eventDeadlineText: { color: DEADLINE_COLOR, fontWeight: '600' },
  signUpBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: Theme.eyebrowGreen, borderRadius: 10, paddingVertical: 10, marginTop: 10,
  },
  signUpBtnText: { color: '#FFFFFF', fontWeight: '700', fontSize: 14 },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: Theme.background,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    maxHeight: '85%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 20,
  },
  modalTitle: { fontFamily: Fonts.serifMedium, fontSize: 20, color: Theme.textPrimary },
  modalDate: { fontSize: 13, color: Theme.eyebrowGreen, marginTop: 2 },
  formLabel: { fontSize: 13, color: Theme.textSecondary, marginBottom: 6, marginTop: 12 },
  formInput: {
    backgroundColor: Theme.cardWhite,
    borderRadius: 10,
    padding: 14,
    color: Theme.textPrimary,
    fontSize: 15,
    borderWidth: 1,
    borderColor: Theme.divider,
  },
  formNotesInput: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  timeRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  timeDash: { color: Theme.textSecondary, fontSize: 16 },
  typePillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  typePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: Theme.cardWhite,
    borderWidth: 1,
    borderColor: Theme.divider,
  },
  typePillText: { fontSize: 13, fontWeight: '600', color: Theme.textSecondary },
  typePillTextActive: { color: '#FFFFFF' },
  smallPill: {
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 16,
    backgroundColor: Theme.cardWhite, borderWidth: 1, borderColor: Theme.divider,
  },
  smallPillActive: { backgroundColor: '#E74C3C', borderColor: '#E74C3C' },
  smallPillText: { fontSize: 12, fontWeight: '600', color: Theme.textSecondary },
  smallPillTextActive: { color: '#FFFFFF' },
  collapsibleHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 12, marginTop: 8, borderTopWidth: 1, borderTopColor: Theme.divider,
  },
  collapsibleHeaderText: { fontSize: 14, fontWeight: '600', color: Theme.textPrimary },
  deadlineHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  deadlineValueText: { fontSize: 14, fontWeight: '600', color: Theme.textPrimary },
  deadlineClearText: { fontSize: 13, fontWeight: '600', color: '#E74C3C' },
  saveBtn: {
    backgroundColor: Theme.limeAccent,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 24,
    marginBottom: 16,
  },
  saveBtnText: { color: Theme.limeAccentDark, fontWeight: 'bold', fontSize: 16 },

  clubEmptyText: { fontSize: 14, color: Theme.textSecondary, fontStyle: 'italic' },
  clubRowTitle: { fontSize: 15, fontWeight: '600', color: Theme.textPrimary },
  rosterRow: { paddingVertical: 12, borderTopWidth: 1, borderTopColor: Theme.divider },

  clubBanner: { backgroundColor: Theme.cardTinted, borderRadius: 16, padding: 16, marginBottom: 16 },
  clubBannerRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  clubBannerIconWrap: { width: 44, height: 44, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.5)', alignItems: 'center', justifyContent: 'center' },
  clubBannerTitle: { fontFamily: Fonts.sansSemiBold, fontSize: 17, color: Theme.textPrimary, marginBottom: 3 },
  clubBannerDesc: { fontFamily: Fonts.sansRegular, fontSize: 15, color: Theme.textSecondary },
  clubBannerMakeupRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10 },
  clubBannerMakeupText: { fontSize: 14, color: Theme.textPrimary, fontWeight: '500', flex: 1 },
  recurringTag: { fontSize: 11, fontWeight: '600', color: Theme.textMuted },

  manageActionsRow: { flexDirection: 'row', gap: 8, marginTop: 12, flexWrap: 'wrap' },
  manageActionBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(255,255,255,0.6)', borderRadius: 16, paddingHorizontal: 12, paddingVertical: 7 },
  manageActionText: { fontSize: 13, fontWeight: '700', color: Theme.textPrimary },
  parentHandlesRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 },
  parentHandlesText: { fontSize: 13, color: Theme.textSecondary, flex: 1 },
  paymentInput: { backgroundColor: Theme.cardTinted, borderRadius: 10, padding: 14, color: Theme.textPrimary, fontSize: 15 },
  paymentEmptyText: { fontSize: 13, color: Theme.textSecondary, fontStyle: 'italic' },
  paymentRow: { paddingVertical: 10, borderTopWidth: 1, borderTopColor: Theme.divider },

  dayPillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 },
  dayPill: { backgroundColor: Theme.cardTinted, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 8 },
  dayPillActive: { backgroundColor: Theme.limeAccent },
  dayPillText: { fontSize: 13, fontWeight: '600', color: Theme.textPrimary },
  dayPillTextActive: { color: Theme.limeAccentDark },
  waitlistSectionLabel: { fontSize: 12, fontWeight: '700', color: Theme.textSecondary, letterSpacing: 0.5, marginTop: 16, marginBottom: 4 },

  syncIntro: { fontSize: 14, fontWeight: '600', color: Theme.textPrimary, marginBottom: 10 },
  syncRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6 },
  syncRowText: { fontSize: 14, color: Theme.textPrimary },
  syncNote: { fontSize: 13, color: Theme.textSecondary, lineHeight: 19, marginTop: 14, marginBottom: 4 },
  syncSkipBtn: { alignItems: 'center', paddingVertical: 14 },
  syncSkipText: { fontSize: 14, fontWeight: '600', color: Theme.textSecondary },

  findSlotBtn: { backgroundColor: 'rgba(255,255,255,0.6)', borderRadius: 14, paddingHorizontal: 10, paddingVertical: 5 },
  findSlotBtnText: { fontSize: 12, fontWeight: '700', color: Theme.textPrimary },
  proposedActionRow: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 4 },
  proposedDeclineBtn: { borderRadius: 14, paddingHorizontal: 10, paddingVertical: 5 },
  proposedDeclineBtnText: { fontSize: 12, fontWeight: '700', color: Theme.textSecondary },
  muted: { fontSize: 14, color: Theme.textSecondary, fontStyle: 'italic', paddingVertical: 12 },
  slotCard: {
    flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: Theme.background,
    borderRadius: 12, borderWidth: 1, borderColor: Theme.divider, padding: 14, marginBottom: 10,
  },
  slotCardBest: { borderColor: Theme.eyebrowGreen, borderWidth: 1.5 },
  slotCardTitle: { fontSize: 15, fontWeight: '700', color: Theme.textPrimary },
  slotCardSub: { fontSize: 13, color: Theme.textSecondary, marginTop: 2 },
  bestFitPill: { backgroundColor: Theme.cardTinted, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 4 },
  bestFitPillText: { fontSize: 11, fontWeight: '700', color: Theme.eyebrowGreen },
  selectSlotBtn: { backgroundColor: Theme.limeAccent, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8 },
  selectSlotBtnText: { fontSize: 13, fontWeight: '700', color: Theme.limeAccentDark },
});
