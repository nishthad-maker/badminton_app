import { supabase } from './supabase';
import { DAY_NAMES, hhmm, timesOverlap } from './scheduling';

export type Court = { id: string; name: string };

export async function getClubCourts(clubId: string): Promise<Court[]> {
  const { data } = await supabase.from('courts').select('id, name').eq('club_id', clubId).order('name', { ascending: true });
  return data ?? [];
}

export type CourtConflict = { label: string; day: string; time: string };

// Checks whether a new group-lesson time slot or private lesson on
// `courtId` would overlap an existing one already on that court, on any of
// `days`, during [startTime, endTime). A court belongs to exactly one club,
// so no separate club_id filter is needed here. Returns human-readable
// conflicts to show as a warning — this never blocks creation, a club may
// genuinely want to double-book a court (e.g. splitting one court into two
// doubles halves).
export async function findCourtConflicts(opts: {
  courtId: string;
  days: number[];
  startTime: string;
  endTime: string;
  excludeSlotId?: string;
  excludeLessonId?: string;
}): Promise<CourtConflict[]> {
  const { courtId, days, startTime, endTime, excludeSlotId, excludeLessonId } = opts;
  const conflicts: CourtConflict[] = [];
  if (!courtId || days.length === 0) return conflicts;

  const { data: slotCourtRows } = await supabase
    .from('lesson_time_slot_courts')
    .select('lesson_time_slots(id, day_of_week, start_time, end_time, group_tiers(name))')
    .eq('court_id', courtId);

  (slotCourtRows ?? []).forEach((row: any) => {
    const slot = row.lesson_time_slots;
    if (!slot || slot.id === excludeSlotId || !days.includes(slot.day_of_week)) return;
    if (!timesOverlap(startTime, endTime, slot.start_time, slot.end_time)) return;
    conflicts.push({
      label: slot.group_tiers?.name ?? 'Group lesson',
      day: DAY_NAMES[slot.day_of_week],
      time: `${hhmm(slot.start_time)}–${hhmm(slot.end_time)}`,
    });
  });

  let lessonQuery = supabase
    .from('schedule_assignments')
    .select('id, day_of_week, start_time, end_time, profiles(full_name)')
    .eq('court_id', courtId)
    .in('day_of_week', days);
  if (excludeLessonId) lessonQuery = lessonQuery.neq('id', excludeLessonId);
  const { data: lessonRows } = await lessonQuery;

  (lessonRows ?? []).forEach((l: any) => {
    if (!timesOverlap(startTime, endTime, l.start_time, l.end_time)) return;
    conflicts.push({
      label: `${l.profiles?.full_name ?? 'Player'}'s lesson`,
      day: DAY_NAMES[l.day_of_week],
      time: `${hhmm(l.start_time)}–${hhmm(l.end_time)}`,
    });
  });

  return conflicts;
}

export function formatCourtConflicts(conflicts: CourtConflict[]): string {
  return conflicts.map((c) => `• ${c.label} — ${c.day} ${c.time}`).join('\n');
}
