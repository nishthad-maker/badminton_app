import { supabase } from './supabase';
import { getCoachShifts, getCoachTimeOff } from './coachTimeOff';
import { getGroupLessons } from './lessons';
import { timeToMinutes, hhmm } from './scheduling';

export type OpenSlot = { start: string; end: string };

const minutesToTime = (min: number) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

// A coach's real open windows on a given weekday — working hours minus
// breaks/day-off minus their existing PRIVATE lessons AND GROUP lesson
// commitments (both count as busy, confirmed with the user — a coach can't
// be double-booked across a private slot and a group lesson). Mirrors the
// exact busy-semantics of makeup.ts's isCoachBusy (built for makeup
// rescheduling), but returns actual gap windows to render as tappable
// options instead of validating one candidate time.
export async function getCoachOpenSlots(
  clubId: string, coachId: string, dayOfWeek: number, durationMinutes: number = 60
): Promise<OpenSlot[]> {
  const [allShifts, timeOff, groupLessons] = await Promise.all([
    getCoachShifts(clubId, coachId),
    getCoachTimeOff(clubId, coachId),
    getGroupLessons(clubId),
  ]);

  // A full day off blocks everything, regardless of shifts.
  if (timeOff.some((t) => t.kind === 'recurring_day_off' && t.dayOfWeek === dayOfWeek)) return [];

  // Working-hours windows for this weekday. A coach with no working hours
  // set at all — anywhere, not just today — counts as fully unavailable
  // rather than "open anytime": the club has to actually fill in their
  // hours before this coach can be booked for a private lesson (confirmed
  // with the user — this is a deliberate reversal of the earlier "blank
  // means open anytime" convention, specifically to nudge admins into
  // setting hours during onboarding instead of skipping it).
  if (allShifts.length === 0) return [];
  const todaysShifts = allShifts.filter((s) => s.dayOfWeek === dayOfWeek);
  if (todaysShifts.length === 0) return [];
  const windows: { start: number; end: number }[] = todaysShifts.map((s) => ({ start: timeToMinutes(s.startTime), end: timeToMinutes(s.endTime) }));

  const busy: { start: number; end: number }[] = [];

  timeOff
    .filter((t) => t.kind === 'recurring_break' && t.dayOfWeek === dayOfWeek && t.startTime && t.endTime)
    .forEach((t) => busy.push({ start: timeToMinutes(t.startTime!), end: timeToMinutes(t.endTime!) }));

  const { data: privateRows } = await supabase
    .from('schedule_assignments')
    .select('start_time, end_time')
    .eq('club_id', clubId)
    .eq('coach_id', coachId)
    .eq('day_of_week', dayOfWeek);
  (privateRows ?? []).forEach((r: any) => busy.push({ start: timeToMinutes(r.start_time), end: timeToMinutes(r.end_time) }));

  groupLessons.forEach((lesson) => {
    if (!lesson.coaches.some((c) => c.coach_id === coachId)) return;
    lesson.slots
      .filter((s) => s.day_of_week === dayOfWeek)
      .forEach((s) => busy.push({ start: timeToMinutes(s.start_time), end: timeToMinutes(s.end_time) }));
  });

  busy.sort((a, b) => a.start - b.start);

  // Walk each free gap in durationMinutes steps, offering every possible
  // start time within it — not just one slot per gap. A coach free 9am-5pm
  // should offer 9, 10, 11am, etc. as separate options, not a single
  // 9-10am slot standing in for the whole 8-hour window.
  const pushGapSlots = (gapStart: number, gapEnd: number) => {
    for (let s = gapStart; s + durationMinutes <= gapEnd; s += durationMinutes) {
      open.push({ start: minutesToTime(s), end: minutesToTime(s + durationMinutes) });
    }
  };

  const open: OpenSlot[] = [];
  windows.forEach((w) => {
    let cursor = w.start;
    const windowBusy = busy.filter((b) => b.end > w.start && b.start < w.end).sort((a, b) => a.start - b.start);
    windowBusy.forEach((b) => {
      if (b.start > cursor) pushGapSlots(cursor, Math.min(b.start, w.end));
      cursor = Math.max(cursor, b.end);
    });
    pushGapSlots(cursor, w.end);
  });

  return open;
}

// Re-exported for the manual-entry fallback (validating a hand-typed time
// still lands within the coach's actual working hours isn't required by the
// spec — manual entry is deliberately an unchecked override).
export { hhmm };
