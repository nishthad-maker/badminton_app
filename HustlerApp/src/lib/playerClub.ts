import { supabase } from './supabase';
import { getRoster, RosterPlayer } from './lessons';
import {
  getChildLessons, getChildGroupLessons, getUpcomingTournaments, createTournamentBlock,
  getClubCoaches, getCoachBusyWindows, isSlotOpen, submitScheduleRequest, getMyScheduleRequests,
  joinWaitlist, getMyWaitlistEntries, leaveWaitlist,
  ChildLesson, ChildGroupLesson, UpcomingTournament, ClubCoach, ScheduleRequestRow, MyWaitlistEntry,
} from './parentDashboard';

// Thin player-facing wrappers around the (generically-named) parent
// dashboard queries — they already take an arbitrary playerId + clubId, so
// there's nothing club-specific about them that needs duplicating here.
export const getMyLessons = getChildLessons;
export const getMyGroupLessons = getChildGroupLessons;
export const getMyUpcomingTournaments = getUpcomingTournaments;
export const markTournamentDates = createTournamentBlock;
export type { ChildLesson, ChildGroupLesson, UpcomingTournament, ClubCoach, ScheduleRequestRow, MyWaitlistEntry };

// Reschedule/coach-availability — reuses the same schedule_requests +
// getCoachBusyWindows machinery parents already had; a self-service request
// just sets parent_id = child_id = the player's own id (see migration
// 20260729100000_player_scheduling_paths.sql).
export const getCoachesForScheduling = getClubCoaches;
export const getCoachAvailability = getCoachBusyWindows;
export { isSlotOpen };

export async function requestReschedule(opts: {
  playerId: string; coachId: string; clubId: string; dayOfWeek: number; start: string; end: string;
  replacesAssignmentId?: string;
}): Promise<{ ok: boolean; message?: string }> {
  return submitScheduleRequest({
    parentId: opts.playerId, childId: opts.playerId, coachId: opts.coachId, clubId: opts.clubId,
    dayOfWeek: opts.dayOfWeek, start: opts.start, end: opts.end, replacesAssignmentId: opts.replacesAssignmentId,
  });
}

export async function getMyReschedulePendingRequests(playerId: string, clubId: string): Promise<ScheduleRequestRow[]> {
  return getMyScheduleRequests(playerId, playerId, clubId);
}

// Waitlist — player joins a coach's waitlist directly; club/coach side
// (priority ordering, offering a slot, promoting to a real lesson) already
// existed in club-calendar.tsx.
export const joinCoachWaitlist = joinWaitlist;
export const getMyWaitlist = getMyWaitlistEntries;
export const leaveCoachWaitlist = leaveWaitlist;

// Player-names-only attendee list for a group lesson — never touches
// parent_children, so there's no path for a parent identity to leak in,
// regardless of who's viewing (player or a linked parent).
export async function getGroupLessonRoster(groupTierId: string): Promise<RosterPlayer[]> {
  return getRoster(groupTierId);
}

// Distinct coach name(s) from the player's private lessons at this club —
// shown as "assigned main coach" in the Train tab's Club section.
export async function getMainCoachNames(playerId: string, clubId: string): Promise<string[]> {
  const { data } = await supabase
    .from('schedule_assignments')
    .select('coach:profiles!schedule_assignments_coach_id_fkey(full_name)')
    .eq('player_id', playerId)
    .eq('club_id', clubId);
  return [...new Set((data ?? []).map((r: any) => r.coach?.full_name).filter(Boolean))];
}

export type PlayerCoach = { id: string; full_name: string; isPriority: boolean };

// Every coach a player can see at this club — private-lesson coaches plus
// any group-lesson coach they share a tier with — with the club's designated
// priority_coach_id flagged. Non-priority coaches are shown, not hidden, per
// the spec's "grey out (view-only), don't hide" rule — the greying itself is
// a player-side UI concern (workouts.tsx), this just supplies the flag.
export async function getClubCoachesForPlayer(playerId: string, clubId: string): Promise<PlayerCoach[]> {
  const [{ data: privateRows }, { data: tierRows }, { data: memberRow }] = await Promise.all([
    supabase.from('schedule_assignments').select('coach:profiles!schedule_assignments_coach_id_fkey(id, full_name)').eq('player_id', playerId).eq('club_id', clubId),
    supabase.from('player_tier_assignments').select('group_tiers!inner(club_id, lesson_coaches(coach_id, profiles(id, full_name)))').eq('player_id', playerId).eq('group_tiers.club_id', clubId),
    supabase.from('club_members').select('priority_coach_id').eq('player_id', playerId).eq('club_id', clubId).eq('status', 'active').maybeSingle(),
  ]);

  const byId: Record<string, string> = {};
  (privateRows ?? []).forEach((r: any) => { if (r.coach?.id) byId[r.coach.id] = r.coach.full_name ?? 'Coach'; });
  (tierRows ?? []).forEach((r: any) => {
    (r.group_tiers?.lesson_coaches ?? []).forEach((lc: any) => {
      if (lc.profiles?.id) byId[lc.profiles.id] = lc.profiles.full_name ?? 'Coach';
    });
  });

  // No explicit priority coach set yet -> treat every coach as fully
  // interactive rather than greying out the whole list for no reason.
  const priorityId = (memberRow as any)?.priority_coach_id ?? null;
  return Object.entries(byId).map(([id, full_name]) => ({ id, full_name, isPriority: priorityId ? id === priorityId : true }));
}
