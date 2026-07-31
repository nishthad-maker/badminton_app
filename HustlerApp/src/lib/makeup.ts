import { supabase } from './supabase';
import { formatTime12h } from './scheduling';
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
};

export type ClubTournamentBlock = { id: string; playerId: string; playerName: string; startDate: string; endDate: string };

// Every currently-active or upcoming tournament block for the club's own
// roster — answers "who's away right now" directly, rather than the club
// having to infer it from scattered missed-lesson makeup credits.
export async function getClubTournamentBlocks(clubId: string): Promise<ClubTournamentBlock[]> {
  const { data: members } = await supabase
    .from('club_members').select('player_id, profiles(full_name)').eq('club_id', clubId).eq('status', 'active');
  const playerIds = (members ?? []).map((m: any) => m.player_id);
  if (playerIds.length === 0) return [];
  const nameById = new Map((members ?? []).map((m: any) => [m.player_id, m.profiles?.full_name ?? 'Player']));

  const { data: blocks } = await supabase
    .from('tournament_blocks')
    .select('id, player_id, start_date, end_date')
    .in('player_id', playerIds)
    .gte('end_date', new Date().toISOString().split('T')[0])
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
};

type SchedulingContext = {
  original: { coachId: string; courtId: string | null; startTime: string; endTime: string; missedDate: string };
  coaches: { id: string; fullName: string }[];
  courts: { id: string; name: string }[];
  privateLessons: { coachId: string; courtId: string | null; dayOfWeek: number; startTime: string; endTime: string }[];
  groupSlots: { coachIds: string[]; courtIds: string[]; dayOfWeek: number; startTime: string; endTime: string; isRecurring: boolean; oneTimeDate: string | null }[];
  oneOffBookings: { coachId: string; courtId: string | null; date: string; startTime: string; endTime: string }[];
  tournamentBlocks: { startDate: string; endDate: string }[];
};

const DAY_WINDOW_START_MIN = 8 * 60;
const DAY_WINDOW_END_MIN = 20 * 60;
// Checked in priority order per candidate date: exact original time first
// ("best fit"), then progressively further out, before moving to the next date.
const OFFSET_MINUTES = [0, 60, -60, 120, -120];
// How many days out from the missed lesson to look for an opening.
const SEARCH_WINDOW_DAYS = 21;

const timeToMinutes = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
const minutesToTime = (min: number) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}:00`;
const overlaps = (aStart: number, aEnd: number, bStart: number, bEnd: number) => aStart < bEnd && bStart < aEnd;

// Suggests up to 3 one-off makeup slots — same coach as the missed lesson,
// times near the original, checked against every other recurring/one-off
// booking that coach or a club court already has. Only offers a different
// coach if the original one has nothing open across the whole search window.
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
    return ctx.oneOffBookings.some((b) => b.coachId === coachId && b.date === dateStr && overlaps(startMin, endMin, timeToMinutes(b.startTime), timeToMinutes(b.endTime)));
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

  const findCourt = (dateStr: string, dow: number, startMin: number, endMin: number, preferredCourtId: string | null) => {
    const ordered = [...ctx.courts].sort((a, b) => (a.id === preferredCourtId ? -1 : b.id === preferredCourtId ? 1 : 0));
    return ordered.find((c) => !isCourtBusy(c.id, dateStr, dow, startMin, endMin)) ?? null;
  };

  const suggestions: MakeupSuggestion[] = [];

  const searchCoach = (coachId: string, coachName: string, isDifferentCoach: boolean) => {
    for (let dayOffset = 1; dayOffset <= SEARCH_WINDOW_DAYS && suggestions.length < 3; dayOffset++) {
      const d = new Date(missed);
      d.setDate(d.getDate() + dayOffset);
      const dateStr = d.toISOString().split('T')[0];
      if (isPlayerAway(dateStr)) continue;
      const dow = d.getDay();

      for (const offset of OFFSET_MINUTES) {
        const startMin = originalStartMin + offset;
        const endMin = startMin + durationMin;
        if (startMin < DAY_WINDOW_START_MIN || endMin > DAY_WINDOW_END_MIN) continue;
        if (isCoachBusy(coachId, dateStr, dow, startMin, endMin)) continue;
        const court = findCourt(dateStr, dow, startMin, endMin, isDifferentCoach ? null : ctx.original.courtId);
        if (!court) continue;
        suggestions.push({
          date: dateStr, startTime: minutesToTime(startMin), endTime: minutesToTime(endMin),
          courtId: court.id, courtName: court.name, coachId, coachName,
          isBestFit: suggestions.length === 0, isDifferentCoach,
        });
        break; // one slot per date is plenty
      }
    }
  };

  const originalCoach = ctx.coaches.find((c) => c.id === ctx.original.coachId);
  searchCoach(ctx.original.coachId, originalCoach?.fullName ?? 'Coach', false);

  if (suggestions.length === 0) {
    for (const coach of ctx.coaches) {
      if (coach.id === ctx.original.coachId) continue;
      searchCoach(coach.id, coach.fullName, true);
      if (suggestions.length > 0) break;
    }
  }

  return suggestions;
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
      .select('id, player_id, missed_date, status, scheduled_date, scheduled_start_time, scheduled_end_time, courts:scheduled_court_id(name), profiles:player_id(full_name), schedule_assignments:original_schedule_assignment_id!inner(club_id, coach_id, coach:profiles!schedule_assignments_coach_id_fkey(full_name))')
      .eq('schedule_assignments.club_id', clubId),
    supabase
      .from('group_makeup_credits')
      .select('id, player_id, missed_date, status, scheduled_date, scheduled_start_time, scheduled_end_time, courts:scheduled_court_id(name), profiles:player_id(full_name), group_tiers:group_tier_id!inner(club_id, name)')
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
    }));

  const groupCredits: MakeupCredit[] = (groupRows ?? []).map((r: any) => ({
    id: r.id, kind: 'group' as const, playerId: r.player_id, playerName: r.profiles?.full_name ?? 'Player',
    label: r.group_tiers?.name ?? 'Group lesson',
    missedDate: r.missed_date, status: r.status,
    scheduledDate: r.scheduled_date, scheduledStartTime: r.scheduled_start_time, scheduledEndTime: r.scheduled_end_time,
    scheduledCourtName: r.courts?.name ?? null,
    coachId: null,
  }));

  return [...privateCredits, ...groupCredits].sort((a, b) => a.missedDate < b.missedDate ? 1 : -1);
}

export async function getPlayerMakeupCredits(playerId: string): Promise<MakeupCredit[]> {
  const [{ data: privateRows }, { data: groupRows }] = await Promise.all([
    supabase
      .from('makeup_lesson_credits')
      .select('id, player_id, missed_date, status, scheduled_date, scheduled_start_time, scheduled_end_time, courts:scheduled_court_id(name), schedule_assignments:original_schedule_assignment_id(coach_id, coach:profiles!schedule_assignments_coach_id_fkey(full_name))')
      .eq('player_id', playerId),
    supabase
      .from('group_makeup_credits')
      .select('id, player_id, missed_date, status, scheduled_date, scheduled_start_time, scheduled_end_time, courts:scheduled_court_id(name), group_tiers:group_tier_id(name)')
      .eq('player_id', playerId),
  ]);

  const privateCredits: MakeupCredit[] = (privateRows ?? []).map((r: any) => ({
    id: r.id, kind: 'private' as const, playerId: r.player_id, playerName: '',
    label: `Private lesson with ${r.schedule_assignments?.coach?.full_name ?? 'coach'}`,
    missedDate: r.missed_date, status: r.status,
    scheduledDate: r.scheduled_date, scheduledStartTime: r.scheduled_start_time, scheduledEndTime: r.scheduled_end_time,
    scheduledCourtName: r.courts?.name ?? null,
    coachId: r.schedule_assignments?.coach_id ?? null,
  }));
  const groupCredits: MakeupCredit[] = (groupRows ?? []).map((r: any) => ({
    id: r.id, kind: 'group' as const, playerId: r.player_id, playerName: '',
    label: r.group_tiers?.name ?? 'Group lesson',
    missedDate: r.missed_date, status: r.status,
    scheduledDate: r.scheduled_date, scheduledStartTime: r.scheduled_start_time, scheduledEndTime: r.scheduled_end_time,
    scheduledCourtName: r.courts?.name ?? null,
    coachId: null,
  }));

  return [...privateCredits, ...groupCredits].sort((a, b) => a.missedDate < b.missedDate ? 1 : -1);
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
  await notifyMakeupAvailable(opts.playerId, `${opts.label} — scheduled for ${opts.date} at ${formatTime12h(opts.startTime)}`);
  return { ok: true };
}

export async function markMakeupDone(id: string, kind: 'private' | 'group'): Promise<{ ok: boolean }> {
  const table = kind === 'private' ? 'makeup_lesson_credits' : 'group_makeup_credits';
  const { error } = await supabase.from(table).update({ status: 'done' }).eq('id', id);
  return { ok: !error };
}
