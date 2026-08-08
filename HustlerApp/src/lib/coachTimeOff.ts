import { supabase } from './supabase';
import { notifyCoachDaysOff } from './notifications';

export type CoachTimeOff = {
  id: string;
  kind: 'recurring_break' | 'recurring_day_off' | 'days_off';
  dayOfWeek: number | null;
  startTime: string | null;
  endTime: string | null;
  startDate: string | null;
  endDate: string | null;
  label: string | null;
};

export async function getCoachTimeOff(clubId: string, coachId: string): Promise<CoachTimeOff[]> {
  const { data } = await supabase
    .from('coach_time_off')
    .select('id, kind, day_of_week, start_time, end_time, start_date, end_date, label')
    .eq('club_id', clubId)
    .eq('coach_id', coachId)
    .order('created_at', { ascending: true });

  return (data ?? []).map((r: any) => ({
    id: r.id, kind: r.kind, dayOfWeek: r.day_of_week, startTime: r.start_time, endTime: r.end_time,
    startDate: r.start_date, endDate: r.end_date, label: r.label,
  }));
}

// One break can apply to several days at once (a lunch break is usually the
// same every weekday) — inserts one row per selected day, same pattern as
// addCoachShift/addRecurringDayOff, so each day still edits/removes
// independently afterward.
export async function addRecurringBreak(opts: {
  clubId: string; coachId: string; daysOfWeek: number[]; startTime: string; endTime: string; label?: string;
}): Promise<{ ok: boolean; message?: string }> {
  const { error } = await supabase.from('coach_time_off').insert(
    opts.daysOfWeek.map((dayOfWeek) => ({
      club_id: opts.clubId, coach_id: opts.coachId, kind: 'recurring_break',
      day_of_week: dayOfWeek, start_time: opts.startTime, end_time: opts.endTime,
      label: opts.label || null,
    }))
  );
  if (error) return { ok: false, message: 'Could not add that break — please try again.' };
  return { ok: true };
}

// A weekday the coach never works, every week (e.g. always off Sundays) —
// no start/end time, the whole day is blocked. Set from the Working Hours
// section alongside shifts (same multi-day pill picker, same one-row-per-day
// shape as addCoachShift) rather than treated as a kind of break.
export async function addRecurringDayOff(opts: {
  clubId: string; coachId: string; daysOfWeek: number[]; label?: string;
}): Promise<{ ok: boolean; message?: string }> {
  const { error } = await supabase.from('coach_time_off').insert(
    opts.daysOfWeek.map((dayOfWeek) => ({
      club_id: opts.clubId, coach_id: opts.coachId, kind: 'recurring_day_off',
      day_of_week: dayOfWeek, label: opts.label || null,
    }))
  );
  if (error) return { ok: false, message: 'Could not add that day off — please try again.' };
  return { ok: true };
}

export async function addDaysOff(opts: {
  clubId: string; coachId: string; startDate: string; endDate: string; label?: string;
}): Promise<{ ok: boolean; message?: string }> {
  const { error } = await supabase.from('coach_time_off').insert({
    club_id: opts.clubId, coach_id: opts.coachId, kind: 'days_off',
    start_date: opts.startDate, end_date: opts.endDate, label: opts.label || null,
  });
  if (error) return { ok: false, message: 'Could not add those days off — please try again.' };

  // Informs the club when a COACH self-reports their own vacation (a club
  // owner adding it for someone else doesn't need to notify themselves).
  const { data: club } = await supabase.from('clubs').select('owner_id').eq('id', opts.clubId).maybeSingle();
  if (club && club.owner_id !== opts.coachId) {
    const { data: coach } = await supabase.from('profiles').select('full_name').eq('id', opts.coachId).maybeSingle();
    await notifyCoachDaysOff(club.owner_id, coach?.full_name ?? 'A coach', opts.startDate, opts.endDate);
  }
  return { ok: true };
}

export async function removeCoachTimeOff(id: string): Promise<{ ok: boolean }> {
  const { error } = await supabase.from('coach_time_off').delete().eq('id', id);
  return { ok: !error };
}

// ── Working hours (shifts) ───────────────────────────────────────────────
// A coach's actual working window on a given weekday (e.g. 9am-4pm) — the
// positive counterpart to coach_time_off's negative "blocked" windows.
// Additive: a coach with zero shift rows stays fully unrestricted (today's
// behavior) — see the shift-aware read side in getCoachBusyWindows /
// isCoachBusy for how "no shift defined at all" vs. "no shift on this
// specific weekday" are told apart.
export type CoachShift = { id: string; dayOfWeek: number; startTime: string; endTime: string };

export async function getCoachShifts(clubId: string, coachId: string): Promise<CoachShift[]> {
  const { data } = await supabase
    .from('coach_shifts')
    .select('id, day_of_week, start_time, end_time')
    .eq('club_id', clubId)
    .eq('coach_id', coachId)
    .order('day_of_week', { ascending: true });

  return (data ?? []).map((r: any) => ({ id: r.id, dayOfWeek: r.day_of_week, startTime: r.start_time, endTime: r.end_time }));
}

// One shift can apply to several days at once (a coach's Mon-Fri hours are
// usually identical) — inserts one row per selected day so each day can
// still be edited/removed independently afterward.
export async function addCoachShift(opts: {
  clubId: string; coachId: string; daysOfWeek: number[]; startTime: string; endTime: string;
}): Promise<{ ok: boolean; message?: string }> {
  const { error } = await supabase.from('coach_shifts').insert(
    opts.daysOfWeek.map((dayOfWeek) => ({
      club_id: opts.clubId, coach_id: opts.coachId, day_of_week: dayOfWeek,
      start_time: opts.startTime, end_time: opts.endTime,
    }))
  );
  if (error) return { ok: false, message: 'Could not add that shift — please try again.' };
  return { ok: true };
}

export async function removeCoachShift(id: string): Promise<{ ok: boolean }> {
  const { error } = await supabase.from('coach_shifts').delete().eq('id', id);
  return { ok: !error };
}
