import { supabase } from './supabase';
import { timesOverlap, firstName, localDateStr } from './scheduling';
import { notifyTournamentApproved, notifyMatchShared } from './notifications';

export type ChildClub = { clubId: string; clubName: string };
export type ProgressStats = { totalSessions: number; streak: number };
export type RecentLog = { id: string; category: string; created_at: string };
export type SharedJournalEntry = {
  id: string; entry_date: string; entry_type: string; free_text: string | null; created_at: string;
  // First names of the coach(es) this entry is shared with — lets a parent
  // see whose lesson a "Lesson" entry was about instead of a bare date.
  coachFirstNames: string[];
};
export type UpcomingTournament = {
  id: string; name: string; start_date: string; end_date: string;
  registration_deadline: string | null; registration_link: string | null;
};
export type ChildLesson = { id: string; day_of_week: number; start_time: string; end_time: string; coach_id: string; coach_name: string; court_name: string | null };
export type ChildGroupLesson = { id: string; groupTierId: string; name: string; day_of_week: number; start_time: string; end_time: string; coach_name: string | null };
export type ChildPayment = {
  id: string; related_to: string; label: string; payment_status: string;
  payment_method: string | null; reported_by_parent_id: string | null; created_at: string;
};
export type ClubCoach = { id: string; full_name: string };
export type ScheduleRequestRow = {
  id: string; coach_id: string; coach_name: string; day_of_week: number; start_time: string; end_time: string;
  status: 'pending' | 'approved' | 'rejected'; created_at: string;
};

// ── Club dependency ---------------------------------------------------------

export async function getChildClubs(childId: string): Promise<ChildClub[]> {
  const { data } = await supabase
    .from('club_members')
    .select('club_id, clubs(name)')
    .eq('player_id', childId)
    .eq('status', 'active');
  return (data ?? []).map((r: any) => ({ clubId: r.club_id, clubName: r.clubs?.name ?? 'Club' }));
}

// ── Progress + activity -----------------------------------------------------

export async function getChildProgress(childId: string): Promise<{ stats: ProgressStats; recentLogs: RecentLog[] }> {
  const { data } = await supabase
    .from('session_logs')
    .select('id, category, created_at')
    .eq('user_id', childId)
    .order('created_at', { ascending: false });

  const logs = data ?? [];
  const totalSessions = new Set(logs.map((s: any) => `${new Date(s.created_at).toDateString()}_${s.category}`)).size;

  const dates = [...new Set(logs.map((s: any) => new Date(s.created_at).toDateString()))];
  let streak = 0;
  for (let i = 0; i < 365; i++) {
    const d = new Date(); d.setDate(d.getDate() - i);
    if (dates.includes(d.toDateString())) streak++;
    else if (i === 0) continue;
    else break;
  }

  return {
    stats: { totalSessions, streak },
    recentLogs: logs.slice(0, 10).map((l: any) => ({ id: l.id, category: l.category, created_at: l.created_at })),
  };
}

export async function getSharedJournalEntries(childId: string): Promise<SharedJournalEntry[]> {
  const { data } = await supabase
    .from('journal_entries')
    .select('id, entry_date, entry_type, free_text, created_at, shared_with_coach_ids')
    .eq('user_id', childId)
    .eq('shared_with_parent', true)
    // Drafts (is_draft = true, from JournalSheet's autosave) and entries the
    // player never actually wrote anything in shouldn't show up here at all
    // — mirrors journal-history.tsx's own is_draft filter for the player's
    // own list, which this query was missing.
    .eq('is_draft', false)
    .not('free_text', 'is', null)
    .order('entry_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(20);
  const rows = data ?? [];

  const allCoachIds = Array.from(new Set(rows.flatMap((r: any) => r.shared_with_coach_ids ?? [])));
  const nameById = new Map<string, string>();
  if (allCoachIds.length > 0) {
    const { data: coaches } = await supabase.from('profiles').select('id, full_name').in('id', allCoachIds);
    (coaches ?? []).forEach((c: any) => nameById.set(c.id, firstName(c.full_name)));
  }

  return rows.map((r: any) => ({
    id: r.id, entry_date: r.entry_date, entry_type: r.entry_type, free_text: r.free_text, created_at: r.created_at,
    coachFirstNames: (r.shared_with_coach_ids ?? []).map((id: string) => nameById.get(id)).filter(Boolean) as string[],
  }));
}

// Marks a date range as a tournament block for a player — self-service by
// the player or their parent (see 20260727120000_tournament_self_service.sql
// for the RLS that makes this possible). Applies instantly: the existing
// generate_tournament_exceptions() trigger auto-excludes the player from
// group lessons and creates private-lesson makeup credits for that range,
// no separate club-approval step exists in this schema.
export async function createTournamentBlock(
  playerId: string, name: string, startDate: string, endDate: string,
  registrationDeadline?: string | null, registrationLink?: string | null,
): Promise<{ ok: boolean; message?: string }> {
  const { error } = await supabase.from('tournament_blocks').insert({
    player_id: playerId, name, start_date: startDate, end_date: endDate,
    registration_deadline: registrationDeadline || null, registration_link: registrationLink?.trim() || null,
  });
  if (error) return { ok: false, message: 'Could not save the tournament dates.' };
  await notifyTournamentApproved(playerId, startDate, endDate);
  return { ok: true };
}

export async function getUpcomingTournaments(childId: string): Promise<UpcomingTournament[]> {
  const { data } = await supabase
    .from('tournament_blocks')
    .select('id, name, start_date, end_date, registration_deadline, registration_link')
    .eq('player_id', childId)
    .gte('end_date', localDateStr())
    .order('start_date', { ascending: true });
  return data ?? [];
}

// Every tournament block ever marked (past included) — backs the searchable
// "By Tournament" views (both the player's Matches tab and the parent
// dashboard), unlike getUpcomingTournaments above which only ever shows
// what's still ahead.
export async function getAllTournaments(childId: string): Promise<UpcomingTournament[]> {
  const { data } = await supabase
    .from('tournament_blocks')
    .select('id, name, start_date, end_date, registration_deadline, registration_link')
    .eq('player_id', childId)
    .order('start_date', { ascending: false });
  return data ?? [];
}

export type TournamentMatchLog = {
  id: string; opponentName: string; result: string | null; matchType: string | null;
  strengthsTags: string[]; weaknessesTags: string[]; strengthsText: string | null; weaknessesText: string | null;
  loggedByParent: boolean; createdAt: string;
  // Same full richness the coach sees for a shared log (coach-player.tsx) —
  // a parent's view shouldn't be a stripped-down summary of what was
  // actually logged.
  score: string | null; nextTimeText: string | null;
  videoUrl: string | null; voiceNoteUrl: string | null; voiceNoteDurationSeconds: number | null;
  // Set when a parent added their own courtside notes onto the CHILD's own
  // log (see appendParentNotesToLog) instead of creating a second,
  // duplicate entry for the same match — kept separate from the player's
  // own strengthsText/weaknessesText so both perspectives stay attributed.
  parentStrengthsText: string | null; parentWeaknessesText: string | null;
  // Which coach(es) this log is shared with — needed so a parent replying
  // in the feedback thread notifies the right coach(es), same as the
  // player's own opponent-detail.tsx reply flow.
  sharedWithCoachIds: string[];
};

export type MatchFeedbackMessage = {
  id: string; opponentLogId: string; senderId: string; message: string;
  mediaUrl: string | null; mediaType: 'photo' | 'video' | 'audio' | null; mediaDurationSeconds: number | null;
  createdAt: string; seenAt: string | null;
};

// Matches logged for one specific tournament — used by both the player's own
// "By Tournament" view and the parent's tournament detail view. RLS decides
// what actually comes back for each caller: a player sees all of their own
// rows; a parent only sees rows shared with a coach or that they themselves
// authored (see 20260803130000_tournaments_and_match_sharing.sql).
const TOURNAMENT_MATCH_LOG_SELECT = 'id, opponent_name, result, match_type, strengths_tags, weaknesses_tags, strengths_text, weaknesses_text, logged_by_parent_id, created_at, score, next_time_text, video_url, voice_note_url, voice_note_duration_seconds, parent_strengths_text, parent_weaknesses_text, shared_with_coach_ids';

const mapMatchLog = (r: any): TournamentMatchLog => ({
  id: r.id, opponentName: r.opponent_name ?? 'Opponent', result: r.result, matchType: r.match_type,
  strengthsTags: r.strengths_tags ?? [], weaknessesTags: r.weaknesses_tags ?? [],
  strengthsText: r.strengths_text, weaknessesText: r.weaknesses_text,
  loggedByParent: !!r.logged_by_parent_id, createdAt: r.created_at,
  score: r.score, nextTimeText: r.next_time_text,
  videoUrl: r.video_url, voiceNoteUrl: r.voice_note_url, voiceNoteDurationSeconds: r.voice_note_duration_seconds,
  parentStrengthsText: r.parent_strengths_text, parentWeaknessesText: r.parent_weaknesses_text,
  sharedWithCoachIds: r.shared_with_coach_ids ?? [],
});

// The coach-feedback thread on a set of match logs — mirrors the fetch
// opponent-detail.tsx does for the player, gated the same way by RLS
// (parent access added in 20260804200000_parent_match_feedback_and_voice_notes.sql).
export async function getMatchFeedbackMessages(opponentLogIds: string[]): Promise<Record<string, MatchFeedbackMessage[]>> {
  if (!opponentLogIds.length) return {};
  const { data } = await supabase
    .from('opponent_log_messages')
    .select('id, opponent_log_id, sender_id, message, media_url, media_type, media_duration_seconds, created_at, seen_at')
    .in('opponent_log_id', opponentLogIds)
    .order('created_at', { ascending: true });
  const map: Record<string, MatchFeedbackMessage[]> = {};
  (data ?? []).forEach((r: any) => {
    const msg: MatchFeedbackMessage = {
      id: r.id, opponentLogId: r.opponent_log_id, senderId: r.sender_id, message: r.message,
      mediaUrl: r.media_url, mediaType: r.media_type, mediaDurationSeconds: r.media_duration_seconds,
      createdAt: r.created_at, seenAt: r.seen_at,
    };
    (map[r.opponent_log_id] ??= []).push(msg);
  });
  return map;
}

// A parent replying in the coach-feedback thread on their child's match log.
export async function sendParentMatchReply(opponentLogId: string, parentId: string, message: string): Promise<MatchFeedbackMessage | null> {
  const { data, error } = await supabase
    .from('opponent_log_messages')
    .insert({ opponent_log_id: opponentLogId, sender_id: parentId, message })
    .select('id, opponent_log_id, sender_id, message, media_url, media_type, media_duration_seconds, created_at, seen_at')
    .single();
  if (error || !data) return null;
  return {
    id: data.id, opponentLogId: data.opponent_log_id, senderId: data.sender_id, message: data.message,
    mediaUrl: data.media_url, mediaType: data.media_type, mediaDurationSeconds: data.media_duration_seconds,
    createdAt: data.created_at, seenAt: data.seen_at,
  };
}

export async function getChildTournamentMatches(childId: string, tournamentBlockId: string): Promise<TournamentMatchLog[]> {
  const { data } = await supabase
    .from('opponent_logs')
    .select(TOURNAMENT_MATCH_LOG_SELECT)
    .eq('player_id', childId)
    .eq('tournament_block_id', tournamentBlockId)
    .order('created_at', { ascending: false });
  return (data ?? []).map(mapMatchLog);
}

// Read-only, by-opponent counterpart to getChildTournamentMatches — kept
// separate from the player's own /opponent-detail screen deliberately, since
// that screen's "Log a match"/edit actions assume the logged-in account IS
// the player (session.user.id), which would misattribute a parent's edits
// to the parent's own (nonexistent) player profile instead of the child's.
export async function getChildOpponentMatches(childId: string, opponentId: string): Promise<TournamentMatchLog[]> {
  const { data } = await supabase
    .from('opponent_logs')
    .select(TOURNAMENT_MATCH_LOG_SELECT)
    .eq('player_id', childId)
    .eq('opponent_id', opponentId)
    .order('created_at', { ascending: false });
  return (data ?? []).map(mapMatchLog);
}

// A parent logging a match on their child's behalf — deliberately doesn't
// touch the `opponents.wins`/`losses` aggregate the player's own log-match.tsx
// updates, since the parent is very likely describing a match the child
// either already logged (or will) themselves; incrementing here too would
// double-count the child's record. It still resolves/creates the same
// `opponents` row so this groups correctly on the opponent-detail screen.
export async function logChildMatch(opts: {
  parentId: string; childId: string; opponentName: string;
  result: 'win' | 'loss' | 'unsure'; matchType: 'singles' | 'doubles';
  strengthsTags: string[]; weaknessesTags: string[]; strengthsText: string; weaknessesText: string;
  tournamentBlockId: string | null; sharedWithCoachIds: string[];
}): Promise<{ ok: boolean; message?: string }> {
  const name = opts.opponentName.trim();
  if (!name) return { ok: false, message: 'Enter who they played.' };

  let opponentId: string | null = null;
  const { data: existing } = await supabase
    .from('opponents').select('id').eq('player_id', opts.childId).ilike('name', name).maybeSingle();
  if (existing) {
    opponentId = existing.id;
  } else {
    const { data: created, error } = await supabase
      .from('opponents').insert({ player_id: opts.childId, name }).select('id').single();
    if (error || !created) return { ok: false, message: 'Could not save the opponent. Please try again.' };
    opponentId = created.id;
  }

  const { error: logError } = await supabase.from('opponent_logs').insert({
    opponent_id: opponentId, opponent_name: name, player_id: opts.childId, logged_by_parent_id: opts.parentId,
    result: opts.result, match_type: opts.matchType,
    strengths_tags: opts.strengthsTags, weaknesses_tags: opts.weaknessesTags,
    strengths_text: opts.strengthsText.trim() || null, weaknesses_text: opts.weaknessesText.trim() || null,
    tournament_block_id: opts.tournamentBlockId,
    shared_with_coach: opts.sharedWithCoachIds.length > 0, shared_with_coach_ids: opts.sharedWithCoachIds,
  });
  if (logError) return { ok: false, message: 'Could not save this log. Please try again.' };

  if (opts.sharedWithCoachIds.length > 0) {
    const { data: childProfile } = await supabase.from('profiles').select('full_name').eq('id', opts.childId).maybeSingle();
    for (const coachId of opts.sharedWithCoachIds) {
      await notifyMatchShared(coachId, childProfile?.full_name ?? 'Your player', name);
    }
  }
  return { ok: true };
}

// A parent's match log is meant to be a genuinely separate, courtside
// perspective (see logChildMatch above) — but when the child has ALREADY
// logged the same real match, two independently-shared entries just read as
// two different matches to the coach. This surfaces that case so
// log-match-parent.tsx can offer "add your notes to that log" instead of
// creating a duplicate. Recency window: a parent typically logs within a
// day or two of watching; two weeks is generous enough to catch a late
// entry without matching an unrelated rematch against the same opponent
// weeks later.
const RECENT_LOG_WINDOW_DAYS = 14;

export type RecentChildLog = { id: string; createdAt: string; sharedWithCoachIds: string[] };

export async function getRecentChildLogForOpponent(childId: string, opponentId: string): Promise<RecentChildLog | null> {
  const since = new Date(Date.now() - RECENT_LOG_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const { data } = await supabase
    .from('opponent_logs')
    .select('id, created_at, shared_with_coach_ids')
    .eq('player_id', childId)
    .eq('opponent_id', opponentId)
    .is('logged_by_parent_id', null)
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  return { id: data.id, createdAt: data.created_at, sharedWithCoachIds: data.shared_with_coach_ids ?? [] };
}

// Appends a parent's own notes onto the CHILD's existing log for this match
// (see getRecentChildLogForOpponent) instead of creating a second row — the
// coach ends up with exactly one entry per real match, not two. Routed
// through the append_parent_match_notes() RPC rather than a client-side
// update, since a parent should only ever be able to touch these two note
// columns and the share list — never the player's own result/score/tags.
export async function appendParentNotesToLog(opts: {
  logId: string; childId: string; opponentName: string;
  strengthsText: string; weaknessesText: string;
  previouslySharedWithCoachIds: string[]; sharedWithCoachIds: string[];
}): Promise<{ ok: boolean; message?: string }> {
  const { error } = await supabase.rpc('append_parent_match_notes', {
    p_log_id: opts.logId,
    p_strengths_text: opts.strengthsText,
    p_weaknesses_text: opts.weaknessesText,
    p_share_with_coach_ids: opts.sharedWithCoachIds,
  });
  if (error) return { ok: false, message: 'Could not add your notes. Please try again.' };

  const newlyShared = opts.sharedWithCoachIds.filter((id) => !opts.previouslySharedWithCoachIds.includes(id));
  if (newlyShared.length > 0) {
    const { data: childProfile } = await supabase.from('profiles').select('full_name').eq('id', opts.childId).maybeSingle();
    for (const coachId of newlyShared) {
      await notifyMatchShared(coachId, childProfile?.full_name ?? 'Your player', opts.opponentName);
    }
  }
  return { ok: true };
}

// ── Schedule (read-only) -----------------------------------------------------

export async function getChildLessons(childId: string, clubId: string): Promise<ChildLesson[]> {
  const { data } = await supabase
    .from('schedule_assignments')
    .select('id, day_of_week, start_time, end_time, coach_id, courts(name)')
    .eq('player_id', childId)
    .eq('club_id', clubId)
    .order('day_of_week', { ascending: true });
  const rows = data ?? [];

  // schedule_assignments has two FKs into profiles (player_id and coach_id),
  // which makes the embedded `profiles!schedule_assignments_coach_id_fkey(...)`
  // syntax the kind of ambiguous-relationship shape that's bitten this project
  // before (see the pending-request ambiguous-embed bug) — a separate lookup
  // by id sidesteps it entirely instead of trusting the embed resolves right.
  const coachIds = [...new Set(rows.map((l: any) => l.coach_id).filter(Boolean))];
  const nameById: Record<string, string> = {};
  if (coachIds.length) {
    const { data: coachRows } = await supabase.from('profiles').select('id, full_name').in('id', coachIds);
    (coachRows ?? []).forEach((c: any) => { nameById[c.id] = c.full_name ?? 'Coach'; });
  }

  return rows.map((l: any) => ({
    id: l.id, day_of_week: l.day_of_week, start_time: l.start_time, end_time: l.end_time, coach_id: l.coach_id,
    coach_name: nameById[l.coach_id] ?? 'Coach', court_name: l.courts?.name ?? null,
  }));
}

export async function getChildGroupLessons(childId: string, clubId: string): Promise<ChildGroupLesson[]> {
  const { data: assignments } = await supabase
    .from('player_tier_assignments')
    .select('group_tier_id, group_tiers(id, name, club_id)')
    .eq('player_id', childId);

  const tierIds = (assignments ?? [])
    .filter((a: any) => a.group_tiers?.club_id === clubId)
    .map((a: any) => a.group_tier_id);
  if (tierIds.length === 0) return [];

  const [{ data: slotRows }, { data: coachRows }] = await Promise.all([
    supabase.from('lesson_time_slots').select('id, group_tier_id, day_of_week, start_time, end_time').in('group_tier_id', tierIds),
    supabase.from('lesson_coaches').select('group_tier_id, role, profiles(full_name)').in('group_tier_id', tierIds).order('role', { ascending: true }),
  ]);

  const nameById: Record<string, string> = {};
  (assignments ?? []).forEach((a: any) => { nameById[a.group_tier_id] = a.group_tiers?.name ?? 'Group Lesson'; });
  // 'main' sorts before 'assistant' alphabetically, so the main coach leads
  // the joined list — but every coach teaching the lesson is shown, not just
  // the main one.
  const coachById: Record<string, string[]> = {};
  (coachRows ?? []).forEach((c: any) => {
    (coachById[c.group_tier_id] ??= []).push(c.profiles?.full_name ?? 'Coach');
  });

  return (slotRows ?? []).map((s: any) => ({
    id: s.id, groupTierId: s.group_tier_id, name: nameById[s.group_tier_id] ?? 'Group Lesson',
    day_of_week: s.day_of_week, start_time: s.start_time, end_time: s.end_time,
    coach_name: coachById[s.group_tier_id]?.join(', ') ?? null,
  }));
}

// ── Payments ------------------------------------------------------------------

const METHOD_LABELS: Record<string, string> = { cash: 'Cash', card: 'Card', e_transfer: 'E-transfer', other: 'Other' };

export async function getChildPayments(childId: string, clubId: string): Promise<ChildPayment[]> {
  const { data } = await supabase
    .from('lesson_payments')
    .select('id, related_to, note, payment_status, payment_method, reported_by_parent_id, created_at, schedule_assignments(coach:profiles!schedule_assignments_coach_id_fkey(full_name)), player_tier_assignments(group_tiers(name))')
    .eq('player_id', childId)
    .eq('club_id', clubId)
    .order('created_at', { ascending: false });

  return (data ?? []).map((p: any) => ({
    id: p.id,
    related_to: p.related_to,
    label: p.related_to === 'private_lesson'
      ? `Private lesson with ${p.schedule_assignments?.coach?.full_name ?? 'coach'}`
      : p.related_to === 'group_tier'
      ? (p.player_tier_assignments?.group_tiers?.name ?? 'Group lesson')
      : (p.note || 'Payment'),
    payment_status: p.payment_status,
    payment_method: p.payment_method ? (METHOD_LABELS[p.payment_method] ?? p.payment_method) : null,
    reported_by_parent_id: p.reported_by_parent_id,
    created_at: p.created_at,
  }));
}

// A parent just describes what the payment is for in their own words —
// no picking from a list of matched lessons/tiers (that required the child
// to already have a schedule_assignment/player_tier_assignment row, which
// isn't always true, and added a step for something simple).
export async function submitPaymentReport(opts: {
  clubId: string; childId: string; parentId: string; note: string; method: 'cash' | 'card' | 'e_transfer' | 'other';
}): Promise<{ ok: boolean; message?: string }> {
  const { error } = await supabase.from('lesson_payments').insert({
    club_id: opts.clubId,
    player_id: opts.childId,
    related_to: 'other',
    note: opts.note.trim(),
    payment_method: opts.method,
    payment_status: 'pending',
    reported_by_parent_id: opts.parentId,
  });
  if (error) return { ok: false, message: 'Could not submit the payment report.' };
  return { ok: true };
}

// ── Scheduling requests -------------------------------------------------------

export async function getClubCoaches(clubId: string): Promise<ClubCoach[]> {
  const { data } = await supabase
    .from('club_coaches')
    .select('coach_id, profiles(full_name)')
    .eq('club_id', clubId)
    .eq('status', 'active');
  return (data ?? []).map((c: any) => ({ id: c.coach_id, full_name: c.profiles?.full_name ?? 'Coach' }));
}

// The gaps *outside* a coach's own working hours for one day — turned into
// ordinary busy windows so the existing overlap-based isSlotOpen() doesn't
// need a second code path for "outside the shift" vs. "something's booked".
// Assumes the shifts don't overlap each other (a club adds at most a
// morning + afternoon split shift, never overlapping ranges).
const complementOfShifts = (shifts: { start: string; end: string }[]): { start: string; end: string }[] => {
  const sorted = [...shifts].sort((a, b) => a.start.localeCompare(b.start));
  const gaps: { start: string; end: string }[] = [];
  let cursor = '00:00';
  for (const s of sorted) {
    if (s.start > cursor) gaps.push({ start: cursor, end: s.start });
    if (s.end > cursor) cursor = s.end;
  }
  if (cursor < '23:59') gaps.push({ start: cursor, end: '23:59' });
  return gaps;
};

// Busy windows for a coach on a given day — private lessons + any group
// lesson slot they main/assist-coach, their recurring break/day-off, and
// (if the club has bothered to define any) time outside their working
// hours — used to compute open slots. A coach with no coach_shifts rows at
// all stays fully unrestricted (today's behavior); only once a club adds at
// least one shift for them does "no shift on this weekday" start meaning
// "not working that day" rather than "wide open".
export async function getCoachBusyWindows(clubId: string, coachId: string, dayOfWeek: number): Promise<{ start: string; end: string }[]> {
  const [{ data: lessonRows }, { data: coachTierRows }, { data: offRows }, { data: shiftRows }] = await Promise.all([
    supabase.from('schedule_assignments').select('start_time, end_time').eq('club_id', clubId).eq('coach_id', coachId).eq('day_of_week', dayOfWeek),
    supabase.from('lesson_coaches').select('group_tier_id, group_tiers!inner(club_id)').eq('coach_id', coachId).eq('group_tiers.club_id', clubId),
    supabase.from('coach_time_off').select('kind, start_time, end_time').eq('club_id', clubId).eq('coach_id', coachId).eq('day_of_week', dayOfWeek).in('kind', ['recurring_break', 'recurring_day_off']),
    supabase.from('coach_shifts').select('day_of_week, start_time, end_time').eq('club_id', clubId).eq('coach_id', coachId),
  ]);

  const tierIds = (coachTierRows ?? []).map((r: any) => r.group_tier_id);
  let slotRows: any[] = [];
  if (tierIds.length) {
    const { data } = await supabase.from('lesson_time_slots').select('start_time, end_time').in('group_tier_id', tierIds).eq('day_of_week', dayOfWeek);
    slotRows = data ?? [];
  }

  const { data: pendingRequests } = await supabase
    .from('schedule_requests')
    .select('start_time, end_time')
    .eq('club_id', clubId)
    .eq('coach_id', coachId)
    .eq('day_of_week', dayOfWeek)
    .eq('status', 'pending');

  const busy: { start: string; end: string }[] = [
    ...(lessonRows ?? []).map((l: any) => ({ start: l.start_time, end: l.end_time })),
    ...slotRows.map((s: any) => ({ start: s.start_time, end: s.end_time })),
    ...(pendingRequests ?? []).map((r: any) => ({ start: r.start_time, end: r.end_time })),
    ...(offRows ?? []).filter((r: any) => r.kind === 'recurring_break').map((r: any) => ({ start: r.start_time, end: r.end_time })),
  ];

  const isRecurringDayOff = (offRows ?? []).some((r: any) => r.kind === 'recurring_day_off');
  if (isRecurringDayOff) {
    busy.push({ start: '00:00', end: '23:59' });
  } else if ((shiftRows ?? []).length > 0) {
    const todaysShifts = (shiftRows ?? []).filter((s: any) => s.day_of_week === dayOfWeek).map((s: any) => ({ start: s.start_time, end: s.end_time }));
    if (todaysShifts.length === 0) busy.push({ start: '00:00', end: '23:59' });
    else busy.push(...complementOfShifts(todaysShifts));
  }

  return busy;
}

export function isSlotOpen(busyWindows: { start: string; end: string }[], start: string, end: string): boolean {
  return !busyWindows.some((w) => timesOverlap(start, end, w.start, w.end));
}

export type ClubCourtAvailability = { courtIds: string[]; busyByCourtId: Record<string, { start: string; end: string }[]> };

// Every court's bookings club-wide on a given day (private lessons with a
// court set + every group lesson time slot's assigned courts) — a coach
// being free isn't enough to actually book the lesson if every court is
// already taken at that hour by someone else's lesson.
export async function getClubCourtAvailability(clubId: string, dayOfWeek: number): Promise<ClubCourtAvailability> {
  const [{ data: courts }, { data: lessonRows }, { data: slotRows }] = await Promise.all([
    supabase.from('courts').select('id').eq('club_id', clubId),
    supabase.from('schedule_assignments').select('court_id, start_time, end_time').eq('club_id', clubId).eq('day_of_week', dayOfWeek).not('court_id', 'is', null),
    supabase.from('lesson_time_slots').select('start_time, end_time, group_tiers!inner(club_id), lesson_time_slot_courts(court_id)').eq('day_of_week', dayOfWeek).eq('group_tiers.club_id', clubId),
  ]);

  const busyByCourtId: Record<string, { start: string; end: string }[]> = {};
  const add = (courtId: string | null | undefined, start: string, end: string) => {
    if (!courtId) return;
    (busyByCourtId[courtId] ??= []).push({ start, end });
  };
  (lessonRows ?? []).forEach((l: any) => add(l.court_id, l.start_time, l.end_time));
  (slotRows ?? []).forEach((s: any) => (s.lesson_time_slot_courts ?? []).forEach((c: any) => add(c.court_id, s.start_time, s.end_time)));

  return { courtIds: (courts ?? []).map((c: any) => c.id), busyByCourtId };
}

// A club that hasn't configured any courts yet isn't gated on court
// availability at all — this is an added check on top of coach-availability,
// not a replacement, and shouldn't block every request just because courts
// were never set up.
export function isAnyCourtOpen(availability: ClubCourtAvailability, start: string, end: string): boolean {
  if (availability.courtIds.length === 0) return true;
  return availability.courtIds.some((id) => isSlotOpen(availability.busyByCourtId[id] ?? [], start, end));
}

export async function submitScheduleRequest(opts: {
  parentId: string; childId: string; coachId: string; clubId: string; dayOfWeek: number; start: string; end: string;
  replacesAssignmentId?: string;
}): Promise<{ ok: boolean; message?: string }> {
  const [busy, courts] = await Promise.all([
    getCoachBusyWindows(opts.clubId, opts.coachId, opts.dayOfWeek),
    getClubCourtAvailability(opts.clubId, opts.dayOfWeek),
  ]);
  if (!isSlotOpen(busy, opts.start, opts.end)) {
    return { ok: false, message: 'That slot was just taken — please pick another.' };
  }
  if (!isAnyCourtOpen(courts, opts.start, opts.end)) {
    return { ok: false, message: 'No court is free at that time — please pick another slot.' };
  }
  const { error } = await supabase.from('schedule_requests').insert({
    parent_id: opts.parentId,
    child_id: opts.childId,
    coach_id: opts.coachId,
    club_id: opts.clubId,
    day_of_week: opts.dayOfWeek,
    start_time: opts.start,
    end_time: opts.end,
    replaces_schedule_assignment_id: opts.replacesAssignmentId ?? null,
  });
  if (error) return { ok: false, message: 'Could not submit the request.' };
  return { ok: true };
}

// ── Waitlist (player self-service) -------------------------------------------

export type MyWaitlistEntry = { id: string; coachId: string; coachName: string; priority: number; status: string; createdAt: string; preferredNote: string | null };

// `preferredNote` is a free-text hint ("Monday afternoons") rather than a
// rigid day/time picker — the waitlist itself has no day/time at all (it's
// "get in line for whenever this coach opens up"), so this is purely a
// courtesy for whoever on the club side is deciding who to offer a slot to.
export async function joinWaitlist(clubId: string, playerId: string, coachId: string, preferredNote?: string): Promise<{ ok: boolean; message?: string }> {
  const { error } = await supabase.from('waitlist_entries').insert({
    club_id: clubId, coach_id: coachId, player_id: playerId,
    preferred_note: preferredNote?.trim() || null,
  });
  if (error) return { ok: false, message: 'Could not join the waitlist — please try again.' };
  return { ok: true };
}

export async function getMyWaitlistEntries(playerId: string): Promise<MyWaitlistEntry[]> {
  const { data } = await supabase
    .from('waitlist_entries')
    .select('id, coach_id, priority, status, created_at, preferred_note, profiles!waitlist_entries_coach_id_fkey(full_name)')
    .eq('player_id', playerId)
    .order('created_at', { ascending: false });
  return (data ?? []).map((r: any) => ({
    id: r.id, coachId: r.coach_id, coachName: r.profiles?.full_name ?? 'Coach',
    priority: r.priority, status: r.status, createdAt: r.created_at, preferredNote: r.preferred_note ?? null,
  }));
}

export async function leaveWaitlist(entryId: string): Promise<{ ok: boolean }> {
  const { error } = await supabase.from('waitlist_entries').delete().eq('id', entryId);
  return { ok: !error };
}

// ── Coach-assigned workouts (read-only summary — no instructions, proof, or
// the coach<->player message thread, unlike the player's own Coach Section) --

export type ChildAssignment = { id: string; title: string; category: string; coachName: string; createdAt: string };

export async function getChildAssignments(childId: string): Promise<ChildAssignment[]> {
  const { data: asgs } = await supabase
    .from('assignments')
    .select('id, title, category, coach_id, created_at')
    .eq('player_id', childId)
    .order('created_at', { ascending: false })
    .limit(10);
  if (!asgs || asgs.length === 0) return [];

  // Manual profile lookup rather than an embedded FK join — `assignments`
  // predates this codebase's migration history, so its FK constraint name
  // isn't known; coach-section.tsx uses this same two-step pattern.
  const coachIds = [...new Set(asgs.map((a: any) => a.coach_id))];
  const { data: coaches } = await supabase.from('profiles').select('id, full_name').in('id', coachIds);
  const nameById = new Map((coaches ?? []).map((c: any) => [c.id, c.full_name ?? 'Coach']));

  return asgs.map((a: any) => ({
    id: a.id, title: a.title, category: a.category,
    coachName: nameById.get(a.coach_id) ?? 'Coach', createdAt: a.created_at,
  }));
}

export async function getMyScheduleRequests(parentId: string, childId: string, clubId: string): Promise<ScheduleRequestRow[]> {
  const { data } = await supabase
    .from('schedule_requests')
    .select('id, coach_id, day_of_week, start_time, end_time, status, created_at, profiles!schedule_requests_coach_id_fkey(full_name)')
    .eq('parent_id', parentId)
    .eq('child_id', childId)
    .eq('club_id', clubId)
    .order('created_at', { ascending: false });
  return (data ?? []).map((r: any) => ({
    id: r.id, coach_id: r.coach_id, coach_name: r.profiles?.full_name ?? 'Coach',
    day_of_week: r.day_of_week, start_time: r.start_time, end_time: r.end_time,
    status: r.status, created_at: r.created_at,
  }));
}
