-- Root-caused the "duplicate makeup slot" bug reported on the player
-- calendar (same missed date listed twice): approveScheduleRequest in
-- (club-admin)/club-calendar.tsx did the reschedule as two separate,
-- unguarded client calls — insert the new schedule_assignments row, then
-- delete the old one keyed by replaces_schedule_assignment_id, with the
-- delete's `error` never even checked. If that second call didn't complete
-- (closed app, dropped connection, anything), the old recurring lesson row
-- was left with valid_until still null — permanently "active" alongside the
-- new one. Both rows then independently generate a missed-lesson makeup
-- credit for the same real-world Monday, which is exactly the duplicate
-- "needs a makeup slot (missed October 26, 2026)" row seen on screen.
--
-- Fix is an atomic RPC (same security-definer pattern as toggle_attendance,
-- request_join_club_as_coach) so insert+delete+status-update either all
-- happen or none do — see the client-side call site swap in this same
-- batch of work.
create or replace function public.approve_schedule_request(p_request_id uuid, p_coach_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.schedule_requests;
begin
  select * into v_request from public.schedule_requests where id = p_request_id and status = 'pending';
  if not found then
    raise exception 'Request not found or already reviewed';
  end if;
  if not public.is_club_staff(v_request.club_id) then
    raise exception 'not authorized';
  end if;

  insert into public.schedule_assignments (club_id, player_id, coach_id, day_of_week, start_time, end_time, valid_from)
  values (v_request.club_id, v_request.child_id, p_coach_id, v_request.day_of_week, v_request.start_time, v_request.end_time, current_date);

  if v_request.replaces_schedule_assignment_id is not null then
    delete from public.schedule_assignments where id = v_request.replaces_schedule_assignment_id;
  end if;

  update public.schedule_requests set status = 'approved', reviewed_by = auth.uid(), reviewed_at = now()
  where id = p_request_id;
end;
$$;

grant execute on function public.approve_schedule_request(uuid, uuid) to authenticated;

-- ── One-time cleanup of the specific duplicate this already produced ────
-- schedule_assignment f6925ec7 (Mon 4:00-5:00pm, valid_from 2026-07-28) was
-- left dangling when it was replaced by 78d514d6 (Mon 4:00-5:30pm,
-- valid_from 2026-08-04) — closing it off so it stops generating any more
-- duplicate credits, and dropping the one duplicate 'owed' credit it had
-- already produced for the same missed Monday the replacement assignment
-- also has an 'owed' row for (2026-10-26). Not touching the other
-- old-assignment credit (2026-10-19, status 'scheduled') since a real
-- makeup slot may already be booked against it — needs a human look, not a
-- silent delete.
update public.schedule_assignments set valid_until = '2026-08-03'
where id = 'f6925ec7-4a61-46ac-90d2-d37ff142eabc' and valid_until is null;

delete from public.makeup_lesson_credits
where id = 'cab30186-e2a6-47c6-87fc-3b8247a6d46f' and status = 'owed';
