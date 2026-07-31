import { supabase } from './supabase';
import { notifyCancellationRequested, notifyCancellationApproved, notifyCancellationDeclined } from './notifications';

export type CancellationRequest = {
  id: string;
  scheduleAssignmentId: string;
  coachId: string;
  coachName: string;
  clubId: string;
  cancelDate: string;
  note: string | null;
  status: 'pending' | 'approved' | 'declined';
  createdAt: string;
};

// A staff coach flags a date they can't make on their own lesson — this only
// ever creates a pending request; the actual schedule_exceptions row (and
// the makeup credit it triggers) is only written once the owner approves it.
export async function requestLessonCancellation(opts: {
  scheduleAssignmentId: string; coachId: string; coachName: string; clubId: string; cancelDate: string; note?: string;
}): Promise<{ ok: boolean; message?: string }> {
  const { error } = await supabase.from('lesson_cancellation_requests').insert({
    schedule_assignment_id: opts.scheduleAssignmentId,
    coach_id: opts.coachId,
    club_id: opts.clubId,
    cancel_date: opts.cancelDate,
    note: opts.note?.trim() || null,
  });
  if (error) return { ok: false, message: 'Could not submit that request — please try again.' };

  const { data: club } = await supabase.from('clubs').select('owner_id').eq('id', opts.clubId).single();
  if (club?.owner_id) await notifyCancellationRequested(club.owner_id, opts.coachName, opts.note ? `Lesson cancellation (${opts.note})` : 'Lesson cancellation', opts.cancelDate);
  return { ok: true };
}

// Every request this coach has submitted for their own lessons at this club
// (any status) — grouped client-side by scheduleAssignmentId so each lesson
// card can show its own latest request status inline.
export async function getMyCancellationRequests(coachId: string, clubId: string): Promise<CancellationRequest[]> {
  const { data } = await supabase
    .from('lesson_cancellation_requests')
    .select('id, schedule_assignment_id, coach_id, club_id, cancel_date, note, status, created_at')
    .eq('coach_id', coachId)
    .eq('club_id', clubId)
    .order('created_at', { ascending: false });
  return (data ?? []).map((r: any) => ({
    id: r.id, scheduleAssignmentId: r.schedule_assignment_id, coachId: r.coach_id, coachName: '',
    clubId: r.club_id, cancelDate: r.cancel_date, note: r.note, status: r.status, createdAt: r.created_at,
  }));
}

export async function withdrawCancellationRequest(id: string): Promise<{ ok: boolean }> {
  const { error } = await supabase.from('lesson_cancellation_requests').delete().eq('id', id).eq('status', 'pending');
  return { ok: !error };
}

// ── Club/owner side ──────────────────────────────────────────────────────

export async function getPendingCancellationRequests(clubId: string, coachId: string): Promise<CancellationRequest[]> {
  const { data } = await supabase
    .from('lesson_cancellation_requests')
    .select('id, schedule_assignment_id, coach_id, club_id, cancel_date, note, status, created_at, profiles!lesson_cancellation_requests_coach_id_fkey(full_name)')
    .eq('club_id', clubId)
    .eq('coach_id', coachId)
    .eq('status', 'pending')
    .order('created_at', { ascending: true });
  return (data ?? []).map((r: any) => ({
    id: r.id, scheduleAssignmentId: r.schedule_assignment_id, coachId: r.coach_id, coachName: r.profiles?.full_name ?? 'Coach',
    clubId: r.club_id, cancelDate: r.cancel_date, note: r.note, status: r.status, createdAt: r.created_at,
  }));
}

export async function approveCancellationRequest(request: CancellationRequest, label: string): Promise<{ ok: boolean }> {
  const { data: { session } } = await supabase.auth.getSession();
  const { error: exError } = await supabase.from('schedule_exceptions').insert({
    schedule_assignment_id: request.scheduleAssignmentId, date: request.cancelDate, reason: 'cancelled',
  });
  if (exError) return { ok: false };
  await supabase.from('lesson_cancellation_requests').update({
    status: 'approved', reviewed_by: session?.user.id, reviewed_at: new Date().toISOString(),
  }).eq('id', request.id);
  await notifyCancellationApproved(request.coachId, label, request.cancelDate);
  return { ok: true };
}

export async function declineCancellationRequest(request: CancellationRequest, label: string): Promise<{ ok: boolean }> {
  const { data: { session } } = await supabase.auth.getSession();
  const { error } = await supabase.from('lesson_cancellation_requests').update({
    status: 'declined', reviewed_by: session?.user.id, reviewed_at: new Date().toISOString(),
  }).eq('id', request.id);
  if (error) return { ok: false };
  await notifyCancellationDeclined(request.coachId, label, request.cancelDate);
  return { ok: true };
}
