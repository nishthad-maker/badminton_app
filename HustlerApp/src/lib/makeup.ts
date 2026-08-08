import { supabase } from './supabase';
import { formatTime12h, formatDateLong, ASSUMED_TIER_DURATION_MINUTES, localDateStr } from './scheduling';
import {
  notifyMakeupAvailable, notifyMakeupSlotRequested, notifyMakeupSlotApproved, notifyMakeupSlotDeclined,
  notifyMakeupSlotProposed, notifyMakeupSlotConfirmedByPlayer, notifyMakeupSlotDeclinedByPlayer,
} from './notifications';

// A 'scheduled' (Confirmed) credit whose slot has already passed — the
// club never has to remember to hit "Mark Done"; it's swept into 'done'
// automatically the next time the makeup list loads (see the sweep in
// getClubMakeupCredits below).
const isPastScheduledSlot = (c: Pick<MakeupCredit, 'status' | 'scheduledDate' | 'scheduledEndTime'>) =>
  c.status === 'scheduled' && !!c.scheduledDate && !!c.scheduledEndTime && new Date(`${c.scheduledDate}T${c.scheduledEndTime}`) < new Date();

export type MakeupCredit = {
  id: string;
  kind: 'private' | 'group';
  playerId: string;
  playerName: string;
  label: string;
  missedDate: string;
  status: 'owed' | 'pending_approval' | 'proposed' | 'scheduled' | 'done';
  scheduledDate: string | null;
  scheduledStartTime: string | null;
  scheduledEndTime: string | null;
  scheduledCourtName: string | null;
  // The lesson's coach — only ever set for kind 'private' (a group lesson has
  // no single coach), used to notify the right person when a proposed slot
  // is confirmed/declined.
  coachId: string | null;
  // How long the missed lesson actually ran — a private lesson can be 1hr or
  // 2hr depending on the club, so the manual "Schedule Makeup" flow can
  // default to the same length instead of leaving it to guesswork. Group
  // credits use the same assumed-1hr constant the rest of the app already
  // relies on for tiers without a real end_time.
  originalDurationMinutes: number | null;
  // The underlying lesson identity (private's schedule_assignment, or
  // group's tier) — lets a scheduled makeup reuse the exact same
  // `attendance` table + toggle_attendance() RPC as a regular lesson, just
  // keyed by the makeup's one-off scheduledDate instead of a recurring day.
  scheduleAssignmentId: string | null;
  groupTierId: string | null;
};

// A club-proposed time sitting unconfirmed is the one thing that actually
// needs the player/parent to act (Confirm / Can't make it) — those always
// float to the top. Everything else sorts soonest-first by whichever date
// is most relevant right now (the upcoming scheduled/proposed date, or the
// missed date itself for a credit that hasn't been placed on the calendar
// yet), so a makeup happening tomorrow is never buried under one two months
// out.
const makeupSortKey = (c: Pick<MakeupCredit, 'scheduledDate' | 'missedDate'>) => c.scheduledDate ?? c.missedDate;
const sortMakeupCredits = (list: MakeupCredit[]): MakeupCredit[] => [...list].sort((a, b) => {
  const aProposed = a.status === 'proposed' ? 0 : 1;
  const bProposed = b.status === 'proposed' ? 0 : 1;
  if (aProposed !== bProposed) return aProposed - bProposed;
  const aKey = makeupSortKey(a);
  const bKey = makeupSortKey(b);
  return aKey < bKey ? -1 : aKey > bKey ? 1 : 0;
});

export type ClubTournamentBlock = { id: string; playerId: string; playerName: string; startDate: string; endDate: string };

// Every currently-active or upcoming tournament block for the club's own
// roster — answers "who's away right now" directly, rather than the club
// having to infer it from scattered missed-lesson makeup credits.
export async function getClubTournamentBlocks(clubId: string): Promise<ClubTournamentBlock[]> {
  const { data: members } = await supabase
    .from('club_members').select('player_id, profiles!club_members_player_id_fkey(full_name)').eq('club_id', clubId).eq('status', 'active');
  const playerIds = (members ?? []).map((m: any) => m.player_id);
  if (playerIds.length === 0) return [];
  const nameById = new Map((members ?? []).map((m: any) => [m.player_id, m.profiles?.full_name ?? 'Player']));

  const { data: blocks } = await supabase
    .from('tournament_blocks')
    .select('id, player_id, start_date, end_date')
    .in('player_id', playerIds)
    .gte('end_date', localDateStr())
    .order('start_date', { ascending: true });

  return (blocks ?? []).map((b: any) => ({
    id: b.id, playerId: b.player_id, playerName: nameById.get(b.player_id) ?? 'Player',
    startDate: b.start_date, endDate: b.end_date,
  }));
}

export type MakeupSuggestion = {
  date: string;
  startTime: string;
  endTime: string;
  courtId: string | null;
  courtName: string | null;
  coachId: string;
  coachName: string;
  isBestFit: boolean;
  isDifferentCoach: boolean;
  // Why this particular time was picked over other open slots that day —
  // shown in the picker so a parent/club can see the algorithm isn't just
  // grabbing the first opening (e.g. "Right after Advanced Group Training").
  reason: string;
};

type SchedulingContext = {
  original: { coachId: string; courtId: string | null; startTime: string; endTime: string; missedDate: string };
  coaches: { id: string; fullName: string }[];
  courts: { id: string; name: string }[];
  privateLessons: { coachId: string; courtId: string | null; dayOfWeek: number; startTime: string; endTime: string }[];
  groupSlots: { coachIds: string[]; courtIds: string[]; dayOfWeek: number; startTime: string; endTime: string; isRecurring: boolean; oneTimeDate: string | null }[];
  oneOffBookings: { coachId: string; courtId: string | null; date: string; startTime: string; endTime: string }[];
  tournamentBlocks: { startDate: string; endDate: string }[];
  coachTimeOff: { coachId: string; kind: 'recurring_break' | 'recurring_day_off' | 'days_off'; dayOfWeek: number | null; startTime: string | null; endTime: string | null; startDate: string | null; endDate: string | null }[];
  // A coach's actual working hours — see coachTimeOff's "not working"
  // (negative) vs. this "does work" (positive) distinction in isCoachBusy
  // below. Empty for a coach with no shifts defined at all → unrestricted.
  coachShifts: { coachId: string; dayOfWeek: number; startTime: string; endTime: string }[];
  // The player's OWN other commitments (any coach/court) — used to prefer a
  // makeup slot that's back-to-back with something already on the schedule
  // that day, instead of a separate trip.
  playerSchedule: { dayOfWeek: number; startTime: string; endTime: string; isRecurring: boolean; oneTimeDate: string | null; label: string }[];
};

const DAY_WINDOW_START_MIN = 8 * 60;
const DAY_WINDOW_END_MIN = 20 * 60;
// Fallback candidate times when nothing lines up with another commitment
// that day — same time of day as the missed lesson first, then progressively
// further out.
const OFFSET_MINUTES = [0, 60, -60, 120, -120];
// How many days out from the missed lesson to look for an opening — applied
// in both directions (a lesson can be marked not-attending ahead of time via
// nextOccurrenceDate(), so "before the missed day" can be a real, bookable
// makeup slot, not just "after"). Day-closeness is scored below, so a slot
// a couple days away always beats one near this outer edge of the window.
const SEARCH_WINDOW_DAYS = 21;
// Weekday mornings/early afternoons are when a school-age player is in
// class, not free to train — a 8am slot on a Tuesday is not "convenient"
// even if it's technically open, so it's scored well below anything later
// in the day or on a weekend.
const SCHOOL_DAY_CUTOFF_MIN = 15 * 60; // 3:00 PM
const isSchoolDay = (dow: number) => dow >= 1 && dow <= 5;

const timeToMinutes = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
const minutesToTime = (min: number) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}:00`;
const overlaps = (aStart: number, aEnd: number, bStart: number, bEnd: number) => aStart < bEnd && bStart < aEnd;

// Suggests up to 3 one-off makeup slots — searches both before and after the
// missed date (see SEARCH_WINDOW_DAYS), same coach as the missed lesson
// tried first, always the missed lesson's own duration (a 1hr private lesson
// only ever gets 1hr suggestions, never a made-up length), and ranked by how
// convenient the time actually is for the player rather than just "first
// opening near the original time":
//   1. Back-to-back with another lesson already on the player's schedule
//      that day (no second trip to the club) beats everything else.
//   2. Weekday slots before school lets out are heavily deprioritized.
//   3. Among what's left, closer to the missed date wins, then closer to
//      the missed lesson's original time of day.
// Only offers a different coach if the original one has nothing open across
// the whole search window — and even then, `ctx.coaches` (from
// get_makeup_scheduling_context) is already scoped server-side to coaches
// who actually work with this player (their group tier's coaches, or any
// other private lesson they have), not just any active club coach.
export async function getMakeupSuggestions(creditId: string): Promise<MakeupSuggestion[]> {
  const { data, error } = await supabase.rpc('get_makeup_scheduling_context', { p_credit_id: creditId });
  if (error || !data) return [];
  const ctx = data as SchedulingContext;

  const originalStartMin = timeToMinutes(ctx.original.startTime);
  const durationMin = timeToMinutes(ctx.original.endTime) - originalStartMin;
  const missed = new Date(`${ctx.original.missedDate}T00:00:00`);

  const isCoachBusy = (coachId: string, dateStr: string, dow: number, startMin: number, endMin: number) => {
    if (ctx.privateLessons.some((l) => l.coachId === coachId && l.dayOfWeek === dow && overlaps(startMin, endMin, timeToMinutes(l.startTime), timeToMinutes(l.endTime)))) return true;
    if (ctx.groupSlots.some((s) =>
      s.coachIds.includes(coachId)
      && ((s.isRecurring && s.dayOfWeek === dow) || (!s.isRecurring && s.oneTimeDate === dateStr))
      && overlaps(startMin, endMin, timeToMinutes(s.startTime), timeToMinutes(s.endTime))
    )) return true;
    if (ctx.oneOffBookings.some((b) => b.coachId === coachId && b.date === dateStr && overlaps(startMin, endMin, timeToMinutes(b.startTime), timeToMinutes(b.endTime)))) return true;
    const onTimeOff = (ctx.coachTimeOff ?? []).some((t) => {
      if (t.coachId !== coachId) return false;
      if (t.kind === 'recurring_break') return t.dayOfWeek === dow && !!t.startTime && !!t.endTime && overlaps(startMin, endMin, timeToMinutes(t.startTime), timeToMinutes(t.endTime));
      if (t.kind === 'recurring_day_off') return t.dayOfWeek === dow;
      return !!t.startDate && !!t.endDate && dateStr >= t.startDate && dateStr <= t.endDate; // days_off
    });
    if (onTimeOff) return true;
    // Outside working hours, once the club has bothered to define any —
    // a coach with zero coach_shifts rows stays fully unrestricted.
    const coachShifts = (ctx.coachShifts ?? []).filter((s) => s.coachId === coachId);
    if (coachShifts.length > 0) {
      const todaysShifts = coachShifts.filter((s) => s.dayOfWeek === dow);
      if (todaysShifts.length === 0) return true; // no shift this weekday = not working
      const withinAShift = todaysShifts.some((s) => startMin >= timeToMinutes(s.startTime) && endMin <= timeToMinutes(s.endTime));
      if (!withinAShift) return true;
    }
    return false;
  };

  const isCourtBusy = (courtId: string, dateStr: string, dow: number, startMin: number, endMin: number) => {
    if (ctx.privateLessons.some((l) => l.courtId === courtId && l.dayOfWeek === dow && overlaps(startMin, endMin, timeToMinutes(l.startTime), timeToMinutes(l.endTime)))) return true;
    if (ctx.groupSlots.some((s) =>
      s.courtIds.includes(courtId)
      && ((s.isRecurring && s.dayOfWeek === dow) || (!s.isRecurring && s.oneTimeDate === dateStr))
      && overlaps(startMin, endMin, timeToMinutes(s.startTime), timeToMinutes(s.endTime))
    )) return true;
    return ctx.oneOffBookings.some((b) => b.courtId === courtId && b.date === dateStr && overlaps(startMin, endMin, timeToMinutes(b.startTime), timeToMinutes(b.endTime)));
  };

  const isPlayerAway = (dateStr: string) => ctx.tournamentBlocks.some((t) => dateStr >= t.startDate && dateStr <= t.endDate);

  // The player's own other commitments landing on this specific date —
  // regardless of which coach/court they're with, since the point is
  // whether there's already a reason to be at the club that day, not
  // whether the makeup coach happens to be busy then.
  const dayCommitments = (dateStr: string, dow: number) => (ctx.playerSchedule ?? [])
    .filter((s) => (s.isRecurring && s.dayOfWeek === dow) || (!s.isRecurring && s.oneTimeDate === dateStr))
    .map((s) => ({ start: timeToMinutes(s.startTime), end: timeToMinutes(s.endTime), label: s.label }));

  const findCourt = (dateStr: string, dow: number, startMin: number, endMin: number, preferredCourtId: string | null) => {
    const ordered = [...ctx.courts].sort((a, b) => (a.id === preferredCourtId ? -1 : b.id === preferredCourtId ? 1 : 0));
    return ordered.find((c) => !isCourtBusy(c.id, dateStr, dow, startMin, endMin)) ?? null;
  };

  type DayPick = { date: string; startMin: number; endMin: number; coachId: string; coachName: string; courtId: string; courtName: string; isDifferentCoach: boolean; reason: string; score: number };

  // Best convenience score, in priority order: back-to-back with an existing
  // commitment beats everything; a weekday slot before school lets out is
  // heavily penalized; a day further from the missed date outweighs the
  // (much smaller) time-of-day distance, so the closest open day always
  // wins over a same-time-of-day slot that's a week further out.
  const scoreOf = (startMin: number, dow: number, adjacent: boolean, dayOffset: number) => {
    let score = adjacent ? 100 : 0;
    if (isSchoolDay(dow) && startMin < SCHOOL_DAY_CUTOFF_MIN) score -= 50;
    score -= Math.abs(dayOffset) * 3;
    score -= Math.abs(startMin - originalStartMin) / 60;
    return score;
  };

  const todayStr = localDateStr();

  const searchCoach = (coachId: string, coachName: string, isDifferentCoach: boolean): DayPick[] => {
    const picks: DayPick[] = [];

    for (let dayOffset = -SEARCH_WINDOW_DAYS; dayOffset <= SEARCH_WINDOW_DAYS; dayOffset++) {
      if (dayOffset === 0) continue; // the missed day itself
      const d = new Date(missed);
      d.setDate(d.getDate() + dayOffset);
      const dateStr = localDateStr(d);
      if (dateStr < todayStr) continue; // can't book a makeup in the past
      if (isPlayerAway(dateStr)) continue;
      const dow = d.getDay();

      const commitments = dayCommitments(dateStr, dow);
      const candidates: { startMin: number; adjacent: boolean; reason: string }[] = [];
      for (const c of commitments) {
        candidates.push({ startMin: c.end, adjacent: true, reason: `Right after ${c.label}` });
        candidates.push({ startMin: c.start - durationMin, adjacent: true, reason: `Right before ${c.label}` });
      }
      for (const offset of OFFSET_MINUTES) {
        candidates.push({ startMin: originalStartMin + offset, adjacent: false, reason: offset === 0 ? 'Same time as the missed lesson' : 'Close to the missed lesson\'s usual time' });
      }

      // Dedupe identical start times, keeping the adjacent-commitment version
      // (higher priority) if both land on the same minute.
      const byStart = new Map<number, { startMin: number; adjacent: boolean; reason: string }>();
      for (const cand of candidates) {
        const existing = byStart.get(cand.startMin);
        if (!existing || (cand.adjacent && !existing.adjacent)) byStart.set(cand.startMin, cand);
      }

      const ranked = [...byStart.values()].sort((a, b) => scoreOf(b.startMin, dow, b.adjacent, dayOffset) - scoreOf(a.startMin, dow, a.adjacent, dayOffset));

      for (const cand of ranked) {
        const startMin = cand.startMin;
        const endMin = startMin + durationMin;
        if (startMin < DAY_WINDOW_START_MIN || endMin > DAY_WINDOW_END_MIN) continue;
        if (isCoachBusy(coachId, dateStr, dow, startMin, endMin)) continue;
        const court = findCourt(dateStr, dow, startMin, endMin, isDifferentCoach ? null : ctx.original.courtId);
        if (!court) continue;
        picks.push({
          date: dateStr, startMin, endMin, coachId, coachName, courtId: court.id, courtName: court.name,
          isDifferentCoach, reason: cand.reason, score: scoreOf(startMin, dow, cand.adjacent, dayOffset),
        });
        break; // one slot per date is plenty
      }
    }

    return picks;
  };

  const toSuggestions = (picks: DayPick[]): MakeupSuggestion[] => {
    const top = [...picks].sort((a, b) => b.score - a.score || (a.date < b.date ? -1 : 1)).slice(0, 3);
    return top.map((p, i) => ({
      date: p.date, startTime: minutesToTime(p.startMin), endTime: minutesToTime(p.endMin),
      courtId: p.courtId, courtName: p.courtName, coachId: p.coachId, coachName: p.coachName,
      isBestFit: i === 0, isDifferentCoach: p.isDifferentCoach, reason: p.reason,
    }));
  };

  const originalCoach = ctx.coaches.find((c) => c.id === ctx.original.coachId);
  const originalPicks = searchCoach(ctx.original.coachId, originalCoach?.fullName ?? 'Coach', false);
  if (originalPicks.length > 0) return toSuggestions(originalPicks);

  for (const coach of ctx.coaches) {
    if (coach.id === ctx.original.coachId) continue;
    const picks = searchCoach(coach.id, coach.fullName, true);
    if (picks.length > 0) return toSuggestions(picks);
  }

  return [];
}

// Player submits a chosen slot — moves the credit to 'pending_approval'
// rather than booking it outright; the club/coach confirms via
// approveMakeupRequest (or sends the player back to pick another via
// declineMakeupRequest). RLS only allows this transition from 'owed'.
export async function requestMakeupSlot(opts: {
  creditId: string; playerId: string; coachId: string; label: string;
  date: string; startTime: string; endTime: string; courtId: string | null;
}): Promise<{ ok: boolean; message?: string }> {
  const { error } = await supabase.from('makeup_lesson_credits').update({
    status: 'pending_approval', scheduled_date: opts.date, scheduled_start_time: opts.startTime,
    scheduled_end_time: opts.endTime, scheduled_court_id: opts.courtId,
  }).eq('id', opts.creditId).eq('status', 'owed');
  if (error) return { ok: false, message: 'Could not request that slot — please try again.' };
  const { data: profile } = await supabase.from('profiles').select('full_name').eq('id', opts.playerId).maybeSingle();
  await notifyMakeupSlotRequested(opts.coachId, profile?.full_name ?? 'A player', opts.label, opts.date, opts.startTime);
  return { ok: true };
}

// Club/coach confirms a player-requested slot as-is (no re-entry of
// date/time/court — it's already stored from the request).
export async function approveMakeupRequest(credit: MakeupCredit): Promise<{ ok: boolean }> {
  if (!credit.scheduledDate || !credit.scheduledStartTime) return { ok: false };
  const table = credit.kind === 'private' ? 'makeup_lesson_credits' : 'group_makeup_credits';
  const { error } = await supabase.from(table).update({ status: 'scheduled' }).eq('id', credit.id).eq('status', 'pending_approval');
  if (error) return { ok: false };
  await notifyMakeupSlotApproved(credit.playerId, credit.label, credit.scheduledDate, credit.scheduledStartTime);
  return { ok: true };
}

// Declines a player-requested slot — clears it back to 'owed' so they see
// "needs a slot" again and can request a different time.
export async function declineMakeupRequest(credit: MakeupCredit): Promise<{ ok: boolean }> {
  const table = credit.kind === 'private' ? 'makeup_lesson_credits' : 'group_makeup_credits';
  const { error } = await supabase.from(table).update({
    status: 'owed', scheduled_date: null, scheduled_start_time: null, scheduled_end_time: null, scheduled_court_id: null,
  }).eq('id', credit.id).eq('status', 'pending_approval');
  if (error) return { ok: false };
  await notifyMakeupSlotDeclined(credit.playerId, credit.label);
  return { ok: true };
}

// Club/coach sends the player a specific slot (picked from
// getMakeupSuggestions) — 'proposed' rather than 'scheduled' directly, since
// the player still needs to confirm it works for them.
export async function proposeMakeupSlot(opts: {
  creditId: string; playerId: string;
  date: string; startTime: string; endTime: string; courtId: string | null; label: string;
}): Promise<{ ok: boolean; message?: string }> {
  const { error } = await supabase.from('makeup_lesson_credits').update({
    status: 'proposed', scheduled_date: opts.date, scheduled_start_time: opts.startTime,
    scheduled_end_time: opts.endTime, scheduled_court_id: opts.courtId,
  }).eq('id', opts.creditId).eq('status', 'owed');
  if (error) return { ok: false, message: 'Could not send that slot — please try again.' };
  // notifyMakeupSlotProposed routes to the linked parent(s) if any exist,
  // player directly otherwise — see notifyPlayerOrParent in notifications.ts.
  await notifyMakeupSlotProposed(opts.playerId, opts.label, opts.date, opts.startTime);
  return { ok: true };
}

// Coach/club un-confirms an already-scheduled makeup (wrong time picked,
// plans changed, etc.) — clears the scheduled slot and sends it back to
// 'owed', same shape as declining a request, just starting from 'scheduled'
// instead of 'pending_approval'.
export async function resetConfirmedMakeup(credit: MakeupCredit): Promise<{ ok: boolean }> {
  const table = credit.kind === 'private' ? 'makeup_lesson_credits' : 'group_makeup_credits';
  const { error } = await supabase.from(table).update({
    status: 'owed', scheduled_date: null, scheduled_start_time: null, scheduled_end_time: null, scheduled_court_id: null,
  }).eq('id', credit.id).eq('status', 'scheduled');
  if (error) return { ok: false };
  await notifyMakeupAvailable(credit.playerId, credit.label);
  return { ok: true };
}

// Club withdraws a slot it proposed (changed their mind, or the player's
// asked them to try something else) — back to 'owed', no notification, this
// is the club's own action on their own proposal.
export async function withdrawMakeupProposal(credit: MakeupCredit): Promise<{ ok: boolean }> {
  const { error } = await supabase.from('makeup_lesson_credits').update({
    status: 'owed', scheduled_date: null, scheduled_start_time: null, scheduled_end_time: null, scheduled_court_id: null,
  }).eq('id', credit.id).eq('status', 'proposed');
  return { ok: !error };
}

// Player confirms a coach-proposed slot — booked immediately, no further
// approval needed since the club already picked it.
export async function confirmProposedMakeupSlot(credit: MakeupCredit): Promise<{ ok: boolean }> {
  if (!credit.scheduledDate || !credit.scheduledStartTime) return { ok: false };
  const { error } = await supabase.from('makeup_lesson_credits')
    .update({ status: 'scheduled' }).eq('id', credit.id).eq('status', 'proposed');
  if (error) return { ok: false };
  if (credit.coachId) {
    const { data: { user } } = await supabase.auth.getUser();
    const { data: profile } = user ? await supabase.from('profiles').select('full_name').eq('id', user.id).maybeSingle() : { data: null };
    await notifyMakeupSlotConfirmedByPlayer(credit.coachId, profile?.full_name ?? 'The player', credit.label, credit.scheduledDate, credit.scheduledStartTime);
  }
  return { ok: true };
}

// Player can't make the coach-proposed time — back to 'owed' for another
// suggestion, coach is told so they aren't left waiting.
export async function declineProposedMakeupSlot(credit: MakeupCredit): Promise<{ ok: boolean }> {
  const { error } = await supabase.from('makeup_lesson_credits').update({
    status: 'owed', scheduled_date: null, scheduled_start_time: null, scheduled_end_time: null, scheduled_court_id: null,
  }).eq('id', credit.id).eq('status', 'proposed');
  if (error) return { ok: false };
  if (credit.coachId) {
    const { data: { user } } = await supabase.auth.getUser();
    const { data: profile } = user ? await supabase.from('profiles').select('full_name').eq('id', user.id).maybeSingle() : { data: null };
    await notifyMakeupSlotDeclinedByPlayer(credit.coachId, profile?.full_name ?? 'The player', credit.label);
  }
  return { ok: true };
}

// Merges makeup_lesson_credits (private) and group_makeup_credits (group,
// only ever created when a club's allow_group_makeup is on) into one list
// for the club's makeup queue — owed -> scheduled -> done.
export async function getClubMakeupCredits(clubId: string): Promise<MakeupCredit[]> {
  const [{ data: privateRows }, { data: groupRows }] = await Promise.all([
    supabase
      .from('makeup_lesson_credits')
      .select('id, player_id, missed_date, status, scheduled_date, scheduled_start_time, scheduled_end_time, original_schedule_assignment_id, courts:scheduled_court_id(name), profiles:player_id(full_name), schedule_assignments:original_schedule_assignment_id!inner(club_id, coach_id, start_time, end_time, coach:profiles!schedule_assignments_coach_id_fkey(full_name))')
      .eq('schedule_assignments.club_id', clubId),
    supabase
      .from('group_makeup_credits')
      .select('id, player_id, missed_date, status, scheduled_date, scheduled_start_time, scheduled_end_time, group_tier_id, courts:scheduled_court_id(name), profiles:player_id(full_name), group_tiers:group_tier_id!inner(club_id, name)')
      .eq('group_tiers.club_id', clubId),
  ]);

  const privateCredits: MakeupCredit[] = (privateRows ?? [])
    .map((r: any) => ({
      id: r.id, kind: 'private' as const, playerId: r.player_id, playerName: r.profiles?.full_name ?? 'Player',
      label: `Private lesson with ${r.schedule_assignments?.coach?.full_name ?? 'coach'}`,
      missedDate: r.missed_date, status: r.status,
      scheduledDate: r.scheduled_date, scheduledStartTime: r.scheduled_start_time, scheduledEndTime: r.scheduled_end_time,
      scheduledCourtName: r.courts?.name ?? null,
      coachId: r.schedule_assignments?.coach_id ?? null,
      originalDurationMinutes: r.schedule_assignments?.start_time && r.schedule_assignments?.end_time
        ? timeToMinutes(r.schedule_assignments.end_time) - timeToMinutes(r.schedule_assignments.start_time)
        : null,
      scheduleAssignmentId: r.original_schedule_assignment_id ?? null,
      groupTierId: null,
    }));

  const groupCredits: MakeupCredit[] = (groupRows ?? []).map((r: any) => ({
    id: r.id, kind: 'group' as const, playerId: r.player_id, playerName: r.profiles?.full_name ?? 'Player',
    label: r.group_tiers?.name ?? 'Group lesson',
    missedDate: r.missed_date, status: r.status,
    scheduledDate: r.scheduled_date, scheduledStartTime: r.scheduled_start_time, scheduledEndTime: r.scheduled_end_time,
    scheduledCourtName: r.courts?.name ?? null,
    coachId: null,
    originalDurationMinutes: ASSUMED_TIER_DURATION_MINUTES,
    scheduleAssignmentId: null,
    groupTierId: r.group_tier_id ?? null,
  }));

  return sortMakeupCredits([...privateCredits, ...groupCredits]);
}

export async function getPlayerMakeupCredits(playerId: string): Promise<MakeupCredit[]> {
  const [{ data: privateRows }, { data: groupRows }] = await Promise.all([
    supabase
      .from('makeup_lesson_credits')
      .select('id, player_id, missed_date, status, scheduled_date, scheduled_start_time, scheduled_end_time, original_schedule_assignment_id, courts:scheduled_court_id(name), schedule_assignments:original_schedule_assignment_id(coach_id, start_time, end_time, coach:profiles!schedule_assignments_coach_id_fkey(full_name))')
      .eq('player_id', playerId),
    supabase
      .from('group_makeup_credits')
      .select('id, player_id, missed_date, status, scheduled_date, scheduled_start_time, scheduled_end_time, group_tier_id, courts:scheduled_court_id(name), group_tiers:group_tier_id(name)')
      .eq('player_id', playerId),
  ]);

  const privateCredits: MakeupCredit[] = (privateRows ?? []).map((r: any) => ({
    id: r.id, kind: 'private' as const, playerId: r.player_id, playerName: '',
    label: `Private lesson with ${r.schedule_assignments?.coach?.full_name ?? 'coach'}`,
    missedDate: r.missed_date, status: r.status,
    scheduledDate: r.scheduled_date, scheduledStartTime: r.scheduled_start_time, scheduledEndTime: r.scheduled_end_time,
    scheduledCourtName: r.courts?.name ?? null,
    coachId: r.schedule_assignments?.coach_id ?? null,
    originalDurationMinutes: r.schedule_assignments?.start_time && r.schedule_assignments?.end_time
      ? timeToMinutes(r.schedule_assignments.end_time) - timeToMinutes(r.schedule_assignments.start_time)
      : null,
    scheduleAssignmentId: r.original_schedule_assignment_id ?? null,
    groupTierId: null,
  }));
  const groupCredits: MakeupCredit[] = (groupRows ?? []).map((r: any) => ({
    id: r.id, kind: 'group' as const, playerId: r.player_id, playerName: '',
    label: r.group_tiers?.name ?? 'Group lesson',
    missedDate: r.missed_date, status: r.status,
    scheduledDate: r.scheduled_date, scheduledStartTime: r.scheduled_start_time, scheduledEndTime: r.scheduled_end_time,
    scheduledCourtName: r.courts?.name ?? null,
    coachId: null,
    originalDurationMinutes: ASSUMED_TIER_DURATION_MINUTES,
    scheduleAssignmentId: null,
    groupTierId: r.group_tier_id ?? null,
  }));

  return sortMakeupCredits([...privateCredits, ...groupCredits]);
}

export async function scheduleMakeup(opts: {
  id: string; kind: 'private' | 'group'; playerId: string; label: string;
  date: string; startTime: string; endTime: string; courtId: string | null;
}): Promise<{ ok: boolean }> {
  const table = opts.kind === 'private' ? 'makeup_lesson_credits' : 'group_makeup_credits';
  const { error } = await supabase.from(table).update({
    status: 'scheduled', scheduled_date: opts.date, scheduled_start_time: opts.startTime,
    scheduled_end_time: opts.endTime, scheduled_court_id: opts.courtId,
  }).eq('id', opts.id);
  if (error) return { ok: false };
  await notifyMakeupAvailable(opts.playerId, `${opts.label} — scheduled for ${formatDateLong(opts.date)} at ${formatTime12h(opts.startTime)}`);
  return { ok: true };
}

export async function markMakeupDone(id: string, kind: 'private' | 'group'): Promise<{ ok: boolean }> {
  const table = kind === 'private' ? 'makeup_lesson_credits' : 'group_makeup_credits';
  const { error } = await supabase.from(table).update({ status: 'done' }).eq('id', id);
  return { ok: !error };
}
