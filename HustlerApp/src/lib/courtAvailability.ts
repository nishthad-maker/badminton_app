import { supabase } from './supabase';
import { timesOverlap, localDateStr } from './scheduling';
import { nextOccurrenceDate } from './attendance';
import { Court, compareCourtNames } from './courts';

// The unified "is this court free" check that didn't exist anywhere before
// this file — every existing screen (club-calendar.tsx, tiers.tsx's
// findCourtConflicts) only ever checked one or two of the four sources that
// can claim a court, and none of them are date-range-aware in the way a
// rental booking needs (verify a whole recurring series up front, not just
// "today"). Re-queries fresh on every call rather than batching across
// dates — simpler and correct; bulk bookings call this a few dozen times at
// most (one admin action, not a hot path), so the extra round-trips aren't
// worth the complexity of a batched version.
export async function getBusyCourtIds(
  clubId: string,
  date: string,
  startTime: string,
  endTime: string,
  excludeRentalGroupId?: string
): Promise<Set<string>> {
  const dayOfWeek = new Date(`${date}T00:00:00`).getDay();
  const busy = new Set<string>();

  // Private lessons: recurring day-of-week match, checked properly against
  // valid_from/valid_until (existing calendar display code doesn't do this
  // — a known separate gap, not fixed here — but this checker should still
  // be correct on its own).
  const { data: privateRows } = await supabase
    .from('schedule_assignments')
    .select('id, court_id, start_time, end_time, valid_from, valid_until')
    .eq('club_id', clubId)
    .eq('day_of_week', dayOfWeek)
    .not('court_id', 'is', null)
    .lte('valid_from', date);
  const activePrivate = (privateRows ?? []).filter((r: any) => (r.valid_until === null || r.valid_until >= date) && timesOverlap(startTime, endTime, r.start_time, r.end_time));
  if (activePrivate.length > 0) {
    const { data: exceptionRows } = await supabase
      .from('schedule_exceptions')
      .select('schedule_assignment_id')
      .eq('date', date)
      .in('reason', ['cancelled', 'rescheduled'])
      .in('schedule_assignment_id', activePrivate.map((r: any) => r.id));
    const cancelledIds = new Set((exceptionRows ?? []).map((r: any) => r.schedule_assignment_id));
    activePrivate.forEach((r: any) => { if (!cancelledIds.has(r.id) && r.court_id) busy.add(r.court_id); });
  }

  // Group lessons: recurring day-of-week slots, or a one-time slot pinned to
  // this exact date. lesson_time_slots has no club_id of its own — scoped
  // via the club's group_tiers ids. lesson_time_slot_court_overrides
  // (per-date court swaps) aren't consulted — matches the same gap already
  // present everywhere else this table is read, not a new regression.
  const { data: tierRows } = await supabase.from('group_tiers').select('id').eq('club_id', clubId);
  const tierIds = (tierRows ?? []).map((t: any) => t.id);
  if (tierIds.length > 0) {
    const { data: groupSlots } = await supabase
      .from('lesson_time_slots')
      .select('start_time, end_time, is_recurring, day_of_week, one_time_date, lesson_time_slot_courts(court_id)')
      .in('group_tier_id', tierIds)
      .or(`and(is_recurring.eq.true,day_of_week.eq.${dayOfWeek}),and(is_recurring.eq.false,one_time_date.eq.${date})`);
    (groupSlots ?? [])
      .filter((s: any) => timesOverlap(startTime, endTime, s.start_time, s.end_time))
      .forEach((s: any) => (s.lesson_time_slot_courts ?? []).forEach((sc: any) => busy.add(sc.court_id)));
  }

  // Other rentals (excluding the group being edited, if any).
  let rentalQuery = supabase.from('court_rentals').select('court_id, start_time, end_time').eq('club_id', clubId).eq('date', date);
  if (excludeRentalGroupId) rentalQuery = rentalQuery.neq('rental_group_id', excludeRentalGroupId);
  const { data: rentalRows } = await rentalQuery;
  (rentalRows ?? []).filter((r: any) => timesOverlap(startTime, endTime, r.start_time, r.end_time)).forEach((r: any) => busy.add(r.court_id));

  // Maintenance blocks.
  const { data: maintRows } = await supabase.from('court_maintenance_blocks').select('court_id, start_time, end_time').eq('club_id', clubId).eq('date', date);
  (maintRows ?? []).filter((r: any) => timesOverlap(startTime, endTime, r.start_time, r.end_time)).forEach((r: any) => busy.add(r.court_id));

  return busy;
}

// "Adjacent" = consecutive in naturally-sorted order (Court 3, Court 4,
// Court 5 back to back) — not consecutive integers, since prefixes can
// differ or numbers can skip. Returns the first fully-free window, or null.
export function findAdjacentFreeCourts(courts: Court[], busyIds: Set<string>, count: number): Court[] | null {
  const sorted = [...courts].sort((a, b) => compareCourtNames(a.name, b.name));
  if (count > sorted.length) return null;
  for (let i = 0; i <= sorted.length - count; i++) {
    const window = sorted.slice(i, i + count);
    if (window.every((c) => !busyIds.has(c.id))) return window;
  }
  return null;
}

// Weekly occurrence dates for a recurring booking, one list per requested
// weekday, each starting from that day's next real occurrence (today
// included) through endDate inclusive.
export function getOccurrenceDates(daysOfWeek: number[], endDate: string): Record<number, string[]> {
  const result: Record<number, string[]> = {};
  for (const dow of daysOfWeek) {
    const dates: string[] = [];
    let cursor = nextOccurrenceDate(dow);
    while (cursor <= endDate) {
      dates.push(cursor);
      const d = new Date(`${cursor}T00:00:00`);
      d.setDate(d.getDate() + 7);
      cursor = localDateStr(d);
    }
    result[dow] = dates;
  }
  return result;
}

// Default horizon when a bulk booking is left with no end date — "lock
// courts once" requires verifying the whole range up front, and an
// unbounded range can't be verified, so this is an explicit, communicated
// cap rather than true infinite recurrence.
export function defaultBulkEndDate(): string {
  const d = new Date();
  d.setDate(d.getDate() + 7 * 12);
  return localDateStr(d);
}
