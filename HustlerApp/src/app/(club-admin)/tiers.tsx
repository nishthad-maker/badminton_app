import { View, StyleSheet, ScrollView, TouchableOpacity, Modal } from 'react-native';
import { TextInput } from '@/components/TextInput';
import { Text } from '@/components/Text';
import { Icon } from '@/components/icons/Icon';
import { MiniDatePicker } from '@/components/MiniDatePicker';
import { TimePicker } from '@/components/TimePicker';
import { useState, useCallback, useEffect } from 'react';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Theme, Fonts } from '@/constants/theme';
import { supabase } from '../../lib/supabase';
import { showAlert, showConfirm } from '../../lib/ui';
import { getMyClub } from '../../lib/club';
import { getClubCourts, findCourtConflicts, formatCourtConflicts, Court } from '../../lib/courts';
import { colorForId } from '../../lib/colors';
import { DAY_NAMES, formatTime12h, firstName } from '../../lib/scheduling';
import {
  getClubMakeupCredits, scheduleMakeup, markMakeupDone, approveMakeupRequest, declineMakeupRequest,
  getClubTournamentBlocks, getMakeupSuggestions, proposeMakeupSlot, withdrawMakeupProposal,
  MakeupCredit, ClubTournamentBlock, MakeupSuggestion,
} from '../../lib/makeup';
import {
  getGroupLessons, createGroupLesson, assignLessonCoaches, renameGroupLesson, deleteGroupLesson,
  addTimeSlot, updateTimeSlot, deleteTimeSlot, setMainCoach, addAssistantCoach, removeLessonCoach,
  getRoster, addPlayerToLesson, removePlayerFromLesson, getPlayerFolder,
  getCourtOverrides, setCourtOverride, clearCourtOverride,
  GroupLesson, RosterPlayer, SlotDraft, CourtOverride, PlayerFolder,
} from '../../lib/lessons';
import { searchClubRosterPlayers, addPlayerToRoster, skipPrivateLessonCard, PlayerSearchResult } from '../../lib/club';
import { NoClubPrompt } from '@/components/NoClubPrompt';
import { SetupLockedPlaceholder } from '@/components/SetupLockedPlaceholder';
import { SearchInput } from '@/components/SearchInput';

type Coach = { id: string; full_name: string };
type ClubRosterEntry = { id: string; player_id: string; full_name: string; level: string | null };
type PrivateSlotDraft = { coachId: string | null; day: number; start: string; end: string; isRecurring: boolean; oneTimeDate: string | null; courtId: string | null };
type PrivateWizardEntry = { coachId: string | null; start: string; end: string };

const todayStr = () => new Date().toISOString().split('T')[0];

const emptySlot = (): SlotDraft => ({ day: 1, start: '16:00', end: '17:00', isRecurring: true, oneTimeDate: null, courtIds: [] });
const emptyPrivateSlot = (coachId: string | null = null): PrivateSlotDraft => ({ coachId, day: 1, start: '16:00', end: '17:00', isRecurring: true, oneTimeDate: null, courtId: null });

const slotSummary = (slot: { day_of_week: number; start_time: string; end_time: string; is_recurring: boolean; one_time_date: string | null }) => {
  const time = `${formatTime12h(slot.start_time)}–${formatTime12h(slot.end_time)}`;
  if (!slot.is_recurring && slot.one_time_date) return `${slot.one_time_date} · ${time} (one-time)`;
  return `${DAY_NAMES[slot.day_of_week].slice(0, 3)} · ${time}`;
};

export default function GroupLessonsScreen() {
  const params = useLocalSearchParams<{ view?: string }>();
  const [hasClub, setHasClub] = useState(true);
  const [onboardingCompleted, setOnboardingCompleted] = useState(true);
  const [clubId, setClubId] = useState<string | null>(null);
  const [isOwner, setIsOwner] = useState(false);
  const [coaches, setCoaches] = useState<Coach[]>([]);
  const [courts, setCourts] = useState<Court[]>([]);
  const [lessons, setLessons] = useState<GroupLesson[]>([]);
  const [loading, setLoading] = useState(true);

  const [screenTab, setScreenTab] = useState<'group' | 'private' | 'makeups'>('group');
  const [groupQuery, setGroupQuery] = useState('');

  // ── Tournament Makeups tab ──
  const [makeupCredits, setMakeupCredits] = useState<MakeupCredit[]>([]);
  const [makeupFilter, setMakeupFilter] = useState<'all' | 'confirmed' | 'needs-approval' | 'needs-slot'>('all');
  const [tournamentBlocks, setTournamentBlocks] = useState<ClubTournamentBlock[]>([]);
  const [scheduleCredit, setScheduleCredit] = useState<MakeupCredit | null>(null);
  const [suggestCredit, setSuggestCredit] = useState<MakeupCredit | null>(null);
  const [suggestions, setSuggestions] = useState<MakeupSuggestion[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [sendingSlot, setSendingSlot] = useState<string | null>(null);
  const [scheduleDate, setScheduleDate] = useState<string | null>(null);
  const [scheduleStart, setScheduleStart] = useState<string | null>(null);
  const [scheduleEnd, setScheduleEnd] = useState<string | null>(null);
  const [scheduleCourtId, setScheduleCourtId] = useState<string | null>(null);
  const [savingSchedule, setSavingSchedule] = useState(false);

  // ── Private tab: searchable roster cards → group-lesson membership + schedule action ──
  const [clubRoster, setClubRoster] = useState<ClubRosterEntry[]>([]);
  const [rosterQuery, setRosterQuery] = useState('');
  const [privatePlayer, setPrivatePlayer] = useState<ClubRosterEntry | null>(null);
  const [privateFolder, setPrivateFolder] = useState<PlayerFolder | null>(null);
  const [privateFolderLoading, setPrivateFolderLoading] = useState(false);
  const [schedulingOpen, setSchedulingOpen] = useState(false);
  const [schedSlots, setSchedSlots] = useState<PrivateSlotDraft[]>([]);
  const [schedDraft, setSchedDraft] = useState<PrivateSlotDraft>(emptyPrivateSlot());
  // Tracks whether the visible draft has actually been edited since it was
  // last reset — lets Save silently include a genuinely-edited second (or
  // later) slot without also including an untouched leftover default draft
  // as a phantom extra lesson.
  const [schedDraftTouched, setSchedDraftTouched] = useState(false);
  const [schedSaving, setSchedSaving] = useState(false);
  // First-time private-lesson wizard: days → per-day coach+time entries
  // (each day can hold more than one lesson via the per-day "+"). Once a
  // player has at least one private lesson, the flat fast-form above (via
  // schedSlots/schedDraft) takes over instead — same split as group lessons.
  const [privateWizardStep, setPrivateWizardStep] = useState(1);
  const [privateWizardDays, setPrivateWizardDays] = useState<number[]>([]);
  const [privateWizardEntries, setPrivateWizardEntries] = useState<Record<number, PrivateWizardEntry[]>>({});

  const [detailId, setDetailId] = useState<string | null>(null);
  // First open of a lesson with no schedule yet (e.g. the auto-created
  // Beginners/Advanced/All cards from club skill levels) walks through
  // coach → days → per-day time → roster instead of the all-at-once editor
  // below. null = normal editor; a step number = still in the first-time wizard.
  const [detailWizardStep, setDetailWizardStep] = useState<number | null>(null);
  const [detailWizardMainCoachId, setDetailWizardMainCoachId] = useState<string | null>(null);
  const [detailWizardAssistantIds, setDetailWizardAssistantIds] = useState<string[]>([]);
  const [detailWizardDays, setDetailWizardDays] = useState<number[]>([]);
  const [detailWizardTimes, setDetailWizardTimes] = useState<Record<number, { start: string; end: string; courtIds: string[] }>>({});
  const [detailWizardSaving, setDetailWizardSaving] = useState(false);
  const [roster, setRoster] = useState<RosterPlayer[]>([]);
  const [nameDraft, setNameDraft] = useState('');
  const [savingName, setSavingName] = useState(false);
  const [addingSlot, setAddingSlot] = useState(false);
  const [newSlot, setNewSlot] = useState<SlotDraft>(emptySlot());
  const [playerQuery, setPlayerQuery] = useState('');
  const [playerResults, setPlayerResults] = useState<PlayerSearchResult[]>([]);
  const [addingPlayerId, setAddingPlayerId] = useState<string | null>(null);

  // Per-date court override (edit one session instance's courts only)
  const [overrideSlot, setOverrideSlot] = useState<GroupLesson['slots'][number] | null>(null);
  const [slotOverrides, setSlotOverrides] = useState<CourtOverride[]>([]);
  const [overrideDate, setOverrideDate] = useState<string | null>(null);
  const [overrideCourtIds, setOverrideCourtIds] = useState<string[]>([]);
  const [savingOverride, setSavingOverride] = useState(false);

  // Create wizard — same days → per-day time → roster pattern as a lesson's
  // first-time setup (see detailWizard* below), plus a leading step for
  // name/coach since a brand-new lesson needs those before anything else.
  const [showWizard, setShowWizard] = useState(false);
  const [step, setStep] = useState(1);
  const [wName, setWName] = useState('');
  const [wMainCoachId, setWMainCoachId] = useState<string | null>(null);
  const [wAssistantIds, setWAssistantIds] = useState<string[]>([]);
  const [wDays, setWDays] = useState<number[]>([]);
  const [wTimes, setWTimes] = useState<Record<number, { start: string; end: string; courtIds: string[] }>>({});
  const [wPlayerQuery, setWPlayerQuery] = useState('');
  const [wPlayerResults, setWPlayerResults] = useState<PlayerSearchResult[]>([]);
  const [wPlayers, setWPlayers] = useState<PlayerSearchResult[]>([]);
  const [wSaving, setWSaving] = useState(false);

  const load = async () => {
    const club = await getMyClub();
    if (!club) { setHasClub(false); setLoading(false); return; }
    setHasClub(true);
    setClubId(club.clubId);
    setIsOwner(club.role === 'owner');
    setOnboardingCompleted(club.onboardingCompleted);
    if (!club.onboardingCompleted) { setLoading(false); return; }

    const { data: coachRows } = await supabase
      .from('club_coaches')
      .select('coach_id, profiles(full_name)')
      .eq('club_id', club.clubId)
      .eq('status', 'active');
    setCoaches((coachRows ?? []).map((c: any) => ({ id: c.coach_id, full_name: c.profiles?.full_name ?? 'Coach' })));

    setCourts(await getClubCourts(club.clubId));
    setLessons(await getGroupLessons(club.clubId));
    setMakeupCredits(await getClubMakeupCredits(club.clubId));
    setTournamentBlocks(await getClubTournamentBlocks(club.clubId));

    const { data: memberRows } = await supabase
      .from('club_members')
      .select('id, player_id, level, profiles!club_members_player_id_fkey(full_name)')
      .eq('club_id', club.clubId)
      .eq('status', 'active')
      .eq('skip_private_lesson', false);
    setClubRoster((memberRows ?? [])
      .map((m: any) => ({ id: m.id, player_id: m.player_id, full_name: m.profiles?.full_name ?? 'Player', level: m.level ?? null }))
      .sort((a: ClubRosterEntry, b: ClubRosterEntry) => a.full_name.localeCompare(b.full_name)));

    setLoading(false);
  };

  useFocusEffect(useCallback(() => { load(); }, []));

  // Deep-link from Dashboard's "Tournament Makeups" card.
  useEffect(() => {
    if (params.view === 'makeups') setScreenTab('makeups');
  }, [params.view]);

  const detail = lessons.find((l) => l.id === detailId) ?? null;

  // ── Create wizard ──

  const openWizard = () => {
    setStep(1);
    setWName('');
    setWMainCoachId(coaches[0]?.id ?? null);
    setWAssistantIds([]);
    setWDays([]);
    setWTimes({});
    setWPlayerQuery('');
    setWPlayerResults([]);
    setWPlayers([]);
    setShowWizard(true);
  };

  const toggleAssistant = (coachId: string) => {
    setWAssistantIds((prev) => (prev.includes(coachId) ? prev.filter((id) => id !== coachId) : [...prev, coachId]));
  };

  const toggleWizardDay = (day: number) => {
    setWDays((prev) => (prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort((a, b) => a - b)));
    setWTimes((prev) => (prev[day] ? prev : { ...prev, [day]: { start: '16:00', end: '17:00', courtIds: [] } }));
  };

  const updateWizardTime = (day: number, patch: Partial<{ start: string; end: string; courtIds: string[] }>) => {
    setWTimes((prev) => ({ ...prev, [day]: { ...(prev[day] ?? { start: '16:00', end: '17:00', courtIds: [] }), ...patch } }));
  };

  const toggleWizardCourt = (day: number, courtId: string) => {
    setWTimes((prev) => {
      const current = prev[day] ?? { start: '16:00', end: '17:00', courtIds: [] };
      const courtIds = current.courtIds.includes(courtId) ? current.courtIds.filter((id) => id !== courtId) : [...current.courtIds, courtId];
      return { ...prev, [day]: { ...current, courtIds } };
    });
  };

  const toggleWizardPlayer = (p: PlayerSearchResult) => {
    setWPlayers((prev) => (prev.some((x) => x.id === p.id) ? prev.filter((x) => x.id !== p.id) : [...prev, p]));
  };

  const searchWizardPlayers = async (q: string) => {
    setWPlayerQuery(q);
    if (!clubId) return;
    setWPlayerResults(await searchClubRosterPlayers(q, clubId));
  };

  const wizardNext = () => {
    if (step === 1) {
      if (!wName.trim()) { showAlert('Missing name', 'Give this lesson a name.'); return; }
      if (!wMainCoachId) { showAlert('Missing coach', 'Pick a main coach.'); return; }
      setStep(2);
      return;
    }
    if (step === 2) {
      if (wDays.length === 0) { showAlert('Pick days', 'Select at least one day this class meets.'); return; }
      setStep(3);
      return;
    }
    if (step === 3) {
      const invalid = wDays.some((day) => {
        const t = wTimes[day];
        return !t || !t.start || !t.end || t.start >= t.end;
      });
      if (invalid) { showAlert('Invalid time', 'Pick a start and end time for each day, with end after start.'); return; }
      setStep(4);
      return;
    }
    if (step === 4) {
      setStep(5);
      return;
    }
  };

  const wizardBack = () => setStep((s) => Math.max(1, s - 1));

  const saveWizard = async () => {
    if (!clubId || !wMainCoachId) return;
    setWSaving(true);
    const slots: SlotDraft[] = wDays.map((day) => ({
      day,
      start: wTimes[day]?.start ?? '16:00',
      end: wTimes[day]?.end ?? '17:00',
      isRecurring: true,
      oneTimeDate: null,
      courtIds: wTimes[day]?.courtIds ?? [],
    }));
    const result = await createGroupLesson({ clubId, name: wName.trim(), mainCoachId: wMainCoachId, assistantCoachIds: wAssistantIds, slots });
    if (!result.ok) {
      setWSaving(false);
      showAlert('Error', result.message);
      return;
    }
    for (const p of wPlayers) {
      await addPlayerToLesson(result.id, p.id);
    }
    setWSaving(false);
    setShowWizard(false);
    load();
  };

  // ── Private tab: player card → group-lesson membership + schedule action ──

  const openPrivatePlayer = async (entry: ClubRosterEntry) => {
    if (!clubId) return;
    setPrivatePlayer(entry);
    setSchedulingOpen(false);
    setSchedSlots([]);
    setSchedDraft(emptyPrivateSlot(coaches[0]?.id ?? null));
    setSchedDraftTouched(false);
    setPrivateWizardStep(1);
    setPrivateWizardDays([]);
    setPrivateWizardEntries({});
    setPrivateFolderLoading(true);
    setPrivateFolder(await getPlayerFolder(clubId, entry.player_id));
    setPrivateFolderLoading(false);
  };

  const closePrivatePlayer = () => setPrivatePlayer(null);

  const handleSkipPrivateLesson = (entry: ClubRosterEntry) => {
    showConfirm('Hide from Private tab?', `${firstName(entry.full_name)} won't show up here again. They stay on the roster and any group lessons — this only hides the private-lesson card.`, async () => {
      await skipPrivateLessonCard(entry.id);
      setClubRoster((prev) => prev.filter((r) => r.id !== entry.id));
    }, 'Hide');
  };

  // First time scheduling a private lesson for this player → walk it step by
  // step. Once they have at least one, the fast all-at-once form takes over.
  const isFirstPrivateLesson = !privateFolder || privateFolder.privateLessons.length === 0;

  const openScheduling = () => {
    setSchedSlots([]);
    setSchedDraft(emptyPrivateSlot(coaches[0]?.id ?? null));
    setSchedDraftTouched(false);
    setPrivateWizardStep(1);
    setPrivateWizardDays([]);
    setPrivateWizardEntries({});
    setSchedulingOpen(true);
  };

  const updateSchedDraft = (updater: (s: PrivateSlotDraft) => PrivateSlotDraft) => {
    setSchedDraft(updater);
    setSchedDraftTouched(true);
  };

  // ── First-time private wizard: days → per-day coach+time entries ──

  const togglePrivateWizardDay = (day: number) => {
    setPrivateWizardDays((prev) => (prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort((a, b) => a - b)));
    setPrivateWizardEntries((prev) => (prev[day] ? prev : { ...prev, [day]: [{ coachId: coaches[0]?.id ?? null, start: '16:00', end: '17:00' }] }));
  };

  const addPrivateWizardEntry = (day: number) => {
    setPrivateWizardEntries((prev) => ({ ...prev, [day]: [...(prev[day] ?? []), { coachId: coaches[0]?.id ?? null, start: '16:00', end: '17:00' }] }));
  };

  const removePrivateWizardEntry = (day: number, index: number) => {
    setPrivateWizardEntries((prev) => ({ ...prev, [day]: (prev[day] ?? []).filter((_, i) => i !== index) }));
  };

  const updatePrivateWizardEntry = (day: number, index: number, patch: Partial<PrivateWizardEntry>) => {
    setPrivateWizardEntries((prev) => ({ ...prev, [day]: (prev[day] ?? []).map((e, i) => (i === index ? { ...e, ...patch } : e)) }));
  };

  const privateWizardNext = () => {
    if (privateWizardStep === 1) {
      if (privateWizardDays.length === 0) { showAlert('Pick days', 'Select at least one day for a private lesson.'); return; }
      setPrivateWizardStep(2);
      return;
    }
    if (privateWizardStep === 2) {
      const invalid = privateWizardDays.some((day) => (privateWizardEntries[day] ?? []).some((e) => !e.coachId || !e.start || !e.end || e.start >= e.end));
      if (invalid) { showAlert('Missing info', 'Pick a coach and a valid start/end time for every lesson.'); return; }
      const hasAny = privateWizardDays.some((day) => (privateWizardEntries[day] ?? []).length > 0);
      if (!hasAny) { showAlert('No lessons', 'Add at least one time for a selected day.'); return; }
      setPrivateWizardStep(3);
      return;
    }
  };

  const privateWizardBack = () => setPrivateWizardStep((s) => Math.max(1, s - 1));

  const savePrivateWizard = async () => {
    if (!clubId || !privatePlayer) return;
    const entries: { day: number; coachId: string; start: string; end: string }[] = [];
    for (const day of privateWizardDays) {
      for (const e of privateWizardEntries[day] ?? []) {
        if (e.coachId) entries.push({ day, coachId: e.coachId, start: e.start, end: e.end });
      }
    }
    if (entries.length === 0) { showAlert('No lessons', 'Add at least one time for a selected day.'); return; }

    setSchedSaving(true);
    const { error } = await supabase.from('schedule_assignments').insert(entries.map((e) => ({
      club_id: clubId,
      player_id: privatePlayer.player_id,
      coach_id: e.coachId,
      day_of_week: e.day,
      start_time: e.start,
      end_time: e.end,
      valid_from: todayStr(),
      valid_until: null,
      is_recurring: true,
      court_id: null,
    })));
    setSchedSaving(false);
    if (error) { showAlert('Error', 'Could not schedule the lesson(s).'); return; }
    setSchedulingOpen(false);
    setPrivateWizardStep(1);
    setPrivateWizardDays([]);
    setPrivateWizardEntries({});
    setPrivateFolder(await getPlayerFolder(clubId, privatePlayer.player_id));
    showAlert('Scheduled', `${entries.length > 1 ? `${entries.length} private lessons` : 'Private lesson'} scheduled for ${firstName(privatePlayer.full_name)}.`);
  };

  const validateSlot = (slot: PrivateSlotDraft) => {
    if (!slot.coachId) return 'Pick a coach for every time slot.';
    if (!slot.start || !slot.end || slot.start >= slot.end) return 'Pick a start and end time, with end after start, for every slot.';
    if (!slot.isRecurring && !slot.oneTimeDate) return 'One-time slots need a date picked.';
    return null;
  };

  const addSchedSlot = () => {
    const error = validateSlot(schedDraft);
    if (error) { showAlert('Missing info', error); return; }
    setSchedSlots((prev) => [...prev, schedDraft]);
    setSchedDraft(emptyPrivateSlot(schedDraft.coachId));
    setSchedDraftTouched(false);
  };

  const removeSchedSlot = (index: number) => setSchedSlots((prev) => prev.filter((_, i) => i !== index));

  const saveSchedule = async () => {
    if (!clubId || !privatePlayer) return;
    // A lone in-progress draft is saved as-is (no need to explicitly "add"
    // just one slot). Once at least one slot has been explicitly added,
    // the current draft only gets included too if it's actually been
    // edited since — otherwise an untouched leftover default draft would
    // silently become a phantom extra lesson.
    const slots = schedSlots.length === 0 || schedDraftTouched ? [...schedSlots, schedDraft] : schedSlots;
    for (const slot of slots) {
      const error = validateSlot(slot);
      if (error) { showAlert('Missing info', error); return; }
    }

    const resolved = slots.map((slot) => ({
      slot,
      day: slot.isRecurring || !slot.oneTimeDate ? slot.day : new Date(`${slot.oneTimeDate}T00:00:00`).getDay(),
      date: slot.isRecurring ? todayStr() : (slot.oneTimeDate ?? todayStr()),
    }));

    const commit = async () => {
      setSchedSaving(true);
      const { error } = await supabase.from('schedule_assignments').insert(resolved.map(({ slot, day, date }) => ({
        club_id: clubId,
        player_id: privatePlayer.player_id,
        coach_id: slot.coachId,
        day_of_week: day,
        start_time: slot.start,
        end_time: slot.end,
        valid_from: date,
        valid_until: slot.isRecurring ? null : date,
        is_recurring: slot.isRecurring,
        court_id: slot.courtId,
      })));
      setSchedSaving(false);
      if (error) { showAlert('Error', 'Could not schedule the lesson(s).'); return; }
      setSchedulingOpen(false);
      setSchedSlots([]);
      setSchedDraft(emptyPrivateSlot(coaches[0]?.id ?? null));
      setSchedDraftTouched(false);
      setPrivateFolder(await getPlayerFolder(clubId, privatePlayer.player_id));
      showAlert('Scheduled', `${resolved.length > 1 ? `${resolved.length} private lessons` : 'Private lesson'} scheduled for ${firstName(privatePlayer.full_name)}.`);
    };

    const allConflicts: string[] = [];
    for (const { slot, day } of resolved) {
      if (!slot.courtId) continue;
      const conflicts = await findCourtConflicts({ courtId: slot.courtId, days: [day], startTime: slot.start, endTime: slot.end });
      if (conflicts.length > 0) allConflicts.push(formatCourtConflicts(conflicts));
    }
    if (allConflicts.length > 0) {
      showConfirm('Court already booked', `This overlaps with:\n${allConflicts.join('\n')}\n\nSchedule anyway?`, commit, 'Schedule Anyway');
      return;
    }
    commit();
  };

  // ── Folder detail ──

  const openDetail = async (lesson: GroupLesson) => {
    setDetailId(lesson.id);
    setNameDraft(lesson.name);
    setRoster(await getRoster(lesson.id));
    setPlayerQuery('');
    setPlayerResults([]);
    setAddingSlot(false);
    if (lesson.slots.length === 0) {
      setDetailWizardStep(1);
      setDetailWizardMainCoachId(lesson.coaches.find((c) => c.role === 'main')?.coach_id ?? coaches[0]?.id ?? null);
      setDetailWizardAssistantIds(lesson.coaches.filter((c) => c.role === 'assistant').map((c) => c.coach_id));
      setDetailWizardDays([]);
      setDetailWizardTimes({});
    } else {
      setDetailWizardStep(null);
    }
  };

  const closeDetail = () => { setDetailId(null); setDetailWizardStep(null); };

  // ── First-time lesson setup wizard: coach → days → per-day time → roster ──

  const toggleDetailWizardAssistant = (coachId: string) => {
    setDetailWizardAssistantIds((prev) => (prev.includes(coachId) ? prev.filter((id) => id !== coachId) : [...prev, coachId]));
  };

  const toggleDetailWizardDay = (day: number) => {
    setDetailWizardDays((prev) => (prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort((a, b) => a - b)));
    setDetailWizardTimes((prev) => (prev[day] ? prev : { ...prev, [day]: { start: '16:00', end: '17:00', courtIds: [] } }));
  };

  const updateDetailWizardTime = (day: number, patch: Partial<{ start: string; end: string; courtIds: string[] }>) => {
    setDetailWizardTimes((prev) => ({ ...prev, [day]: { ...(prev[day] ?? { start: '16:00', end: '17:00', courtIds: [] }), ...patch } }));
  };

  const toggleDetailWizardCourt = (day: number, courtId: string) => {
    setDetailWizardTimes((prev) => {
      const current = prev[day] ?? { start: '16:00', end: '17:00', courtIds: [] };
      const courtIds = current.courtIds.includes(courtId) ? current.courtIds.filter((id) => id !== courtId) : [...current.courtIds, courtId];
      return { ...prev, [day]: { ...current, courtIds } };
    });
  };

  const detailWizardNext = () => {
    if (detailWizardStep === 1) {
      if (!detailWizardMainCoachId) { showAlert('Missing coach', 'Pick a main coach.'); return; }
      setDetailWizardStep(2);
      return;
    }
    if (detailWizardStep === 2) {
      if (detailWizardDays.length === 0) { showAlert('Pick days', 'Select at least one day this class meets.'); return; }
      setDetailWizardStep(3);
      return;
    }
    if (detailWizardStep === 3) {
      const invalid = detailWizardDays.some((day) => {
        const t = detailWizardTimes[day];
        return !t || !t.start || !t.end || t.start >= t.end;
      });
      if (invalid) { showAlert('Invalid time', 'Pick a start and end time for each day, with end after start.'); return; }
      setDetailWizardStep(4);
      return;
    }
    if (detailWizardStep === 4) {
      setDetailWizardStep(5);
      return;
    }
  };

  const detailWizardBack = () => setDetailWizardStep((s) => (s === null ? null : Math.max(1, s - 1)));

  const finishDetailWizard = async () => {
    if (!detail || !detailWizardMainCoachId) return;
    setDetailWizardSaving(true);
    if (detail.coaches.length === 0) {
      await assignLessonCoaches(detail.id, detailWizardMainCoachId, detailWizardAssistantIds);
    }
    for (const day of detailWizardDays) {
      const t = detailWizardTimes[day] ?? { start: '16:00', end: '17:00', courtIds: [] as string[] };
      await addTimeSlot(detail.id, { day, start: t.start, end: t.end, isRecurring: true, oneTimeDate: null, courtIds: t.courtIds });
    }
    setDetailWizardSaving(false);
    setDetailWizardStep(null);
    load();
    closeDetail();
  };

  const saveNameDraft = async () => {
    if (!detail || !nameDraft.trim()) return;
    setSavingName(true);
    await renameGroupLesson(detail.id, nameDraft.trim());
    setSavingName(false);
    load();
  };

  const handleDeleteLesson = () => {
    if (!detail) return;
    showConfirm('Delete this lesson?', `This removes "${detail.name}" — its time slots, roster, and coach assignments.`, async () => {
      await deleteGroupLesson(detail.id);
      closeDetail();
      load();
    });
  };

  // ── Tournament Makeups ──

  const openScheduleMakeup = (credit: MakeupCredit) => {
    setScheduleCredit(credit);
    setScheduleDate(null); setScheduleStart(null); setScheduleEnd(null); setScheduleCourtId(null);
  };

  const submitScheduleMakeup = async () => {
    if (!scheduleCredit || !scheduleDate || !scheduleStart || !scheduleEnd) { showAlert('Missing details', 'Pick a date and time.'); return; }
    setSavingSchedule(true);
    const res = await scheduleMakeup({
      id: scheduleCredit.id, kind: scheduleCredit.kind, playerId: scheduleCredit.playerId, label: scheduleCredit.label,
      date: scheduleDate, startTime: scheduleStart, endTime: scheduleEnd, courtId: scheduleCourtId,
    });
    setSavingSchedule(false);
    if (!res.ok) { showAlert('Error', 'Could not schedule the makeup.'); return; }
    setScheduleCredit(null);
    load();
  };

  const completeMakeup = (credit: MakeupCredit) => {
    showConfirm('Mark done?', `Mark ${firstName(credit.playerName)}'s makeup for ${credit.label} as done?`, async () => {
      await markMakeupDone(credit.id, credit.kind);
      load();
    });
  };

  const approveMakeup = async (credit: MakeupCredit) => {
    const res = await approveMakeupRequest(credit);
    if (!res.ok) { showAlert('Error', 'Could not approve this makeup slot.'); return; }
    load();
  };

  const declineMakeup = (credit: MakeupCredit) => {
    showConfirm('Decline this time?', `${firstName(credit.playerName)} will be asked to pick another slot for ${credit.label}.`, async () => {
      const res = await declineMakeupRequest(credit);
      if (!res.ok) { showAlert('Error', 'Could not decline this makeup slot.'); return; }
      load();
    });
  };

  const openSuggestSlots = async (credit: MakeupCredit) => {
    setSuggestCredit(credit);
    setSuggestions([]);
    setLoadingSuggestions(true);
    setSuggestions(await getMakeupSuggestions(credit.id));
    setLoadingSuggestions(false);
  };

  const sendSlotToPlayer = async (suggestion: MakeupSuggestion) => {
    if (!suggestCredit) return;
    const key = `${suggestion.date}_${suggestion.startTime}`;
    setSendingSlot(key);
    const res = await proposeMakeupSlot({
      creditId: suggestCredit.id, playerId: suggestCredit.playerId, label: suggestCredit.label,
      date: suggestion.date, startTime: suggestion.startTime, endTime: suggestion.endTime, courtId: suggestion.courtId,
    });
    setSendingSlot(null);
    if (!res.ok) { showAlert('Error', res.message || 'Could not send that slot.'); return; }
    setSuggestCredit(null);
    load();
  };

  const withdrawSuggestedSlot = (credit: MakeupCredit) => {
    showConfirm('Withdraw this time?', `${firstName(credit.playerName)} will see this makeup as needing a slot again.`, async () => {
      const res = await withdrawMakeupProposal(credit);
      if (!res.ok) { showAlert('Error', 'Could not withdraw this makeup slot.'); return; }
      load();
    });
  };

  const saveNewSlot = async () => {
    if (!detail) return;
    if (!newSlot.start || !newSlot.end || newSlot.start >= newSlot.end) { showAlert('Invalid time', 'Pick a start and end time, with end after start.'); return; }
    if (!newSlot.isRecurring && !newSlot.oneTimeDate) { showAlert('Pick a date', 'This slot is one-time — pick the date.'); return; }

    const day = newSlot.isRecurring || !newSlot.oneTimeDate ? newSlot.day : new Date(`${newSlot.oneTimeDate}T00:00:00`).getDay();
    const finalSlot = { ...newSlot, day };

    const allConflicts: string[] = [];
    for (const courtId of finalSlot.courtIds) {
      const conflicts = await findCourtConflicts({ courtId, days: [day], startTime: finalSlot.start, endTime: finalSlot.end });
      if (conflicts.length) allConflicts.push(formatCourtConflicts(conflicts));
    }

    const commit = async () => {
      await addTimeSlot(detail.id, finalSlot);
      setAddingSlot(false);
      setNewSlot(emptySlot());
      load();
    };
    if (allConflicts.length > 0) {
      showConfirm('Court already booked', `This overlaps with:\n${allConflicts.join('\n')}\n\nAdd this slot anyway?`, commit, 'Add Anyway');
      return;
    }
    commit();
  };

  const handleDeleteSlot = (slotId: string) => {
    showConfirm('Remove this time slot?', 'This removes just this one day/time from the lesson.', async () => {
      await deleteTimeSlot(slotId);
      load();
    });
  };

  const openSlotOverride = async (slot: GroupLesson['slots'][number]) => {
    setOverrideSlot(slot);
    setOverrideDate(null);
    setOverrideCourtIds(slot.court_ids);
    setSlotOverrides(await getCourtOverrides(slot.id));
  };

  const closeSlotOverride = () => setOverrideSlot(null);

  const toggleOverrideCourt = (courtId: string) => {
    setOverrideCourtIds((prev) => (prev.includes(courtId) ? prev.filter((id) => id !== courtId) : [...prev, courtId]));
  };

  const saveSlotOverride = async () => {
    if (!overrideSlot || !overrideDate) { showAlert('Pick a date', 'Choose which date this override applies to.'); return; }
    setSavingOverride(true);
    const result = await setCourtOverride(overrideSlot.id, overrideDate, overrideCourtIds);
    setSavingOverride(false);
    if (!result.ok) { showAlert('Error', result.message ?? 'Could not save the override.'); return; }
    setOverrideDate(null);
    setOverrideCourtIds(overrideSlot.court_ids);
    setSlotOverrides(await getCourtOverrides(overrideSlot.id));
  };

  const removeSlotOverride = (override: CourtOverride) => {
    showConfirm('Remove this override?', `${override.date} goes back to the slot's usual courts.`, async () => {
      await clearCourtOverride(override.id);
      if (overrideSlot) setSlotOverrides(await getCourtOverrides(overrideSlot.id));
    });
  };

  const searchDetailPlayers = async (q: string) => {
    setPlayerQuery(q);
    if (!clubId) return;
    setPlayerResults(await searchClubRosterPlayers(q, clubId));
  };

  const handleAddPlayer = async (p: PlayerSearchResult) => {
    if (!detail || !clubId) return;
    setAddingPlayerId(p.id);
    await addPlayerToRoster(clubId, p.id);
    const result = await addPlayerToLesson(detail.id, p.id);
    setAddingPlayerId(null);
    if (!result.ok) { showAlert('Error', result.message ?? 'Could not add player.'); return; }
    setPlayerQuery('');
    setPlayerResults([]);
    setRoster(await getRoster(detail.id));
    load();
  };

  const handleRemovePlayer = (assignment: RosterPlayer) => {
    showConfirm('Remove player?', `Remove ${firstName(assignment.player_name)} from this lesson?`, async () => {
      await removePlayerFromLesson(assignment.id);
      if (detail) setRoster(await getRoster(detail.id));
      load();
    });
  };

  const handleSetMainCoach = async (coachId: string) => {
    if (!detail) return;
    await setMainCoach(detail.id, coachId);
    load();
  };

  const handleAddAssistant = async (coachId: string) => {
    if (!detail) return;
    await addAssistantCoach(detail.id, coachId);
    load();
  };

  const handleRemoveCoach = (lessonCoachId: string) => {
    showConfirm('Remove coach?', 'Remove this coach from the lesson?', async () => {
      await removeLessonCoach(lessonCoachId);
      load();
    });
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

  const filteredLessons = lessons.filter((l) => l.name.toLowerCase().includes(groupQuery.trim().toLowerCase()));
  const filteredRoster = clubRoster.filter((r) => r.full_name.toLowerCase().includes(rosterQuery.trim().toLowerCase()));
  const filteredMakeups = makeupCredits.filter((m) => {
    if (makeupFilter === 'confirmed') return m.status === 'scheduled';
    if (makeupFilter === 'needs-approval') return m.status === 'pending_approval';
    if (makeupFilter === 'needs-slot') return m.status === 'owed';
    return true;
  });

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Lessons</Text>
        {screenTab === 'group' && (
          <TouchableOpacity style={styles.addBtn} onPress={openWizard}>
            <Icon name="plus-circle-outline" size={30} color={Theme.limeAccentDark} />
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.tabRow}>
        <TouchableOpacity style={[styles.screenTabPill, screenTab === 'group' && styles.screenTabPillActive]} onPress={() => setScreenTab('group')}>
          <Text style={[styles.screenTabPillText, screenTab === 'group' && styles.screenTabPillTextActive]} maxFontSizeMultiplier={1.3}>Group</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.screenTabPill, screenTab === 'private' && styles.screenTabPillActive]} onPress={() => setScreenTab('private')}>
          <Text style={[styles.screenTabPillText, screenTab === 'private' && styles.screenTabPillTextActive]} maxFontSizeMultiplier={1.3}>Private</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.screenTabPill, screenTab === 'makeups' && styles.screenTabPillActive]} onPress={() => setScreenTab('makeups')}>
          <Text style={[styles.screenTabPillText, screenTab === 'makeups' && styles.screenTabPillTextActive]} maxFontSizeMultiplier={1.3}>Makeups</Text>
        </TouchableOpacity>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        {loading ? (
          <Text style={styles.muted} maxFontSizeMultiplier={1.3}>Loading...</Text>
        ) : screenTab === 'group' ? (
          <>
            {lessons.length > 0 && (
              <SearchInput value={groupQuery} onChangeText={setGroupQuery} placeholder="Search lessons" />
            )}
            {lessons.length === 0 ? (
              <View style={styles.emptyState}>
                <Icon name="account-group" size={48} color={Theme.textSecondary} />
                <Text style={styles.emptyDesc} maxFontSizeMultiplier={1.3}>No group lessons yet. Tap + to create your first one.</Text>
              </View>
            ) : filteredLessons.length === 0 ? (
              <Text style={styles.emptyText} maxFontSizeMultiplier={1.3}>No lessons match "{groupQuery}".</Text>
            ) : (
              filteredLessons.map((lesson) => {
                return (
                  <TouchableOpacity key={lesson.id} style={styles.lessonCard} onPress={() => openDetail(lesson)}>
                    <View style={[styles.colorDot, { backgroundColor: colorForId(lesson.id).fg }]} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.lessonName}>{lesson.name}</Text>
                      {lesson.slots.length === 0 ? (
                        <Text style={styles.lessonMeta} maxFontSizeMultiplier={1.3}>No time slots yet</Text>
                      ) : (
                        lesson.slots.map((s) => (
                          <View key={s.id} style={styles.slotSummaryRow}>
                            <Text style={[styles.lessonMeta, styles.slotDayLabel]} maxFontSizeMultiplier={1.3}>
                              {!s.is_recurring && s.one_time_date ? s.one_time_date : DAY_NAMES[s.day_of_week].slice(0, 3)}
                            </Text>
                            <Text style={styles.lessonMeta} maxFontSizeMultiplier={1.3}>
                              {formatTime12h(s.start_time)}–{formatTime12h(s.end_time)}{!s.is_recurring && s.one_time_date ? ' (one-time)' : ''}
                            </Text>
                          </View>
                        ))
                      )}
                      {lesson.coaches.length > 0 && <Text style={styles.lessonMeta} maxFontSizeMultiplier={1.3}>Coach: {lesson.coaches.map((c) => c.full_name).join(', ')}</Text>}
                      <View style={styles.rosterChip}>
                        <Text style={styles.rosterChipText}>{lesson.roster_count} player{lesson.roster_count === 1 ? '' : 's'}</Text>
                      </View>
                    </View>
                    <Icon name="chevron-right" size={22} color={Theme.textMuted} />
                  </TouchableOpacity>
                );
              })
            )}
          </>
        ) : screenTab === 'private' ? (
          <>
            {clubRoster.length > 0 && (
              <SearchInput value={rosterQuery} onChangeText={setRosterQuery} placeholder="Search players" />
            )}
            {clubRoster.length === 0 ? (
              <View style={styles.emptyState}>
                <Icon name="account-group" size={48} color={Theme.textSecondary} />
                <Text style={styles.emptyDesc} maxFontSizeMultiplier={1.3}>No players on the roster yet.</Text>
              </View>
            ) : filteredRoster.length === 0 ? (
              <Text style={styles.emptyText} maxFontSizeMultiplier={1.3}>No players match "{rosterQuery}".</Text>
            ) : (
              filteredRoster.map((r) => (
                <TouchableOpacity key={r.id} style={styles.lessonCard} onPress={() => openPrivatePlayer(r)}>
                  <View style={[styles.colorDot, { backgroundColor: colorForId(r.player_id).fg }]} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.lessonName}>{firstName(r.full_name)}</Text>
                    {r.level && <Text style={styles.lessonMeta} maxFontSizeMultiplier={1.3}>{r.level}</Text>}
                  </View>
                  <TouchableOpacity onPress={() => handleSkipPrivateLesson(r)} hitSlop={8}>
                    <Icon name="close-circle-outline" size={20} color={Theme.textMuted} />
                  </TouchableOpacity>
                  <Icon name="chevron-right" size={22} color={Theme.textMuted} />
                </TouchableOpacity>
              ))
            )}
          </>
        ) : (
          <>
            {tournamentBlocks.length > 0 && (
              <View style={styles.awayCard}>
                <Text style={styles.awayCardTitle} maxFontSizeMultiplier={1.3}>AWAY FOR TOURNAMENT</Text>
                {tournamentBlocks.map((tb) => (
                  <View key={tb.id} style={styles.awayRow}>
                    <Icon name="trophy-outline" size={16} color={Theme.textPrimary} />
                    <Text style={styles.awayRowText} maxFontSizeMultiplier={1.3}>
                      {firstName(tb.playerName)} — {tb.startDate} to {tb.endDate}
                    </Text>
                  </View>
                ))}
              </View>
            )}

            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.subTabRow}>
              {([
                ['confirmed', 'Confirmed'],
                ['needs-approval', 'Needs approval'],
                ['needs-slot', 'Needs slot'],
              ] as [typeof makeupFilter, string][]).map(([key, label]) => (
                <TouchableOpacity key={key} style={[styles.subTabPill, makeupFilter === key && styles.subTabPillActive]} onPress={() => setMakeupFilter(key)}>
                  <Text style={[styles.subTabPillText, makeupFilter === key && styles.subTabPillTextActive]} maxFontSizeMultiplier={1.3}>{label}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {filteredMakeups.length === 0 ? (
              <View style={styles.emptyState}>
                <Icon name="trophy-outline" size={48} color={Theme.textSecondary} />
                <Text style={styles.emptyDesc} maxFontSizeMultiplier={1.3}>
                  {makeupCredits.length === 0 ? 'No tournament makeups yet.' : `No ${makeupFilter === 'all' ? '' : makeupFilter.replace('-', ' ') + ' '}makeups.`}
                </Text>
              </View>
            ) : (
              filteredMakeups.map((credit) => (
                <View key={`${credit.kind}_${credit.id}`} style={styles.makeupCard}>
                  <View style={styles.makeupCardTop}>
                    <Text style={styles.makeupPlayerName} maxFontSizeMultiplier={1.3}>{firstName(credit.playerName)}</Text>
                    <View style={[
                      styles.makeupStatusPill,
                      credit.status === 'scheduled' ? styles.makeupStatusConfirmed
                        : credit.status === 'pending_approval' || credit.status === 'proposed' ? styles.makeupStatusPending
                        : styles.makeupStatusNeeds,
                    ]}>
                      <Text style={[
                        styles.makeupStatusText,
                        credit.status === 'scheduled' ? styles.makeupStatusTextConfirmed
                          : credit.status === 'pending_approval' || credit.status === 'proposed' ? styles.makeupStatusTextPending
                          : styles.makeupStatusTextNeeds,
                      ]} maxFontSizeMultiplier={1.3}>
                        {credit.status === 'scheduled' ? 'Confirmed'
                          : credit.status === 'pending_approval' ? 'Needs approval'
                          : credit.status === 'proposed' ? 'Waiting on player'
                          : 'Needs slot'}
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.makeupLabel} maxFontSizeMultiplier={1.3}>{credit.label}</Text>
                  <View style={styles.makeupTimeRow}>
                    <Text style={styles.makeupOldTime} maxFontSizeMultiplier={1.3}>Missed {credit.missedDate}</Text>
                    <Icon name="chevron-right" size={16} color={Theme.textMuted} />
                    {credit.status === 'scheduled' || credit.status === 'pending_approval' || credit.status === 'proposed' ? (
                      <Text style={styles.makeupNewTime} maxFontSizeMultiplier={1.3}>
                        {credit.scheduledDate} · {credit.scheduledStartTime ? formatTime12h(credit.scheduledStartTime) : ''}{credit.scheduledCourtName ? ` · ${credit.scheduledCourtName}` : ''}
                      </Text>
                    ) : (
                      <Text style={styles.makeupNotPicked} maxFontSizeMultiplier={1.3}>Not yet picked</Text>
                    )}
                  </View>
                  <View style={styles.makeupCardBottom}>
                    {credit.status === 'scheduled' && (
                      <View style={styles.notifiedTag}>
                        <Icon name="check-circle-outline" size={14} color={Theme.eyebrowGreen} />
                        <Text style={styles.notifiedTagText} maxFontSizeMultiplier={1.3}>Notified</Text>
                      </View>
                    )}
                    <View style={{ flex: 1 }} />
                    {credit.status === 'owed' && (
                      <View style={{ flexDirection: 'row', gap: 8 }}>
                        {credit.kind === 'private' && (
                          <TouchableOpacity style={styles.makeupDeclineBtn} onPress={() => openSuggestSlots(credit)}>
                            <Text style={styles.makeupDeclineBtnText}>Suggest Times</Text>
                          </TouchableOpacity>
                        )}
                        <TouchableOpacity style={styles.makeupActionBtn} onPress={() => openScheduleMakeup(credit)}>
                          <Text style={styles.makeupActionBtnText}>Schedule</Text>
                        </TouchableOpacity>
                      </View>
                    )}
                    {credit.status === 'pending_approval' && (
                      <View style={{ flexDirection: 'row', gap: 8 }}>
                        <TouchableOpacity style={styles.makeupDeclineBtn} onPress={() => declineMakeup(credit)}>
                          <Text style={styles.makeupDeclineBtnText}>Decline</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.makeupActionBtn} onPress={() => approveMakeup(credit)}>
                          <Text style={styles.makeupActionBtnText}>Approve</Text>
                        </TouchableOpacity>
                      </View>
                    )}
                    {credit.status === 'proposed' && (
                      <TouchableOpacity style={styles.makeupDeclineBtn} onPress={() => withdrawSuggestedSlot(credit)}>
                        <Text style={styles.makeupDeclineBtnText}>Withdraw</Text>
                      </TouchableOpacity>
                    )}
                    {credit.status === 'scheduled' && (
                      <TouchableOpacity style={styles.makeupActionBtn} onPress={() => completeMakeup(credit)}>
                        <Text style={styles.makeupActionBtnText}>Mark Done</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              ))
            )}
          </>
        )}
      </ScrollView>

      {/* Create wizard */}
      <Modal visible={showWizard} transparent animationType="slide" onRequestClose={() => setShowWizard(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>New Group Lesson · Step {step} of 5</Text>
              <TouchableOpacity onPress={() => setShowWizard(false)}>
                <Icon name="close-circle-outline" size={26} color={Theme.textPrimary} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              {step === 1 && (
                <>
                  <Text style={styles.formLabel} maxFontSizeMultiplier={1.3}>Name</Text>
                  <TextInput style={styles.formInput} value={wName} onChangeText={setWName} placeholder="e.g. High Performance 1" placeholderTextColor={Theme.textSecondary} />

                  <Text style={styles.formLabel} maxFontSizeMultiplier={1.3}>Main coach</Text>
                  <View style={styles.pillWrapRow}>
                    {coaches.map((c) => (
                      <TouchableOpacity key={c.id} style={[styles.pill, wMainCoachId === c.id && styles.pillActive]} onPress={() => setWMainCoachId(c.id)}>
                        <Text style={[styles.pillText, wMainCoachId === c.id && styles.pillTextActive]} maxFontSizeMultiplier={1.3}>{c.full_name}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  <Text style={styles.formLabel} maxFontSizeMultiplier={1.3}>Assistant coach(es) — optional</Text>
                  <View style={styles.pillWrapRow}>
                    {coaches.filter((c) => c.id !== wMainCoachId).map((c) => (
                      <TouchableOpacity key={c.id} style={[styles.pill, wAssistantIds.includes(c.id) && styles.pillActive]} onPress={() => toggleAssistant(c.id)}>
                        <Text style={[styles.pillText, wAssistantIds.includes(c.id) && styles.pillTextActive]} maxFontSizeMultiplier={1.3}>{c.full_name}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </>
              )}

              {step === 2 && (
                <>
                  <Text style={styles.formLabel} maxFontSizeMultiplier={1.3}>What days does this class meet?</Text>
                  <Text style={styles.hint} maxFontSizeMultiplier={1.3}>Pick every day it runs — you'll set a time for each one next.</Text>
                  <View style={styles.pillWrapRow}>
                    {DAY_NAMES.map((d, i) => (
                      <TouchableOpacity key={d} style={[styles.pill, wDays.includes(i) && styles.pillActive]} onPress={() => toggleWizardDay(i)}>
                        <Text style={[styles.pillText, wDays.includes(i) && styles.pillTextActive]} maxFontSizeMultiplier={1.3}>{d.slice(0, 3)}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </>
              )}

              {step === 3 && (
                <>
                  <Text style={styles.formLabel} maxFontSizeMultiplier={1.3}>Set a time for each day</Text>
                  {wDays.map((day) => (
                    <View key={day} style={styles.slotForm}>
                      <Text style={styles.slotSummaryTitle}>{DAY_NAMES[day]}</Text>
                      <Text style={styles.formLabel} maxFontSizeMultiplier={1.3}>Start</Text>
                      <TimePicker value={wTimes[day]?.start ?? '16:00'} onChange={(t) => updateWizardTime(day, { start: t })} />
                      <Text style={styles.formLabel} maxFontSizeMultiplier={1.3}>End</Text>
                      <TimePicker value={wTimes[day]?.end ?? '17:00'} onChange={(t) => updateWizardTime(day, { end: t })} />
                      {courts.length > 0 && (
                        <>
                          <Text style={styles.formLabel} maxFontSizeMultiplier={1.3}>Court</Text>
                          <View style={styles.pillWrapRow}>
                            {courts.map((c) => (
                              <TouchableOpacity key={c.id} style={[styles.pill, wTimes[day]?.courtIds.includes(c.id) && styles.pillActive]} onPress={() => toggleWizardCourt(day, c.id)}>
                                <Text style={[styles.pillText, wTimes[day]?.courtIds.includes(c.id) && styles.pillTextActive]} maxFontSizeMultiplier={1.3}>{c.name}</Text>
                              </TouchableOpacity>
                            ))}
                          </View>
                        </>
                      )}
                    </View>
                  ))}
                </>
              )}

              {step === 4 && (
                <>
                  <Text style={styles.formLabel} maxFontSizeMultiplier={1.3}>Roster</Text>
                  <Text style={styles.hint} maxFontSizeMultiplier={1.3}>Add players from your club roster now, or skip and add them later.</Text>
                  <SearchInput value={wPlayerQuery} onChangeText={searchWizardPlayers} placeholder="Search by name or email" />
                  {wPlayerResults.map((p) => (
                    <TouchableOpacity key={p.id} style={styles.searchResultRow} onPress={() => toggleWizardPlayer(p)}>
                      <View>
                        <Text style={styles.playerName}>{p.full_name}</Text>
                        {p.email && <Text style={styles.playerEmail} maxFontSizeMultiplier={1.3}>{p.email}</Text>}
                      </View>
                      <Icon name={wPlayers.some((x) => x.id === p.id) ? 'check-circle-outline' : 'account-plus-outline'} size={20} color={Theme.eyebrowGreen} />
                    </TouchableOpacity>
                  ))}
                  {wPlayers.length > 0 && (
                    <>
                      <Text style={[styles.formLabel, { marginTop: 12 }]} maxFontSizeMultiplier={1.3}>Selected ({wPlayers.length})</Text>
                      {wPlayers.map((p) => (
                        <View key={p.id} style={styles.searchResultRow}>
                          <Text style={styles.playerName}>{p.full_name}</Text>
                          <TouchableOpacity onPress={() => toggleWizardPlayer(p)}>
                            <Icon name="close-circle-outline" size={20} color="#FF6B6B" />
                          </TouchableOpacity>
                        </View>
                      ))}
                    </>
                  )}
                </>
              )}

              {step === 5 && (
                <>
                  <Text style={styles.formLabel} maxFontSizeMultiplier={1.3}>Confirm setup</Text>
                  <Text style={styles.hint} maxFontSizeMultiplier={1.3}>Nothing here can be edited on this screen — go back if something needs to change.</Text>
                  <View style={styles.reviewCard}>
                    <Text style={styles.reviewName}>{wName}</Text>
                    <Text style={styles.reviewLine} maxFontSizeMultiplier={1.3}>Coach: {coaches.find((c) => c.id === wMainCoachId)?.full_name}</Text>
                    {wAssistantIds.length > 0 && <Text style={styles.reviewLine} maxFontSizeMultiplier={1.3}>Assistants: {wAssistantIds.map((id) => coaches.find((c) => c.id === id)?.full_name).join(', ')}</Text>}
                    {wDays.map((day) => (
                      <Text key={day} style={styles.reviewLine} maxFontSizeMultiplier={1.3}>
                        • {DAY_NAMES[day]}: {wTimes[day] ? `${formatTime12h(wTimes[day].start)}–${formatTime12h(wTimes[day].end)}` : ''}
                        {wTimes[day]?.courtIds.length ? ` · ${wTimes[day].courtIds.map((id) => courts.find((c) => c.id === id)?.name).filter(Boolean).join(', ')}` : ''}
                      </Text>
                    ))}
                    <Text style={styles.reviewLine} maxFontSizeMultiplier={1.3}>{wPlayers.length} player{wPlayers.length === 1 ? '' : 's'} enrolled</Text>
                  </View>
                </>
              )}

              <View style={styles.wizardNav}>
                {step > 1 && (
                  <TouchableOpacity style={styles.navBackBtn} onPress={wizardBack}>
                    <Text style={styles.navBackText} maxFontSizeMultiplier={1.3}>Back</Text>
                  </TouchableOpacity>
                )}
                {step < 5 ? (
                  <TouchableOpacity style={[styles.saveBtn, { flex: 1 }]} onPress={wizardNext}>
                    <Text style={styles.saveBtnText}>Continue</Text>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity style={[styles.saveBtn, { flex: 1 }, wSaving && styles.saveBtnDisabled]} onPress={saveWizard} disabled={wSaving}>
                    <Text style={styles.saveBtnText}>{wSaving ? 'Saving...' : 'Complete Setup'}</Text>
                  </TouchableOpacity>
                )}
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Folder detail */}
      <Modal visible={!!detail} transparent animationType="slide" onRequestClose={closeDetail}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{detail?.name}{detailWizardStep ? ` · Step ${detailWizardStep} of 5` : ''}</Text>
              <TouchableOpacity onPress={closeDetail}>
                <Icon name="close-circle-outline" size={26} color={Theme.textPrimary} />
              </TouchableOpacity>
            </View>
            {detail && detailWizardStep !== null ? (
              <ScrollView showsVerticalScrollIndicator={false}>
                {detailWizardStep === 1 && (
                  <>
                    <Text style={styles.formLabel} maxFontSizeMultiplier={1.3}>Main coach</Text>
                    <View style={styles.pillWrapRow}>
                      {coaches.map((c) => (
                        <TouchableOpacity key={c.id} style={[styles.pill, detailWizardMainCoachId === c.id && styles.pillActive]} onPress={() => setDetailWizardMainCoachId(c.id)}>
                          <Text style={[styles.pillText, detailWizardMainCoachId === c.id && styles.pillTextActive]} maxFontSizeMultiplier={1.3}>{c.full_name}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>

                    <Text style={styles.formLabel} maxFontSizeMultiplier={1.3}>Assistant coach(es) — optional</Text>
                    <View style={styles.pillWrapRow}>
                      {coaches.filter((c) => c.id !== detailWizardMainCoachId).map((c) => (
                        <TouchableOpacity key={c.id} style={[styles.pill, detailWizardAssistantIds.includes(c.id) && styles.pillActive]} onPress={() => toggleDetailWizardAssistant(c.id)}>
                          <Text style={[styles.pillText, detailWizardAssistantIds.includes(c.id) && styles.pillTextActive]} maxFontSizeMultiplier={1.3}>{c.full_name}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </>
                )}

                {detailWizardStep === 2 && (
                  <>
                    <Text style={styles.formLabel} maxFontSizeMultiplier={1.3}>What days does this class meet?</Text>
                    <Text style={styles.hint} maxFontSizeMultiplier={1.3}>Pick every day it runs — you'll set a time for each one next.</Text>
                    <View style={styles.pillWrapRow}>
                      {DAY_NAMES.map((d, i) => (
                        <TouchableOpacity key={d} style={[styles.pill, detailWizardDays.includes(i) && styles.pillActive]} onPress={() => toggleDetailWizardDay(i)}>
                          <Text style={[styles.pillText, detailWizardDays.includes(i) && styles.pillTextActive]} maxFontSizeMultiplier={1.3}>{d.slice(0, 3)}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </>
                )}

                {detailWizardStep === 3 && (
                  <>
                    <Text style={styles.formLabel} maxFontSizeMultiplier={1.3}>Set a time for each day</Text>
                    {detailWizardDays.map((day) => (
                      <View key={day} style={styles.slotForm}>
                        <Text style={styles.slotSummaryTitle}>{DAY_NAMES[day]}</Text>
                        <Text style={styles.formLabel} maxFontSizeMultiplier={1.3}>Start</Text>
                        <TimePicker value={detailWizardTimes[day]?.start ?? '16:00'} onChange={(t) => updateDetailWizardTime(day, { start: t })} />
                        <Text style={styles.formLabel} maxFontSizeMultiplier={1.3}>End</Text>
                        <TimePicker value={detailWizardTimes[day]?.end ?? '17:00'} onChange={(t) => updateDetailWizardTime(day, { end: t })} />
                        {courts.length > 0 && (
                          <>
                            <Text style={styles.formLabel} maxFontSizeMultiplier={1.3}>Court</Text>
                            <View style={styles.pillWrapRow}>
                              {courts.map((c) => (
                                <TouchableOpacity key={c.id} style={[styles.pill, detailWizardTimes[day]?.courtIds.includes(c.id) && styles.pillActive]} onPress={() => toggleDetailWizardCourt(day, c.id)}>
                                  <Text style={[styles.pillText, detailWizardTimes[day]?.courtIds.includes(c.id) && styles.pillTextActive]} maxFontSizeMultiplier={1.3}>{c.name}</Text>
                                </TouchableOpacity>
                              ))}
                            </View>
                          </>
                        )}
                      </View>
                    ))}
                  </>
                )}

                {detailWizardStep === 4 && (
                  <>
                    <Text style={styles.formLabel} maxFontSizeMultiplier={1.3}>Roster</Text>
                    <Text style={styles.hint} maxFontSizeMultiplier={1.3}>See who's already in this class, and add more from your club roster.</Text>
                    <SearchInput value={playerQuery} onChangeText={searchDetailPlayers} placeholder="Search by name or email to add" />
                    {playerResults.map((p) => (
                      <TouchableOpacity key={p.id} style={styles.searchResultRow} onPress={() => handleAddPlayer(p)} disabled={addingPlayerId === p.id}>
                        <View>
                          <Text style={styles.playerName}>{p.full_name}</Text>
                          {p.email && <Text style={styles.playerEmail} maxFontSizeMultiplier={1.3}>{p.email}</Text>}
                        </View>
                        <Icon name="account-plus-outline" size={20} color={Theme.eyebrowGreen} />
                      </TouchableOpacity>
                    ))}
                    {roster.length === 0 ? (
                      <Text style={styles.muted} maxFontSizeMultiplier={1.3}>No one enrolled yet.</Text>
                    ) : (
                      roster.map((r) => (
                        <View key={r.id} style={styles.searchResultRow}>
                          <Text style={styles.playerName}>{firstName(r.player_name)}</Text>
                          <TouchableOpacity onPress={() => handleRemovePlayer(r)}>
                            <Icon name="account-remove-outline" size={20} color="#FF6B6B" />
                          </TouchableOpacity>
                        </View>
                      ))
                    )}
                  </>
                )}

                {detailWizardStep === 5 && (
                  <>
                    <Text style={styles.formLabel} maxFontSizeMultiplier={1.3}>Confirm setup</Text>
                    <Text style={styles.hint} maxFontSizeMultiplier={1.3}>Nothing here can be edited on this screen — go back if something needs to change.</Text>
                    <View style={styles.reviewCard}>
                      <Text style={styles.reviewName}>{detail?.name}</Text>
                      <Text style={styles.reviewLine} maxFontSizeMultiplier={1.3}>Coach: {coaches.find((c) => c.id === detailWizardMainCoachId)?.full_name}</Text>
                      {detailWizardAssistantIds.length > 0 && <Text style={styles.reviewLine} maxFontSizeMultiplier={1.3}>Assistants: {detailWizardAssistantIds.map((id) => coaches.find((c) => c.id === id)?.full_name).join(', ')}</Text>}
                      {detailWizardDays.map((day) => (
                        <Text key={day} style={styles.reviewLine} maxFontSizeMultiplier={1.3}>
                          • {DAY_NAMES[day]}: {detailWizardTimes[day] ? `${formatTime12h(detailWizardTimes[day].start)}–${formatTime12h(detailWizardTimes[day].end)}` : ''}
                          {detailWizardTimes[day]?.courtIds.length ? ` · ${detailWizardTimes[day].courtIds.map((id) => courts.find((c) => c.id === id)?.name).filter(Boolean).join(', ')}` : ''}
                        </Text>
                      ))}
                      <Text style={styles.reviewLine} maxFontSizeMultiplier={1.3}>{roster.length} player{roster.length === 1 ? '' : 's'} enrolled</Text>
                    </View>
                  </>
                )}

                <View style={styles.wizardNav}>
                  {detailWizardStep > 1 && (
                    <TouchableOpacity style={styles.navBackBtn} onPress={detailWizardBack}>
                      <Text style={styles.navBackText} maxFontSizeMultiplier={1.3}>Back</Text>
                    </TouchableOpacity>
                  )}
                  {detailWizardStep < 5 ? (
                    <TouchableOpacity style={[styles.saveBtn, { flex: 1 }]} onPress={detailWizardNext}>
                      <Text style={styles.saveBtnText}>Continue</Text>
                    </TouchableOpacity>
                  ) : (
                    <TouchableOpacity style={[styles.saveBtn, { flex: 1 }, detailWizardSaving && styles.saveBtnDisabled]} onPress={finishDetailWizard} disabled={detailWizardSaving}>
                      <Text style={styles.saveBtnText}>{detailWizardSaving ? 'Saving...' : 'Complete Setup'}</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </ScrollView>
            ) : detail && (
              <ScrollView showsVerticalScrollIndicator={false}>
                <Text style={styles.formLabel} maxFontSizeMultiplier={1.3}>Name</Text>
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <TextInput style={[styles.formInput, { flex: 1 }]} value={nameDraft} onChangeText={setNameDraft} />
                  <TouchableOpacity onPress={saveNameDraft} disabled={savingName}>
                    <Icon name="check-circle-outline" size={24} color={Theme.eyebrowGreen} />
                  </TouchableOpacity>
                </View>

                <Text style={[styles.formLabel, { marginTop: 16 }]} maxFontSizeMultiplier={1.3}>Coaches</Text>
                {detail.coaches.map((c) => (
                  <View key={c.id} style={styles.searchResultRow}>
                    <Text style={styles.playerName}>{c.full_name} {c.role === 'main' ? '(main)' : ''}</Text>
                    <View style={{ flexDirection: 'row', gap: 14 }}>
                      {c.role !== 'main' && (
                        <TouchableOpacity onPress={() => handleSetMainCoach(c.coach_id)}>
                          <Text style={styles.smallLink}>Make main</Text>
                        </TouchableOpacity>
                      )}
                      <TouchableOpacity onPress={() => handleRemoveCoach(c.id)}>
                        <Icon name="close-circle-outline" size={20} color="#FF6B6B" />
                      </TouchableOpacity>
                    </View>
                  </View>
                ))}
                {coaches.filter((c) => !detail.coaches.some((dc) => dc.coach_id === c.id)).length > 0 && (
                  <View style={styles.pillWrapRow}>
                    {coaches.filter((c) => !detail.coaches.some((dc) => dc.coach_id === c.id)).map((c) => (
                      <TouchableOpacity key={c.id} style={styles.pill} onPress={() => handleAddAssistant(c.id)}>
                        <Text style={styles.pillText} maxFontSizeMultiplier={1.3}>+ {c.full_name}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}

                <Text style={[styles.formLabel, { marginTop: 16 }]} maxFontSizeMultiplier={1.3}>Time slots</Text>
                {detail.slots.map((s) => (
                  <View key={s.id} style={styles.searchResultRow}>
                    <Text style={styles.playerName}>{slotSummary(s)}{s.court_names.length ? ` · ${s.court_names.join(', ')}` : ''}</Text>
                    <View style={{ flexDirection: 'row', gap: 14 }}>
                      <TouchableOpacity onPress={() => openSlotOverride(s)}>
                        <Icon name="calendar-edit" size={20} color={Theme.eyebrowGreen} />
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => handleDeleteSlot(s.id)}>
                        <Icon name="trash-can-outline" size={20} color="#FF6B6B" />
                      </TouchableOpacity>
                    </View>
                  </View>
                ))}

                {addingSlot ? (
                  <View style={styles.slotForm}>
                    <Text style={styles.formLabel} maxFontSizeMultiplier={1.3}>Recurring</Text>
                    <View style={styles.pillRow}>
                      <TouchableOpacity style={[styles.pill, newSlot.isRecurring && styles.pillActive]} onPress={() => setNewSlot((s) => ({ ...s, isRecurring: true, oneTimeDate: null }))}>
                        <Text style={[styles.pillText, newSlot.isRecurring && styles.pillTextActive]} maxFontSizeMultiplier={1.3}>Recurring</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={[styles.pill, !newSlot.isRecurring && styles.pillActive]} onPress={() => setNewSlot((s) => ({ ...s, isRecurring: false }))}>
                        <Text style={[styles.pillText, !newSlot.isRecurring && styles.pillTextActive]} maxFontSizeMultiplier={1.3}>One-time</Text>
                      </TouchableOpacity>
                    </View>
                    {newSlot.isRecurring ? (
                      <>
                        <Text style={styles.formLabel} maxFontSizeMultiplier={1.3}>Day</Text>
                        <View style={styles.pillWrapRow}>
                          {DAY_NAMES.map((d, i) => (
                            <TouchableOpacity key={d} style={[styles.pill, newSlot.day === i && styles.pillActive]} onPress={() => setNewSlot((s) => ({ ...s, day: i }))}>
                              <Text style={[styles.pillText, newSlot.day === i && styles.pillTextActive]} maxFontSizeMultiplier={1.3}>{d.slice(0, 3)}</Text>
                            </TouchableOpacity>
                          ))}
                        </View>
                      </>
                    ) : (
                      <MiniDatePicker value={newSlot.oneTimeDate} onChange={(d) => setNewSlot((s) => ({ ...s, oneTimeDate: d }))} minDate={new Date().toISOString().split('T')[0]} />
                    )}
                    <Text style={styles.formLabel} maxFontSizeMultiplier={1.3}>Start</Text>
                    <TimePicker value={newSlot.start} onChange={(t) => setNewSlot((s) => ({ ...s, start: t }))} />
                    <Text style={styles.formLabel} maxFontSizeMultiplier={1.3}>End</Text>
                    <TimePicker value={newSlot.end} onChange={(t) => setNewSlot((s) => ({ ...s, end: t }))} />
                    {courts.length > 0 && (
                      <>
                        <Text style={styles.formLabel} maxFontSizeMultiplier={1.3}>Courts</Text>
                        <View style={styles.pillWrapRow}>
                          {courts.map((c) => (
                            <TouchableOpacity key={c.id} style={[styles.pill, newSlot.courtIds.includes(c.id) && styles.pillActive]} onPress={() => setNewSlot((s) => ({ ...s, courtIds: s.courtIds.includes(c.id) ? s.courtIds.filter((id) => id !== c.id) : [...s.courtIds, c.id] }))}>
                              <Text style={[styles.pillText, newSlot.courtIds.includes(c.id) && styles.pillTextActive]} maxFontSizeMultiplier={1.3}>{c.name}</Text>
                            </TouchableOpacity>
                          ))}
                        </View>
                      </>
                    )}
                    <TouchableOpacity style={styles.saveBtn} onPress={saveNewSlot}>
                      <Text style={styles.saveBtnText}>Save Time Slot</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <TouchableOpacity style={styles.addRowBtn} onPress={() => setAddingSlot(true)}>
                    <Icon name="plus-circle-outline" size={20} color={Theme.eyebrowGreen} />
                    <Text style={styles.addRowText}>Add time slot</Text>
                  </TouchableOpacity>
                )}

                <Text style={[styles.formLabel, { marginTop: 16 }]} maxFontSizeMultiplier={1.3}>Roster ({roster.length})</Text>
                <SearchInput value={playerQuery} onChangeText={searchDetailPlayers} placeholder="Search by name or email to add" />
                {playerResults.map((p) => (
                  <TouchableOpacity key={p.id} style={styles.searchResultRow} onPress={() => handleAddPlayer(p)} disabled={addingPlayerId === p.id}>
                    <View>
                      <Text style={styles.playerName}>{p.full_name}</Text>
                      {p.email && <Text style={styles.playerEmail} maxFontSizeMultiplier={1.3}>{p.email}</Text>}
                    </View>
                    <Icon name="account-plus-outline" size={20} color={Theme.eyebrowGreen} />
                  </TouchableOpacity>
                ))}
                {roster.length === 0 ? (
                  <Text style={styles.muted} maxFontSizeMultiplier={1.3}>No one enrolled yet.</Text>
                ) : (
                  roster.map((r) => (
                    <View key={r.id} style={styles.searchResultRow}>
                      <Text style={styles.playerName}>{firstName(r.player_name)}</Text>
                      <TouchableOpacity onPress={() => handleRemovePlayer(r)}>
                        <Icon name="account-remove-outline" size={20} color="#FF6B6B" />
                      </TouchableOpacity>
                    </View>
                  ))
                )}

                <TouchableOpacity style={styles.deleteLessonBtn} onPress={handleDeleteLesson}>
                  <Icon name="delete-forever-outline" size={20} color="#E74C3C" />
                  <Text style={styles.deleteLessonText}>Delete this lesson</Text>
                </TouchableOpacity>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* Per-date court override — edit one session instance's courts only */}
      <Modal visible={!!overrideSlot} transparent animationType="slide" onRequestClose={closeSlotOverride}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Override courts for one date</Text>
              <TouchableOpacity onPress={closeSlotOverride}>
                <Icon name="close-circle-outline" size={26} color={Theme.textPrimary} />
              </TouchableOpacity>
            </View>
            {overrideSlot && (
              <ScrollView showsVerticalScrollIndicator={false}>
                <Text style={styles.hint} maxFontSizeMultiplier={1.3}>
                  Usual: {slotSummary(overrideSlot)}{overrideSlot.court_names.length ? ` · ${overrideSlot.court_names.join(', ')}` : ' · no courts'}. Every other week stays on the usual courts — this only changes the one date below.
                </Text>

                {slotOverrides.length > 0 && (
                  <>
                    <Text style={[styles.formLabel, { marginTop: 12 }]} maxFontSizeMultiplier={1.3}>Existing overrides</Text>
                    {slotOverrides.map((o) => (
                      <View key={o.id} style={styles.searchResultRow}>
                        <Text style={styles.playerName}>{o.date}{o.courtNames.length ? ` · ${o.courtNames.join(', ')}` : ' · no courts'}</Text>
                        <TouchableOpacity onPress={() => removeSlotOverride(o)}>
                          <Icon name="close-circle-outline" size={20} color="#FF6B6B" />
                        </TouchableOpacity>
                      </View>
                    ))}
                  </>
                )}

                <Text style={[styles.formLabel, { marginTop: 16 }]} maxFontSizeMultiplier={1.3}>Date</Text>
                <MiniDatePicker value={overrideDate} onChange={setOverrideDate} minDate={new Date().toISOString().split('T')[0]} />

                {courts.length > 0 && (
                  <>
                    <Text style={styles.formLabel} maxFontSizeMultiplier={1.3}>Courts for that date</Text>
                    <View style={styles.pillWrapRow}>
                      {courts.map((c) => (
                        <TouchableOpacity key={c.id} style={[styles.pill, overrideCourtIds.includes(c.id) && styles.pillActive]} onPress={() => toggleOverrideCourt(c.id)}>
                          <Text style={[styles.pillText, overrideCourtIds.includes(c.id) && styles.pillTextActive]} maxFontSizeMultiplier={1.3}>{c.name}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </>
                )}

                <TouchableOpacity style={[styles.saveBtn, savingOverride && styles.saveBtnDisabled]} onPress={saveSlotOverride} disabled={savingOverride}>
                  <Text style={styles.saveBtnText}>{savingOverride ? 'Saving...' : 'Save Override'}</Text>
                </TouchableOpacity>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* Private tab: player detail — group-lesson membership + schedule action */}
      <Modal visible={!!privatePlayer} transparent animationType="slide" onRequestClose={closePrivatePlayer}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{firstName(privatePlayer?.full_name)}</Text>
              <TouchableOpacity onPress={closePrivatePlayer}>
                <Icon name="close-circle-outline" size={26} color={Theme.textPrimary} />
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              {privateFolderLoading ? (
                <Text style={styles.muted} maxFontSizeMultiplier={1.3}>Loading...</Text>
              ) : (
                <>
                  <Text style={styles.formLabel} maxFontSizeMultiplier={1.3}>Group lessons</Text>
                  {privateFolder && privateFolder.groupLessons.length > 0 ? (
                    privateFolder.groupLessons.map((g) => (
                      <View key={g.id} style={styles.searchResultRow}>
                        <Text style={styles.playerName}>{g.name}</Text>
                        {g.mainCoachName && <Text style={styles.playerEmail} maxFontSizeMultiplier={1.3}>{g.mainCoachName}</Text>}
                      </View>
                    ))
                  ) : (
                    <Text style={styles.emptyText} maxFontSizeMultiplier={1.3}>Not enrolled in any group lessons.</Text>
                  )}

                  {schedulingOpen ? (
                    isFirstPrivateLesson ? (
                      <View style={styles.slotForm}>
                        <Text style={[styles.formLabel, { marginTop: 0 }]} maxFontSizeMultiplier={1.3}>Step {privateWizardStep} of 3</Text>

                        {privateWizardStep === 1 && (
                          <>
                            <Text style={styles.formLabel} maxFontSizeMultiplier={1.3}>What days does {firstName(privatePlayer?.full_name)} have a private lesson?</Text>
                            <Text style={styles.hint} maxFontSizeMultiplier={1.3}>Pick every day — you'll set the coach and time for each one next.</Text>
                            <View style={styles.pillWrapRow}>
                              {DAY_NAMES.map((d, i) => (
                                <TouchableOpacity key={d} style={[styles.pill, privateWizardDays.includes(i) && styles.pillActive]} onPress={() => togglePrivateWizardDay(i)}>
                                  <Text style={[styles.pillText, privateWizardDays.includes(i) && styles.pillTextActive]} maxFontSizeMultiplier={1.3}>{d.slice(0, 3)}</Text>
                                </TouchableOpacity>
                              ))}
                            </View>
                          </>
                        )}

                        {privateWizardStep === 2 && privateWizardDays.map((day) => (
                          <View key={day} style={{ marginBottom: 16 }}>
                            <Text style={styles.slotSummaryTitle}>{DAY_NAMES[day]}</Text>
                            {(privateWizardEntries[day] ?? []).map((entry, i) => (
                              <View key={i} style={styles.slotSummaryCard}>
                                <View style={{ flex: 1 }}>
                                  <Text style={styles.formLabel} maxFontSizeMultiplier={1.3}>Coach</Text>
                                  <View style={styles.pillWrapRow}>
                                    {coaches.map((c) => (
                                      <TouchableOpacity key={c.id} style={[styles.pill, entry.coachId === c.id && styles.pillActive]} onPress={() => updatePrivateWizardEntry(day, i, { coachId: c.id })}>
                                        <Text style={[styles.pillText, entry.coachId === c.id && styles.pillTextActive]} maxFontSizeMultiplier={1.3}>{c.full_name}</Text>
                                      </TouchableOpacity>
                                    ))}
                                  </View>
                                  <Text style={styles.formLabel} maxFontSizeMultiplier={1.3}>Start</Text>
                                  <TimePicker value={entry.start} onChange={(t) => updatePrivateWizardEntry(day, i, { start: t })} />
                                  <Text style={styles.formLabel} maxFontSizeMultiplier={1.3}>End</Text>
                                  <TimePicker value={entry.end} onChange={(t) => updatePrivateWizardEntry(day, i, { end: t })} />
                                </View>
                                {(privateWizardEntries[day]?.length ?? 0) > 1 && (
                                  <TouchableOpacity onPress={() => removePrivateWizardEntry(day, i)}>
                                    <Icon name="close-circle-outline" size={20} color="#FF6B6B" />
                                  </TouchableOpacity>
                                )}
                              </View>
                            ))}
                            <TouchableOpacity style={styles.addRowBtn} onPress={() => addPrivateWizardEntry(day)}>
                              <Icon name="plus-circle-outline" size={20} color={Theme.eyebrowGreen} />
                              <Text style={styles.addRowText}>Add another private lesson on {DAY_NAMES[day]}</Text>
                            </TouchableOpacity>
                          </View>
                        ))}

                        {privateWizardStep === 3 && (
                          <>
                            <Text style={styles.formLabel} maxFontSizeMultiplier={1.3}>Confirm setup</Text>
                            <Text style={styles.hint} maxFontSizeMultiplier={1.3}>Nothing here can be edited on this screen — go back if something needs to change.</Text>
                            <View style={styles.reviewCard}>
                              <Text style={styles.reviewName}>{firstName(privatePlayer?.full_name)}</Text>
                              {privateWizardDays.map((day) => (
                                (privateWizardEntries[day] ?? []).map((entry, i) => (
                                  <Text key={`${day}-${i}`} style={styles.reviewLine} maxFontSizeMultiplier={1.3}>
                                    • {DAY_NAMES[day]}: {formatTime12h(entry.start)}–{formatTime12h(entry.end)} · {coaches.find((c) => c.id === entry.coachId)?.full_name ?? 'Coach'}
                                  </Text>
                                ))
                              ))}
                            </View>
                          </>
                        )}

                        <View style={styles.wizardNav}>
                          {privateWizardStep > 1 && (
                            <TouchableOpacity style={styles.navBackBtn} onPress={privateWizardBack}>
                              <Text style={styles.navBackText} maxFontSizeMultiplier={1.3}>Back</Text>
                            </TouchableOpacity>
                          )}
                          {privateWizardStep < 3 ? (
                            <TouchableOpacity style={[styles.saveBtn, { flex: 1 }]} onPress={privateWizardNext}>
                              <Text style={styles.saveBtnText}>Continue</Text>
                            </TouchableOpacity>
                          ) : (
                            <TouchableOpacity style={[styles.saveBtn, { flex: 1 }, schedSaving && styles.saveBtnDisabled]} onPress={savePrivateWizard} disabled={schedSaving}>
                              <Text style={styles.saveBtnText}>{schedSaving ? 'Scheduling...' : 'Complete Setup'}</Text>
                            </TouchableOpacity>
                          )}
                        </View>
                      </View>
                    ) : (
                      <View style={styles.slotForm}>
                        <Text style={styles.formLabel} maxFontSizeMultiplier={1.3}>Coach</Text>
                        <View style={styles.pillWrapRow}>
                          {coaches.map((c) => (
                            <TouchableOpacity key={c.id} style={[styles.pill, schedDraft.coachId === c.id && styles.pillActive]} onPress={() => updateSchedDraft((s) => ({ ...s, coachId: c.id }))}>
                              <Text style={[styles.pillText, schedDraft.coachId === c.id && styles.pillTextActive]} maxFontSizeMultiplier={1.3}>{c.full_name}</Text>
                            </TouchableOpacity>
                          ))}
                        </View>

                        <Text style={styles.formLabel} maxFontSizeMultiplier={1.3}>Recurring</Text>
                        <View style={styles.pillRow}>
                          <TouchableOpacity style={[styles.pill, schedDraft.isRecurring && styles.pillActive]} onPress={() => updateSchedDraft((s) => ({ ...s, isRecurring: true, oneTimeDate: null }))}>
                            <Text style={[styles.pillText, schedDraft.isRecurring && styles.pillTextActive]} maxFontSizeMultiplier={1.3}>Recurring</Text>
                          </TouchableOpacity>
                          <TouchableOpacity style={[styles.pill, !schedDraft.isRecurring && styles.pillActive]} onPress={() => updateSchedDraft((s) => ({ ...s, isRecurring: false }))}>
                            <Text style={[styles.pillText, !schedDraft.isRecurring && styles.pillTextActive]} maxFontSizeMultiplier={1.3}>One-time</Text>
                          </TouchableOpacity>
                        </View>
                        {schedDraft.isRecurring ? (
                          <>
                            <Text style={styles.formLabel} maxFontSizeMultiplier={1.3}>Day</Text>
                            <View style={styles.pillWrapRow}>
                              {DAY_NAMES.map((d, i) => (
                                <TouchableOpacity key={d} style={[styles.pill, schedDraft.day === i && styles.pillActive]} onPress={() => updateSchedDraft((s) => ({ ...s, day: i }))}>
                                  <Text style={[styles.pillText, schedDraft.day === i && styles.pillTextActive]} maxFontSizeMultiplier={1.3}>{d.slice(0, 3)}</Text>
                                </TouchableOpacity>
                              ))}
                            </View>
                          </>
                        ) : (
                          <MiniDatePicker value={schedDraft.oneTimeDate} onChange={(d) => updateSchedDraft((s) => ({ ...s, oneTimeDate: d }))} minDate={todayStr()} />
                        )}

                        <Text style={styles.formLabel} maxFontSizeMultiplier={1.3}>Start</Text>
                        <TimePicker value={schedDraft.start} onChange={(t) => updateSchedDraft((s) => ({ ...s, start: t }))} />
                        <Text style={styles.formLabel} maxFontSizeMultiplier={1.3}>End</Text>
                        <TimePicker value={schedDraft.end} onChange={(t) => updateSchedDraft((s) => ({ ...s, end: t }))} />

                        {courts.length > 0 && (
                          <>
                            <Text style={styles.formLabel} maxFontSizeMultiplier={1.3}>Court</Text>
                            <View style={styles.pillWrapRow}>
                              {courts.map((c) => (
                                <TouchableOpacity key={c.id} style={[styles.pill, schedDraft.courtId === c.id && styles.pillActive]} onPress={() => updateSchedDraft((s) => ({ ...s, courtId: s.courtId === c.id ? null : c.id }))}>
                                  <Text style={[styles.pillText, schedDraft.courtId === c.id && styles.pillTextActive]} maxFontSizeMultiplier={1.3}>{c.name}</Text>
                                </TouchableOpacity>
                              ))}
                            </View>
                          </>
                        )}

                        {schedSlots.length > 0 && (
                          <>
                            <Text style={styles.formLabel} maxFontSizeMultiplier={1.3}>Time slots added</Text>
                            {schedSlots.map((s, i) => (
                              <View key={i} style={styles.slotSummaryCard}>
                                <View style={{ flex: 1 }}>
                                  <Text style={styles.slotSummaryTitle}>{s.isRecurring ? DAY_NAMES[s.day].slice(0, 3) : s.oneTimeDate} · {formatTime12h(s.start)}–{formatTime12h(s.end)}</Text>
                                  <Text style={styles.slotSummarySub} maxFontSizeMultiplier={1.3}>{coaches.find((c) => c.id === s.coachId)?.full_name ?? 'Coach'}{s.courtId ? ` · ${courts.find((c) => c.id === s.courtId)?.name}` : ''}</Text>
                                </View>
                                <TouchableOpacity onPress={() => removeSchedSlot(i)}>
                                  <Icon name="close-circle-outline" size={20} color="#FF6B6B" />
                                </TouchableOpacity>
                              </View>
                            ))}
                          </>
                        )}

                        <TouchableOpacity style={styles.addRowBtn} onPress={addSchedSlot}>
                          <Icon name="plus-circle-outline" size={20} color={Theme.eyebrowGreen} />
                          <Text style={styles.addRowText}>Add another time slot</Text>
                        </TouchableOpacity>

                        <TouchableOpacity style={[styles.saveBtn, schedSaving && styles.saveBtnDisabled]} onPress={saveSchedule} disabled={schedSaving}>
                          <Text style={styles.saveBtnText}>{schedSaving ? 'Scheduling...' : 'Save Private Lesson'}</Text>
                        </TouchableOpacity>
                      </View>
                    )
                  ) : (
                    <TouchableOpacity style={styles.addRowBtn} onPress={openScheduling}>
                      <Icon name="plus-circle-outline" size={20} color={Theme.eyebrowGreen} />
                      <Text style={styles.addRowText}>Schedule Private Lesson</Text>
                    </TouchableOpacity>
                  )}
                </>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Schedule makeup modal */}
      <Modal visible={!!scheduleCredit} transparent animationType="fade" onRequestClose={() => setScheduleCredit(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Schedule Makeup</Text>
              <TouchableOpacity onPress={() => setScheduleCredit(null)}>
                <Icon name="close-circle-outline" size={26} color={Theme.textPrimary} />
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={styles.hint} maxFontSizeMultiplier={1.3}>{firstName(scheduleCredit?.playerName)} — {scheduleCredit?.label}</Text>
              <Text style={styles.formLabel} maxFontSizeMultiplier={1.3}>Date</Text>
              <MiniDatePicker value={scheduleDate} onChange={setScheduleDate} minDate={todayStr()} />
              <Text style={[styles.formLabel, { marginTop: 12 }]} maxFontSizeMultiplier={1.3}>Start time</Text>
              <TimePicker value={scheduleStart} onChange={setScheduleStart} />
              <Text style={[styles.formLabel, { marginTop: 12 }]} maxFontSizeMultiplier={1.3}>End time</Text>
              <TimePicker value={scheduleEnd} onChange={setScheduleEnd} />
              {courts.length > 0 && (
                <>
                  <Text style={[styles.formLabel, { marginTop: 12 }]} maxFontSizeMultiplier={1.3}>Court</Text>
                  <View style={styles.pillWrapRow}>
                    {courts.map((c) => (
                      <TouchableOpacity key={c.id} style={[styles.pill, scheduleCourtId === c.id && styles.pillActive]} onPress={() => setScheduleCourtId((prev) => (prev === c.id ? null : c.id))}>
                        <Text style={[styles.pillText, scheduleCourtId === c.id && styles.pillTextActive]} maxFontSizeMultiplier={1.3}>{c.name}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </>
              )}
              <TouchableOpacity style={[styles.saveBtn, savingSchedule && styles.saveBtnDisabled]} onPress={submitScheduleMakeup} disabled={savingSchedule}>
                <Text style={styles.saveBtnText}>{savingSchedule ? 'Saving...' : 'Confirm Makeup Schedule'}</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Suggest makeup times modal */}
      <Modal visible={!!suggestCredit} transparent animationType="fade" onRequestClose={() => setSuggestCredit(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Suggest a Makeup Time</Text>
              <TouchableOpacity onPress={() => setSuggestCredit(null)}>
                <Icon name="close-circle-outline" size={26} color={Theme.textPrimary} />
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={styles.hint} maxFontSizeMultiplier={1.3}>{firstName(suggestCredit?.playerName)} — {suggestCredit?.label}</Text>
              {loadingSuggestions ? (
                <Text style={styles.muted} maxFontSizeMultiplier={1.3}>Looking for open slots...</Text>
              ) : suggestions.length === 0 ? (
                <Text style={styles.muted} maxFontSizeMultiplier={1.3}>No open slots found in the next few weeks — try Schedule instead to pick one manually.</Text>
              ) : (
                <>
                  {suggestions[0]?.isDifferentCoach && (
                    <Text style={styles.muted} maxFontSizeMultiplier={1.3}>The original coach had nothing open — these are with another club coach.</Text>
                  )}
                  {suggestions.map((s) => {
                    const key = `${s.date}_${s.startTime}`;
                    return (
                      <View key={key} style={styles.suggestSlotRow}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.makeupNewTime} maxFontSizeMultiplier={1.3}>
                            {s.date} · {formatTime12h(s.startTime)}–{formatTime12h(s.endTime)}
                          </Text>
                          <Text style={styles.lessonMeta} maxFontSizeMultiplier={1.3}>
                            {s.courtName ? `${s.courtName} · ` : ''}{s.coachName}{s.isBestFit ? ' · Best fit' : ''}
                          </Text>
                        </View>
                        <TouchableOpacity
                          style={[styles.makeupActionBtn, sendingSlot === key && { opacity: 0.6 }]}
                          onPress={() => sendSlotToPlayer(s)}
                          disabled={!!sendingSlot}
                        >
                          <Text style={styles.makeupActionBtnText}>{sendingSlot === key ? 'Sending...' : 'Send'}</Text>
                        </TouchableOpacity>
                      </View>
                    );
                  })}
                </>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Theme.background },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 24, paddingTop: 60, paddingBottom: 16 },
  title: { fontFamily: Fonts.serifMedium, fontSize: 30, color: Theme.textPrimary },
  addBtn: { padding: 4 },
  tabRow: { flexDirection: 'row', gap: 14, paddingHorizontal: 24, paddingBottom: 20 },
  scroll: { paddingHorizontal: 24, paddingBottom: 100 },
  emptyText: { fontFamily: Fonts.sansRegular, fontSize: 16, color: Theme.textSecondary, fontStyle: 'italic', marginVertical: 8 },
  muted: { fontFamily: Fonts.sansRegular, fontSize: 16, color: Theme.textSecondary, fontStyle: 'italic', marginVertical: 8 },
  emptyState: { alignItems: 'center', paddingTop: 40, gap: 12 },
  emptyDesc: { fontFamily: Fonts.sansRegular, fontSize: 16, color: Theme.textSecondary, textAlign: 'center', lineHeight: 22, paddingHorizontal: 30 },
  lessonCard: { flexDirection: 'row', alignItems: 'flex-start', backgroundColor: Theme.cardWhite, borderRadius: 16, padding: 18, marginBottom: 14, gap: 14 },
  colorDot: { width: 10, height: 10, borderRadius: 5, marginTop: 6 },
  lessonName: { fontFamily: Fonts.sansSemiBold, fontSize: 18, color: Theme.textPrimary },
  lessonMeta: { fontFamily: Fonts.sansRegular, fontSize: 15, color: Theme.textSecondary, marginTop: 3 },
  rosterChip: { alignSelf: 'flex-start', backgroundColor: Theme.cardTinted, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 4, marginTop: 10 },
  rosterChipText: { fontFamily: Fonts.sansSemiBold, fontSize: 14, color: Theme.eyebrowGreen },
  makeupCard: { backgroundColor: Theme.cardWhite, borderRadius: 16, padding: 16, marginBottom: 14, gap: 6 },
  makeupCardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  makeupPlayerName: { flex: 1, fontFamily: Fonts.sansSemiBold, fontSize: 16, color: Theme.textPrimary },
  makeupStatusPill: { borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5 },
  makeupStatusConfirmed: { backgroundColor: '#E2EFAE' },
  makeupStatusPending: { backgroundColor: '#D6E4F0' },
  makeupStatusNeeds: { backgroundColor: '#FBDAB3' },
  makeupStatusText: { fontFamily: Fonts.sansSemiBold, fontSize: 12 },
  makeupStatusTextConfirmed: { color: '#3B6D11' },
  makeupStatusTextPending: { color: '#2C5C8A' },
  makeupStatusTextNeeds: { color: '#854F0B' },
  makeupLabel: { fontFamily: Fonts.sansRegular, fontSize: 14, color: Theme.textSecondary },
  makeupTimeRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4, flexWrap: 'wrap' },
  makeupOldTime: { fontFamily: Fonts.sansRegular, fontSize: 14, color: Theme.textMuted, textDecorationLine: 'line-through' },
  makeupNewTime: { fontFamily: Fonts.sansSemiBold, fontSize: 14, color: Theme.textPrimary },
  makeupNotPicked: { fontFamily: Fonts.sansRegular, fontSize: 14, color: Theme.textSecondary, fontStyle: 'italic' },
  makeupCardBottom: { flexDirection: 'row', alignItems: 'center', marginTop: 8 },
  notifiedTag: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  notifiedTagText: { fontFamily: Fonts.sansSemiBold, fontSize: 12, color: Theme.eyebrowGreen },
  makeupActionBtn: { backgroundColor: Theme.limeAccent, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8 },
  makeupActionBtnText: { fontFamily: Fonts.sansBold, fontSize: 13, color: Theme.limeAccentDark },
  makeupDeclineBtn: { backgroundColor: Theme.cardTinted, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8 },
  makeupDeclineBtnText: { fontFamily: Fonts.sansBold, fontSize: 13, color: '#9B2559' },
  awayCard: { backgroundColor: Theme.cardTinted, borderRadius: 16, padding: 16, marginBottom: 16 },
  awayCardTitle: { fontFamily: Fonts.sansSemiBold, fontSize: 12, color: Theme.eyebrowGreen, letterSpacing: 1, marginBottom: 8 },
  awayRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 },
  awayRowText: { fontFamily: Fonts.sansRegular, fontSize: 14, color: Theme.textPrimary },
  suggestSlotRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: Theme.cardWhite,
    borderRadius: 12, borderWidth: 1, borderColor: Theme.divider, padding: 14, marginBottom: 10,
  },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: Theme.background, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, maxHeight: '88%' },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 },
  modalTitle: { fontFamily: Fonts.serifMedium, fontSize: 20, color: Theme.textPrimary, flexShrink: 1 },
  formLabel: { fontFamily: Fonts.sansSemiBold, fontSize: 15, color: Theme.textSecondary, marginBottom: 8, marginTop: 4 },
  formInput: { backgroundColor: Theme.cardWhite, borderRadius: 10, padding: 16, color: Theme.textPrimary, fontFamily: Fonts.sansRegular, fontSize: 16, marginBottom: 10, borderWidth: 1, borderColor: Theme.divider },
  hint: { fontFamily: Fonts.sansRegular, fontSize: 14, color: Theme.textSecondary, lineHeight: 19, marginBottom: 12 },
  pillRow: { flexDirection: 'row', gap: 10, marginBottom: 10 },
  pillWrapRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 10 },
  pill: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 20, backgroundColor: Theme.cardWhite, borderWidth: 1, borderColor: Theme.divider },
  pillActive: { backgroundColor: Theme.eyebrowGreen, borderColor: Theme.eyebrowGreen },
  pillText: { fontFamily: Fonts.sansSemiBold, fontSize: 15, color: Theme.textSecondary },
  pillTextActive: { color: '#FFFFFF' },
  // Bigger than the plain `pill` above — only for the two screen-level tab
  // rows (Lessons' Group/Private/Makeups and the Makeups status filter), not
  // the many small option-picker pills reusing `pill` elsewhere in this
  // file's wizards/modals.
  screenTabPill: { paddingHorizontal: 18, paddingVertical: 13, borderRadius: 26, backgroundColor: Theme.cardWhite, borderWidth: 1, borderColor: Theme.divider },
  screenTabPillActive: { backgroundColor: Theme.eyebrowGreen, borderColor: Theme.eyebrowGreen },
  screenTabPillText: { fontFamily: Fonts.sansSemiBold, fontSize: 20, color: Theme.textSecondary },
  screenTabPillTextActive: { color: '#FFFFFF' },
  // The Makeups status sub-filter (Confirmed/Needs approval/Needs slot) —
  // smaller than `screenTabPill` since it's one level down from the
  // Group/Private/Makeups tabs above it. paddingHorizontal: 0 here (instead
  // of tabRow's 24) because this row already sits inside `scroll`'s own
  // 24px padding — stacking both would indent it further than the tab row
  // above, which sits outside `scroll`.
  subTabRow: { flexDirection: 'row', gap: 10, paddingBottom: 20 },
  subTabPill: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 20, backgroundColor: Theme.cardWhite, borderWidth: 1, borderColor: Theme.divider },
  subTabPillActive: { backgroundColor: Theme.eyebrowGreen, borderColor: Theme.eyebrowGreen },
  subTabPillText: { fontFamily: Fonts.sansSemiBold, fontSize: 14, color: Theme.textSecondary },
  subTabPillTextActive: { color: '#FFFFFF' },
  slotChip: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: Theme.cardTinted, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, marginBottom: 8 },
  slotChipText: { fontFamily: Fonts.sansSemiBold, fontSize: 14, color: Theme.eyebrowGreen },
  slotSummaryCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: Theme.cardTinted, borderRadius: 12, padding: 14, marginBottom: 10, gap: 10 },
  slotSummaryTitle: { fontFamily: Fonts.sansSemiBold, fontSize: 15, color: Theme.textPrimary },
  slotSummarySub: { fontFamily: Fonts.sansRegular, fontSize: 13, color: Theme.textSecondary, marginTop: 3 },
  slotForm: { backgroundColor: Theme.cardWhite, borderRadius: 14, padding: 14, marginTop: 8, marginBottom: 10, borderWidth: 1, borderColor: Theme.divider },
  addRowBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8, marginBottom: 16, alignSelf: 'flex-start' },
  addRowText: { fontFamily: Fonts.sansSemiBold, fontSize: 15, color: Theme.eyebrowGreen },
  saveBtn: { backgroundColor: Theme.limeAccent, borderRadius: 30, paddingVertical: 14, alignItems: 'center' },
  saveBtnDisabled: { opacity: 0.6 },
  saveBtnText: { fontFamily: Fonts.sansBold, color: Theme.limeAccentDark, fontSize: 15 },
  wizardNav: { flexDirection: 'row', gap: 12, marginTop: 16, marginBottom: 24, alignItems: 'center' },
  navBackBtn: { paddingHorizontal: 18, paddingVertical: 14 },
  navBackText: { fontFamily: Fonts.sansSemiBold, fontSize: 15, color: Theme.textSecondary },
  searchResultRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: Theme.cardWhite, borderRadius: 12, padding: 14, marginBottom: 10 },
  playerName: { fontFamily: Fonts.sansSemiBold, fontSize: 16, color: Theme.textPrimary },
  playerEmail: { fontFamily: Fonts.sansRegular, fontSize: 13, color: Theme.textSecondary, marginTop: 2 },
  smallLink: { fontFamily: Fonts.sansSemiBold, fontSize: 13, color: Theme.eyebrowGreen },
  reviewCard: { backgroundColor: Theme.cardWhite, borderRadius: 14, padding: 16, marginBottom: 10, gap: 6 },
  reviewName: { fontFamily: Fonts.serifMedium, fontSize: 18, color: Theme.textPrimary, marginBottom: 4 },
  reviewLine: { fontFamily: Fonts.sansRegular, fontSize: 14, color: Theme.textSecondary },
  deleteLessonBtn: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 20, marginBottom: 30, alignSelf: 'flex-start' },
  deleteLessonText: { fontFamily: Fonts.sansSemiBold, fontSize: 15, color: '#E74C3C' },
});
