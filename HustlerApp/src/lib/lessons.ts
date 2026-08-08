import { supabase } from './supabase';

export type LessonCoach = { id: string; coach_id: string; full_name: string; role: 'main' | 'assistant' };
export type TimeSlot = {
  id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  is_recurring: boolean;
  one_time_date: string | null;
  court_ids: string[];
  court_names: string[];
};
export type GroupLesson = {
  id: string;
  name: string;
  coaches: LessonCoach[];
  slots: TimeSlot[];
  roster_count: number;
  capacity: number | null;
  age_group: string | null;
};
export type RosterPlayer = { id: string; player_id: string; player_name: string };

export type SlotDraft = {
  day: number;
  start: string;
  end: string;
  isRecurring: boolean;
  oneTimeDate: string | null;
  courtIds: string[];
};

// A batch type (club_settings' skill_levels list) gets its lesson card the
// moment it's added — so a coach only has to set the day/time and it's
// ready, instead of building the tier from scratch. No-op if a tier with
// that name already exists for the club.
export async function ensureGroupLessonsForBatchTypes(clubId: string, batchTypes: string[]): Promise<void> {
  if (batchTypes.length === 0) return;
  const { data: existing } = await supabase.from('group_tiers').select('name').eq('club_id', clubId);
  const existingNames = new Set((existing ?? []).map((t: any) => t.name));
  const missing = batchTypes.filter((name) => !existingNames.has(name));
  if (missing.length === 0) return;
  await supabase.from('group_tiers').insert(missing.map((name) => ({ club_id: clubId, name })));
}

export async function getGroupLessons(clubId: string): Promise<GroupLesson[]> {
  const { data: tierRows } = await supabase.from('group_tiers').select('id, name, capacity, age_group').eq('club_id', clubId).order('name', { ascending: true });
  const tiers = tierRows ?? [];
  if (tiers.length === 0) return [];
  const tierIds = tiers.map((t: any) => t.id);

  const [{ data: coachRows }, { data: slotRows }, { data: rosterRows }] = await Promise.all([
    supabase.from('lesson_coaches').select('id, group_tier_id, coach_id, role, profiles(full_name)').in('group_tier_id', tierIds),
    supabase
      .from('lesson_time_slots')
      .select('id, group_tier_id, day_of_week, start_time, end_time, is_recurring, one_time_date, lesson_time_slot_courts(court_id, courts(name))')
      .in('group_tier_id', tierIds)
      .order('day_of_week', { ascending: true })
      .order('start_time', { ascending: true }),
    supabase.from('player_tier_assignments').select('group_tier_id').in('group_tier_id', tierIds),
  ]);

  const rosterCounts: Record<string, number> = {};
  (rosterRows ?? []).forEach((r: any) => { rosterCounts[r.group_tier_id] = (rosterCounts[r.group_tier_id] ?? 0) + 1; });

  return tiers.map((t: any) => ({
    id: t.id,
    name: t.name,
    capacity: t.capacity ?? null,
    age_group: t.age_group ?? null,
    coaches: (coachRows ?? [])
      .filter((c: any) => c.group_tier_id === t.id)
      .map((c: any) => ({ id: c.id, coach_id: c.coach_id, full_name: c.profiles?.full_name ?? 'Coach', role: c.role }))
      .sort((a: LessonCoach, b: LessonCoach) => (a.role === b.role ? 0 : a.role === 'main' ? -1 : 1)),
    slots: (slotRows ?? [])
      .filter((s: any) => s.group_tier_id === t.id)
      .map((s: any) => ({
        id: s.id, day_of_week: s.day_of_week, start_time: s.start_time, end_time: s.end_time,
        is_recurring: s.is_recurring, one_time_date: s.one_time_date,
        court_ids: (s.lesson_time_slot_courts ?? []).map((sc: any) => sc.court_id),
        court_names: (s.lesson_time_slot_courts ?? []).map((sc: any) => sc.courts?.name).filter(Boolean),
      })),
    roster_count: rosterCounts[t.id] ?? 0,
  }));
}

async function insertSlot(groupTierId: string, slot: SlotDraft) {
  const { data: slotRow } = await supabase.from('lesson_time_slots').insert({
    group_tier_id: groupTierId,
    day_of_week: slot.day,
    start_time: slot.start,
    end_time: slot.end,
    is_recurring: slot.isRecurring,
    one_time_date: slot.isRecurring ? null : slot.oneTimeDate,
  }).select().single();
  if (slotRow && slot.courtIds.length) {
    await supabase.from('lesson_time_slot_courts').insert(slot.courtIds.map((courtId) => ({ lesson_time_slot_id: slotRow.id, court_id: courtId })));
  }
}

// Direct insert of main + assistant coach rows for a lesson that has none
// yet — unlike setMainCoach/addAssistantCoach below, this doesn't depend on
// a pre-existing row to update/promote, so it's the right call for both a
// brand-new lesson and a first-time coach assignment on an older empty one.
export async function assignLessonCoaches(groupTierId: string, mainCoachId: string, assistantCoachIds: string[]) {
  const coachInserts = [
    { group_tier_id: groupTierId, coach_id: mainCoachId, role: 'main' as const },
    ...assistantCoachIds.filter((id) => id !== mainCoachId).map((id) => ({ group_tier_id: groupTierId, coach_id: id, role: 'assistant' as const })),
  ];
  await supabase.from('lesson_coaches').insert(coachInserts);
}

export async function createGroupLesson(opts: {
  clubId: string;
  name: string;
  mainCoachId: string;
  assistantCoachIds: string[];
  slots: SlotDraft[];
  capacity?: number | null;
  ageGroup?: string | null;
}): Promise<{ ok: true; id: string } | { ok: false; message: string }> {
  const { data: tier, error } = await supabase.from('group_tiers').insert({
    club_id: opts.clubId, name: opts.name,
    capacity: opts.capacity ?? null, age_group: opts.ageGroup ?? null,
  }).select().single();
  if (error || !tier) return { ok: false, message: 'Could not create the lesson.' };

  await assignLessonCoaches(tier.id, opts.mainCoachId, opts.assistantCoachIds);

  for (const slot of opts.slots) {
    await insertSlot(tier.id, slot);
  }
  return { ok: true, id: tier.id };
}

export async function renameGroupLesson(groupTierId: string, name: string) {
  await supabase.from('group_tiers').update({ name }).eq('id', groupTierId);
}

// Generalizes renameGroupLesson to also cover the two soft-enforced fields
// (never blocks enrollment, just informs the roster-count display) — kept
// as a separate function from renameGroupLesson rather than replacing it,
// since name-only edits are still the common case.
export async function updateTierDetails(groupTierId: string, patch: { capacity?: number | null; ageGroup?: string | null }): Promise<{ ok: boolean }> {
  const update: Record<string, any> = {};
  if (patch.capacity !== undefined) update.capacity = patch.capacity;
  if (patch.ageGroup !== undefined) update.age_group = patch.ageGroup;
  const { error } = await supabase.from('group_tiers').update(update).eq('id', groupTierId);
  return { ok: !error };
}

export async function deleteGroupLesson(groupTierId: string) {
  await supabase.from('group_tiers').delete().eq('id', groupTierId);
}

export async function addTimeSlot(groupTierId: string, slot: SlotDraft) {
  await insertSlot(groupTierId, slot);
}

export async function updateTimeSlot(slotId: string, slot: SlotDraft) {
  await supabase.from('lesson_time_slots').update({
    day_of_week: slot.day,
    start_time: slot.start,
    end_time: slot.end,
    is_recurring: slot.isRecurring,
    one_time_date: slot.isRecurring ? null : slot.oneTimeDate,
  }).eq('id', slotId);
  await supabase.from('lesson_time_slot_courts').delete().eq('lesson_time_slot_id', slotId);
  if (slot.courtIds.length) {
    await supabase.from('lesson_time_slot_courts').insert(slot.courtIds.map((courtId) => ({ lesson_time_slot_id: slotId, court_id: courtId })));
  }
}

export async function deleteTimeSlot(slotId: string) {
  await supabase.from('lesson_time_slots').delete().eq('id', slotId);
}

export async function setMainCoach(groupTierId: string, coachId: string) {
  await supabase.from('lesson_coaches').update({ role: 'assistant' }).eq('group_tier_id', groupTierId).eq('role', 'main');
  await supabase.from('lesson_coaches').update({ role: 'main' }).eq('group_tier_id', groupTierId).eq('coach_id', coachId);
}

export async function addAssistantCoach(groupTierId: string, coachId: string) {
  await supabase.from('lesson_coaches').insert({ group_tier_id: groupTierId, coach_id: coachId, role: 'assistant' });
}

export async function removeLessonCoach(lessonCoachId: string) {
  await supabase.from('lesson_coaches').delete().eq('id', lessonCoachId);
}

export async function getRoster(groupTierId: string): Promise<RosterPlayer[]> {
  const { data } = await supabase.from('player_tier_assignments').select('id, player_id, profiles(full_name)').eq('group_tier_id', groupTierId);
  return (data ?? []).map((r: any) => ({ id: r.id, player_id: r.player_id, player_name: r.profiles?.full_name ?? 'Player' }));
}

export async function addPlayerToLesson(groupTierId: string, playerId: string): Promise<{ ok: boolean; message?: string }> {
  const { error } = await supabase.from('player_tier_assignments').insert({ group_tier_id: groupTierId, player_id: playerId });
  if (error) return { ok: false, message: error.message.includes('duplicate') ? 'That player is already enrolled.' : 'Could not add player.' };
  return { ok: true };
}

// ── Per-date court overrides ────────────────────────────────────────────
// A recurring slot's own lesson_time_slot_courts is the "every week"
// default — these functions only ever touch the rare one-date exception
// (e.g. a court rental conflict for a single upcoming session). All other
// occurrences of the slot are unaffected.

export type CourtOverride = { id: string; date: string; courtIds: string[]; courtNames: string[] };

export async function getCourtOverrides(lessonTimeSlotId: string): Promise<CourtOverride[]> {
  const { data } = await supabase
    .from('lesson_time_slot_court_overrides')
    .select('id, date, lesson_time_slot_court_override_courts(court_id, courts(name))')
    .eq('lesson_time_slot_id', lessonTimeSlotId)
    .order('date', { ascending: true });
  return (data ?? []).map((o: any) => ({
    id: o.id,
    date: o.date,
    courtIds: (o.lesson_time_slot_court_override_courts ?? []).map((x: any) => x.court_id),
    courtNames: (o.lesson_time_slot_court_override_courts ?? []).map((x: any) => x.courts?.name).filter(Boolean),
  }));
}

export async function setCourtOverride(lessonTimeSlotId: string, date: string, courtIds: string[]): Promise<{ ok: boolean; message?: string }> {
  const { data: existing } = await supabase
    .from('lesson_time_slot_court_overrides')
    .select('id')
    .eq('lesson_time_slot_id', lessonTimeSlotId)
    .eq('date', date)
    .maybeSingle();

  let overrideId = existing?.id as string | undefined;
  if (!overrideId) {
    const { data: created, error } = await supabase
      .from('lesson_time_slot_court_overrides')
      .insert({ lesson_time_slot_id: lessonTimeSlotId, date })
      .select()
      .single();
    if (error || !created) return { ok: false, message: 'Could not save the override.' };
    overrideId = created.id;
  } else {
    await supabase.from('lesson_time_slot_court_override_courts').delete().eq('override_id', overrideId);
  }

  if (courtIds.length) {
    const { error } = await supabase
      .from('lesson_time_slot_court_override_courts')
      .insert(courtIds.map((courtId) => ({ override_id: overrideId, court_id: courtId })));
    if (error) return { ok: false, message: 'Could not save the courts for that date.' };
  }
  return { ok: true };
}

export async function clearCourtOverride(overrideId: string): Promise<void> {
  await supabase.from('lesson_time_slot_court_overrides').delete().eq('id', overrideId);
}

export async function removePlayerFromLesson(assignmentId: string) {
  await supabase.from('player_tier_assignments').delete().eq('id', assignmentId);
}

export type PlayerFolder = {
  privateLessons: { id: string; day_of_week: number; start_time: string; end_time: string; coach_name: string }[];
  mainCoachName: string | null;
  groupLessons: { id: string; name: string; mainCoachName: string | null }[];
};

// The "private-lesson folder" a player gets the moment they're added to the
// roster — not a separate stored table, just this club's schedule_assignments
// for them plus their group_tiers enrollments, assembled on demand.
export async function getPlayerFolder(clubId: string, playerId: string): Promise<PlayerFolder> {
  const { data: lessonRows } = await supabase
    .from('schedule_assignments')
    .select('id, day_of_week, start_time, end_time, coach:profiles!schedule_assignments_coach_id_fkey(full_name)')
    .eq('club_id', clubId)
    .eq('player_id', playerId)
    .order('day_of_week', { ascending: true });

  const privateLessons = (lessonRows ?? []).map((l: any) => ({
    id: l.id, day_of_week: l.day_of_week, start_time: l.start_time, end_time: l.end_time,
    coach_name: l.coach?.full_name ?? 'Coach',
  }));
  const coachNames = [...new Set(privateLessons.map((l) => l.coach_name))];
  const mainCoachName = coachNames.length > 0 ? coachNames.join(', ') : null;

  const { data: tierAssignmentRows } = await supabase
    .from('player_tier_assignments')
    .select('group_tier_id, group_tiers(name)')
    .eq('player_id', playerId);

  const tierIds = (tierAssignmentRows ?? []).map((r: any) => r.group_tier_id);
  let mainCoachRows: any[] = [];
  if (tierIds.length) {
    const { data } = await supabase.from('lesson_coaches').select('group_tier_id, profiles(full_name)').in('group_tier_id', tierIds).eq('role', 'main');
    mainCoachRows = data ?? [];
  }
  const groupLessons = (tierAssignmentRows ?? []).map((r: any) => ({
    id: r.group_tier_id,
    name: r.group_tiers?.name ?? 'Group Lesson',
    mainCoachName: mainCoachRows.find((c: any) => c.group_tier_id === r.group_tier_id)?.profiles?.full_name ?? null,
  }));

  return { privateLessons, mainCoachName, groupLessons };
}
