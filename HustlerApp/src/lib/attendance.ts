import { supabase } from './supabase';
import { notifyAttendanceChanged, notifyMakeupAvailable, notifyPostCutoffCancellation } from './notifications';
import { formatTime12h, localDateStr } from './scheduling';

export type AttendanceStatus = {
  attending: boolean;
  coachOverride: boolean;
  toggledBy: 'player' | 'parent' | 'coach' | 'system' | null;
  exists: boolean; // false = default-on state, no row written yet
};

const DEFAULT_STATUS: AttendanceStatus = { attending: true, coachOverride: false, toggledBy: null, exists: false };

// Attendance rows are lazy — absence of a row IS the default-on state, per
// the spec. This returns a map keyed by player_id for a single lesson
// occurrence (one group tier OR one private schedule_assignment, on one date).
export async function getAttendanceForDate(opts: {
  groupTierId?: string;
  scheduleAssignmentId?: string;
  lessonDate: string;
}): Promise<Record<string, AttendanceStatus>> {
  let query = supabase.from('attendance').select('player_id, attending, coach_override, toggled_by').eq('lesson_date', opts.lessonDate);
  query = opts.groupTierId ? query.eq('group_tier_id', opts.groupTierId) : query.eq('schedule_assignment_id', opts.scheduleAssignmentId!);
  const { data, error } = await query;
  if (error) { console.log('getAttendanceForDate error', error); return {}; }
  const map: Record<string, AttendanceStatus> = {};
  (data ?? []).forEach((r: any) => {
    map[r.player_id] = { attending: r.attending, coachOverride: r.coach_override, toggledBy: r.toggled_by, exists: true };
  });
  return map;
}

export function statusFor(map: Record<string, AttendanceStatus>, playerId: string): AttendanceStatus {
  return map[playerId] ?? DEFAULT_STATUS;
}

// Routes through the toggle_attendance() SECURITY DEFINER RPC — the server
// enforces the lock-after-cutoff and coach-override-always-wins rules, this
// is just a thin client wrapper, never write to the `attendance` table directly.
export async function setAttendance(opts: {
  groupTierId?: string;
  scheduleAssignmentId?: string;
  playerId: string;
  lessonDate: string;
  attending: boolean;
  actorRole: 'player' | 'parent' | 'coach';
}): Promise<{ ok: boolean; message?: string }> {
  const { error } = await supabase.rpc('toggle_attendance', {
    p_group_tier_id: opts.groupTierId ?? null,
    p_schedule_assignment_id: opts.scheduleAssignmentId ?? null,
    p_player_id: opts.playerId,
    p_lesson_date: opts.lessonDate,
    p_attending: opts.attending,
    p_actor_role: opts.actorRole,
  });
  if (error) return { ok: false, message: error.message.replace(/^.*attendance locked[^:]*:?\s*/i, '') || 'Could not update attendance.' };

  if (opts.attending === false) {
    // Best-effort side notifications — never block the toggle on these.
    notifyAttendanceSideEffects(opts).catch((e) => console.log('notifyAttendanceSideEffects error', e));
  }
  return { ok: true };
}

// Alerts the lesson's coach(es) AND the club owner (if not already one of
// those coaches — no duplicate ping) when a player/parent (not the coach)
// marks not-attending, and flags a makeup credit as available to the player
// — mirrors exactly what toggle_attendance() itself just did server-side
// (makeup_lesson_credits always for private, group_makeup_credits only when
// the club's allow_group_makeup is on), so the player finds out about it.
//
// toggle_attendance() no longer blocks a late cancellation (see
// 20260805120000_no_attendance_cutoff_lock.sql — real emergencies don't
// respect a cutoff, and clubs don't consistently enforce it anyway) — the
// club still finds out it was late, via the more urgent
// notifyPostCutoffCancellation instead of the routine notifyAttendanceChanged.
async function notifyAttendanceSideEffects(opts: {
  groupTierId?: string; scheduleAssignmentId?: string; playerId: string; lessonDate: string; actorRole: 'player' | 'parent' | 'coach';
}) {
  const { data: player } = await supabase.from('profiles').select('full_name').eq('id', opts.playerId).single();
  const playerName = player?.full_name ?? 'A player';

  const isLate = (startTime: string | null, cutoffHours: number | null) => {
    if (!startTime) return false;
    const lessonTs = new Date(`${opts.lessonDate}T${startTime}`);
    return (lessonTs.getTime() - Date.now()) < (cutoffHours ?? 24) * 3600 * 1000;
  };

  if (opts.scheduleAssignmentId) {
    const { data: sa } = await supabase.from('schedule_assignments').select('coach_id, club_id, start_time').eq('id', opts.scheduleAssignmentId).single();
    if (sa) {
      if (opts.actorRole !== 'coach') {
        const [{ data: club }, { data: settings }] = await Promise.all([
          supabase.from('clubs').select('owner_id').eq('id', sa.club_id).single(),
          supabase.from('club_settings').select('cancellation_notice_hours').eq('club_id', sa.club_id).single(),
        ]);
        const recipients = new Set([sa.coach_id, ...(club?.owner_id ? [club.owner_id] : [])]);
        const late = isLate(sa.start_time, settings?.cancellation_notice_hours ?? null);
        const label = `Private lesson today at ${formatTime12h(sa.start_time)}`;
        for (const id of recipients) {
          if (late) await notifyPostCutoffCancellation(id, playerName, label);
          else await notifyAttendanceChanged(id, playerName, 'a private lesson', false);
        }
      }
      await notifyMakeupAvailable(opts.playerId, 'a private lesson');
    }
  } else if (opts.groupTierId) {
    const [{ data: tier }, { data: coaches }, { data: slots }] = await Promise.all([
      supabase.from('group_tiers').select('club_id, name').eq('id', opts.groupTierId).single(),
      supabase.from('lesson_coaches').select('coach_id').eq('group_tier_id', opts.groupTierId).eq('role', 'main'),
      supabase.from('lesson_time_slots').select('start_time, is_recurring, day_of_week, one_time_date').eq('group_tier_id', opts.groupTierId),
    ]);
    if (tier) {
      const { data: settings } = await supabase.from('club_settings').select('cancellation_notice_hours, allow_group_makeup').eq('club_id', tier.club_id).single();
      if (opts.actorRole !== 'coach') {
        const { data: club } = await supabase.from('clubs').select('owner_id').eq('id', tier.club_id).single();
        const dow = new Date(`${opts.lessonDate}T00:00:00`).getDay();
        const matchingSlot = (slots ?? []).find((s: any) => (s.is_recurring && s.day_of_week === dow) || (!s.is_recurring && s.one_time_date === opts.lessonDate));
        const recipients = new Set([...(coaches ?? []).map((c) => c.coach_id), ...(club?.owner_id ? [club.owner_id] : [])]);
        const late = isLate(matchingSlot?.start_time ?? null, settings?.cancellation_notice_hours ?? null);
        const label = `${tier.name} today${matchingSlot?.start_time ? ` at ${formatTime12h(matchingSlot.start_time)}` : ''}`;
        for (const id of recipients) {
          if (late) await notifyPostCutoffCancellation(id, playerName, label);
          else await notifyAttendanceChanged(id, playerName, tier.name, false);
        }
      }
      if (settings?.allow_group_makeup) await notifyMakeupAvailable(opts.playerId, tier.name);
    }
  }
}

// The next calendar date (today included) that falls on the given
// day-of-week — used to turn a recurring day_of_week template into a
// concrete date for attendance toggling.
export function nextOccurrenceDate(dayOfWeek: number, from: Date = new Date()): string {
  const d = new Date(from);
  const diff = (dayOfWeek - d.getDay() + 7) % 7;
  d.setDate(d.getDate() + diff);
  return localDateStr(d);
}
