import { supabase } from './supabase';
import { localDateStr } from './scheduling';

export type PrivateSlotDraft = {
  coachId: string | null;
  day: number;
  start: string;
  end: string;
  isRecurring: boolean;
  oneTimeDate: string | null;
  courtId: string | null;
};

const todayStr = () => localDateStr(new Date());

// Shared with tiers.tsx's own private-lesson creation (the "fast form" path,
// not the 3-step first-time wizard) — extracted here so the two new
// Group/Private enrollment entry points (the walk-in New Player modal and
// the join-request approval modal, both in dashboard.tsx) don't duplicate
// this insert shape. tiers.tsx's own saveSchedule is left untouched; it
// also does court-conflict checking with an interactive confirm dialog,
// which this plain lib function deliberately doesn't — callers here are
// short modals, not worth the extra UI round-trip for an advisory warning.
export async function createPrivateLessonSlots(
  clubId: string, playerId: string, slots: PrivateSlotDraft[]
): Promise<{ ok: boolean; message?: string }> {
  if (slots.length === 0) return { ok: false, message: 'Add at least one time slot.' };
  for (const slot of slots) {
    if (!slot.coachId) return { ok: false, message: 'Pick a coach for every time slot.' };
    if (!slot.start || !slot.end || slot.start >= slot.end) return { ok: false, message: 'Pick a start and end time, with end after start, for every slot.' };
    if (!slot.isRecurring && !slot.oneTimeDate) return { ok: false, message: 'One-time slots need a date picked.' };
  }

  const rows = slots.map((slot) => {
    const date = slot.isRecurring ? todayStr() : (slot.oneTimeDate ?? todayStr());
    const day = slot.isRecurring || !slot.oneTimeDate ? slot.day : new Date(`${slot.oneTimeDate}T00:00:00`).getDay();
    return {
      club_id: clubId,
      player_id: playerId,
      coach_id: slot.coachId,
      day_of_week: day,
      start_time: slot.start,
      end_time: slot.end,
      valid_from: date,
      valid_until: slot.isRecurring ? null : date,
      is_recurring: slot.isRecurring,
      court_id: slot.courtId,
    };
  });

  const { data: created, error } = await supabase.from('schedule_assignments').insert(rows).select('id, coach_id, valid_from, is_recurring');
  if (error) return { ok: false, message: 'Could not schedule the lesson(s).' };

  // One-off slots have no plan/cron behind them, so they're logged to
  // history right here — same as enroll-private.tsx's one-off path — so a
  // walk-in or join-approval one-off booking shows up too, not just ones
  // made through the main wizard.
  const sessionRows = (created ?? [])
    .filter((r: any) => !r.is_recurring)
    .map((r: any) => ({
      plan_id: null, schedule_assignment_id: r.id, club_id: clubId, player_id: playerId,
      coach_id: r.coach_id, session_date: r.valid_from,
    }));
  if (sessionRows.length) await supabase.from('private_lesson_sessions').insert(sessionRows);

  return { ok: true };
}
