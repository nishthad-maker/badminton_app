import { supabase } from './supabase';
import { timesOverlap } from './scheduling';
import { notifyTournamentApproved } from './notifications';

export type ChildClub = { clubId: string; clubName: string };
export type ProgressStats = { totalSessions: number; streak: number };
export type RecentLog = { id: string; category: string; created_at: string };
export type SharedJournalEntry = { id: string; entry_date: string; entry_type: string; free_text: string | null; created_at: string };
export type UpcomingTournament = { id: string; start_date: string; end_date: string };
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
    .select('id, entry_date, entry_type, free_text, created_at')
    .eq('user_id', childId)
    .eq('shared_with_parent', true)
    .order('entry_date', { ascending: false })
    .limit(20);
  return data ?? [];
}

// Marks a date range as a tournament block for a player — self-service by
// the player or their parent (see 20260727120000_tournament_self_service.sql
// for the RLS that makes this possible). Applies instantly: the existing
// generate_tournament_exceptions() trigger auto-excludes the player from
// group lessons and creates private-lesson makeup credits for that range,
// no separate club-approval step exists in this schema.
export async function createTournamentBlock(playerId: string, startDate: string, endDate: string): Promise<{ ok: boolean; message?: string }> {
  const { error } = await supabase.from('tournament_blocks').insert({ player_id: playerId, start_date: startDate, end_date: endDate });
  if (error) return { ok: false, message: 'Could not save the tournament dates.' };
  await notifyTournamentApproved(playerId, startDate, endDate);
  return { ok: true };
}

export async function getUpcomingTournaments(childId: string): Promise<UpcomingTournament[]> {
  const { data } = await supabase
    .from('tournament_blocks')
    .select('id, start_date, end_date')
    .eq('player_id', childId)
    .gte('end_date', new Date().toISOString().split('T')[0])
    .order('start_date', { ascending: true });
  return data ?? [];
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
    .select('id, related_to, payment_status, payment_method, reported_by_parent_id, created_at, schedule_assignments(coach:profiles!schedule_assignments_coach_id_fkey(full_name)), player_tier_assignments(group_tiers(name))')
    .eq('player_id', childId)
    .eq('club_id', clubId)
    .order('created_at', { ascending: false });

  return (data ?? []).map((p: any) => ({
    id: p.id,
    related_to: p.related_to,
    label: p.related_to === 'private_lesson'
      ? `Private lesson with ${p.schedule_assignments?.coach?.full_name ?? 'coach'}`
      : (p.player_tier_assignments?.group_tiers?.name ?? 'Group lesson'),
    payment_status: p.payment_status,
    payment_method: p.payment_method ? (METHOD_LABELS[p.payment_method] ?? p.payment_method) : null,
    reported_by_parent_id: p.reported_by_parent_id,
    created_at: p.created_at,
  }));
}

export type PayableItem = { type: 'private_lesson' | 'group_tier'; id: string; label: string };

export async function getPayableItems(childId: string): Promise<PayableItem[]> {
  const [{ data: lessons }, { data: tiers }] = await Promise.all([
    supabase.from('schedule_assignments').select('id, coach:profiles!schedule_assignments_coach_id_fkey(full_name)').eq('player_id', childId),
    supabase.from('player_tier_assignments').select('id, group_tiers(name)').eq('player_id', childId),
  ]);
  return [
    ...(lessons ?? []).map((l: any) => ({ type: 'private_lesson' as const, id: l.id, label: `Private lesson with ${l.coach?.full_name ?? 'coach'}` })),
    ...(tiers ?? []).map((t: any) => ({ type: 'group_tier' as const, id: t.id, label: t.group_tiers?.name ?? 'Group lesson' })),
  ];
}

export async function submitPaymentReport(opts: {
  clubId: string; childId: string; parentId: string; item: PayableItem; method: 'cash' | 'card' | 'e_transfer' | 'other';
}): Promise<{ ok: boolean; message?: string }> {
  const { error } = await supabase.from('lesson_payments').insert({
    club_id: opts.clubId,
    player_id: opts.childId,
    related_to: opts.item.type,
    schedule_assignment_id: opts.item.type === 'private_lesson' ? opts.item.id : null,
    player_tier_assignment_id: opts.item.type === 'group_tier' ? opts.item.id : null,
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

// Busy windows for a coach on a given day — private lessons + any group
// lesson slot they main/assist-coach — used to compute open slots.
export async function getCoachBusyWindows(clubId: string, coachId: string, dayOfWeek: number): Promise<{ start: string; end: string }[]> {
  const [{ data: lessonRows }, { data: coachTierRows }] = await Promise.all([
    supabase.from('schedule_assignments').select('start_time, end_time').eq('club_id', clubId).eq('coach_id', coachId).eq('day_of_week', dayOfWeek),
    supabase.from('lesson_coaches').select('group_tier_id, group_tiers!inner(club_id)').eq('coach_id', coachId).eq('group_tiers.club_id', clubId),
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

  return [
    ...(lessonRows ?? []).map((l: any) => ({ start: l.start_time, end: l.end_time })),
    ...slotRows.map((s: any) => ({ start: s.start_time, end: s.end_time })),
    ...(pendingRequests ?? []).map((r: any) => ({ start: r.start_time, end: r.end_time })),
  ];
}

export function isSlotOpen(busyWindows: { start: string; end: string }[], start: string, end: string): boolean {
  return !busyWindows.some((w) => timesOverlap(start, end, w.start, w.end));
}

export async function submitScheduleRequest(opts: {
  parentId: string; childId: string; coachId: string; clubId: string; dayOfWeek: number; start: string; end: string;
  replacesAssignmentId?: string;
}): Promise<{ ok: boolean; message?: string }> {
  const busy = await getCoachBusyWindows(opts.clubId, opts.coachId, opts.dayOfWeek);
  if (!isSlotOpen(busy, opts.start, opts.end)) {
    return { ok: false, message: 'That slot was just taken — please pick another.' };
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

export type MyWaitlistEntry = { id: string; coachId: string; coachName: string; priority: number; status: string; createdAt: string };

export async function joinWaitlist(clubId: string, playerId: string, coachId: string): Promise<{ ok: boolean; message?: string }> {
  const { error } = await supabase.from('waitlist_entries').insert({ club_id: clubId, coach_id: coachId, player_id: playerId });
  if (error) return { ok: false, message: 'Could not join the waitlist — please try again.' };
  return { ok: true };
}

export async function getMyWaitlistEntries(playerId: string): Promise<MyWaitlistEntry[]> {
  const { data } = await supabase
    .from('waitlist_entries')
    .select('id, coach_id, priority, status, created_at, profiles!waitlist_entries_coach_id_fkey(full_name)')
    .eq('player_id', playerId)
    .order('created_at', { ascending: false });
  return (data ?? []).map((r: any) => ({
    id: r.id, coachId: r.coach_id, coachName: r.profiles?.full_name ?? 'Coach',
    priority: r.priority, status: r.status, createdAt: r.created_at,
  }));
}

export async function leaveWaitlist(entryId: string): Promise<{ ok: boolean }> {
  const { error } = await supabase.from('waitlist_entries').delete().eq('id', entryId);
  return { ok: !error };
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
