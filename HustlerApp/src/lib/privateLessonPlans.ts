import { supabase } from './supabase';
import { localDateStr } from './scheduling';
import { nextOccurrenceDate } from './attendance';

const todayStr = () => localDateStr(new Date());

export type PrivateLessonPlan = {
  id: string;
  coachId: string;
  coachName: string;
  totalSessions: number;
  sessionsUsed: number;
  status: 'active' | 'exhausted' | 'cancelled';
  isRecurring: boolean;
};

// Each day can have its own coach (co-teaching a plan across the week is
// normal — Monday with one coach, Wednesday with another).
export type PlanSlotDraft = { day: number; start: string; end: string; coachId: string };

// The enroll-private wizard's final step — creates the whole plan in one
// call. Recurring: one private_lesson_plans row (the session budget) plus
// one schedule_assignments row per selected day, all sharing plan_id; the
// daily advance_private_lesson_plans() cron (see the migration) auto-stops
// them once sessions_used reaches totalSessions. Not recurring: no plan row
// at all — plain one-off schedule_assignments, exactly like today's
// "just this week" private bookings (valid_until = today, is_recurring
// false), since there's nothing to track a budget against.
//
// private_lesson_plans.coach_id is a single column (can't vary per day), so
// it's populated from the first slot's coach as a "primary" reference for
// display — the actual authoritative coach for each day is always that
// day's own schedule_assignments.coach_id, independent of this.
export async function createPrivateLessonPlan(opts: {
  clubId: string; playerId: string; totalSessions: number;
  isRecurring: boolean; slots: PlanSlotDraft[]; createdBy: string | null;
}): Promise<{ ok: boolean; message?: string }> {
  if (opts.slots.length === 0) return { ok: false, message: 'Add at least one day/time.' };

  if (!opts.isRecurring) {
    // Pinned to the actual date that day-of-week falls on (today included) —
    // not just today's date — since the club could be booking this a few
    // days ahead of the lesson itself.
    const rows = opts.slots.map((slot) => {
      const date = nextOccurrenceDate(slot.day);
      return {
        club_id: opts.clubId, player_id: opts.playerId, coach_id: slot.coachId,
        day_of_week: slot.day, start_time: slot.start, end_time: slot.end,
        valid_from: date, valid_until: date, is_recurring: false, court_id: null,
      };
    });
    const { data: created, error } = await supabase.from('schedule_assignments').insert(rows).select('id, coach_id, valid_from');
    if (error) return { ok: false, message: 'Could not schedule the lesson(s).' };

    // No plan/cron behind a one-off booking, so it's logged to history right
    // here instead — getPlayerPrivateLessonHistory only surfaces rows whose
    // date has actually passed, so this doesn't show as "history" early.
    const sessionRows = (created ?? []).map((r: any) => ({
      plan_id: null, schedule_assignment_id: r.id, club_id: opts.clubId, player_id: opts.playerId,
      coach_id: r.coach_id, session_date: r.valid_from,
    }));
    if (sessionRows.length) await supabase.from('private_lesson_sessions').insert(sessionRows);

    return { ok: true };
  }

  const { data: plan, error: planError } = await supabase.from('private_lesson_plans').insert({
    club_id: opts.clubId, player_id: opts.playerId, coach_id: opts.slots[0].coachId,
    total_sessions: opts.totalSessions, is_recurring: true, created_by: opts.createdBy,
  }).select().single();
  if (planError || !plan) return { ok: false, message: 'Could not create the lesson plan.' };

  const rows = opts.slots.map((slot) => ({
    club_id: opts.clubId, player_id: opts.playerId, coach_id: slot.coachId,
    day_of_week: slot.day, start_time: slot.start, end_time: slot.end,
    valid_from: todayStr(), valid_until: null, is_recurring: true, court_id: null,
    plan_id: plan.id,
  }));
  const { error } = await supabase.from('schedule_assignments').insert(rows);
  if (error) {
    await supabase.from('private_lesson_plans').delete().eq('id', plan.id);
    return { ok: false, message: 'Could not schedule the lesson(s).' };
  }
  return { ok: true };
}

export async function getPlayerPrivateLessonPlans(clubId: string, playerId: string): Promise<PrivateLessonPlan[]> {
  const { data } = await supabase
    .from('private_lesson_plans')
    .select('id, coach_id, total_sessions, sessions_used, status, is_recurring, coach:profiles!private_lesson_plans_coach_id_fkey(full_name)')
    .eq('club_id', clubId)
    .eq('player_id', playerId)
    .order('created_at', { ascending: false });
  return (data ?? []).map((r: any) => ({
    id: r.id, coachId: r.coach_id, coachName: r.coach?.full_name ?? 'Coach',
    totalSessions: r.total_sessions, sessionsUsed: r.sessions_used, status: r.status, isRecurring: r.is_recurring,
  }));
}

// The "+" top-up — increases the budget and, if the plan had already
// stopped, resumes it: flips status back to active and clears the
// valid_until freeze the cron set on its linked schedule_assignments so
// they start recurring again going forward.
export async function addSessionsToPlan(planId: string, additionalSessions: number): Promise<{ ok: boolean; message?: string }> {
  const { data: plan, error: fetchError } = await supabase.from('private_lesson_plans').select('total_sessions, status').eq('id', planId).single();
  if (fetchError || !plan) return { ok: false, message: 'Could not find that plan.' };

  const { error } = await supabase.from('private_lesson_plans')
    .update({ total_sessions: plan.total_sessions + additionalSessions, status: 'active' })
    .eq('id', planId);
  if (error) return { ok: false, message: 'Could not add sessions to that plan.' };

  if (plan.status === 'exhausted') {
    await supabase.from('schedule_assignments').update({ valid_until: null }).eq('plan_id', planId);
  }
  return { ok: true };
}

export type PrivateLessonSession = { id: string; sessionDate: string; coachId: string; coachName: string };

// One row per date a private lesson actually happened — plan-based
// recurring ones logged by the daily advance_private_lesson_plans() cron,
// one-off "just this week" bookings logged directly at booking time (see
// createPrivateLessonPlan). Filtered to dates that have actually passed, so
// a one-off booked a few days ahead doesn't show as "history" before it
// happens.
export async function getPlayerPrivateLessonHistory(clubId: string, playerId: string): Promise<PrivateLessonSession[]> {
  const { data } = await supabase
    .from('private_lesson_sessions')
    .select('id, session_date, coach_id, coach:profiles!private_lesson_sessions_coach_id_fkey(full_name)')
    .eq('club_id', clubId)
    .eq('player_id', playerId)
    .lt('session_date', todayStr())
    .order('session_date', { ascending: false });
  return (data ?? []).map((r: any) => ({
    id: r.id, sessionDate: r.session_date, coachId: r.coach_id, coachName: r.coach?.full_name ?? 'Coach',
  }));
}
