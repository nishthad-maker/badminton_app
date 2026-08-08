-- Lets a scheduled makeup lesson be marked attending/not-attending, reusing
-- the exact same attendance table + toggle_attendance() RPC as a regular
-- lesson (same lock-after-cutoff and coach-override rules) — the client
-- just calls it with the makeup's own scheduled_date instead of the
-- recurring next-occurrence date. Two real bugs that reuse would hit if
-- toggle_attendance() were left as-is:
--
-- 1. The cutoff-lock timestamp was built from the ASSIGNMENT's recurring
--    start_time (e.g. the original private lesson's usual 6pm), not the
--    makeup's own scheduled_start_time (e.g. 4pm before her group lesson
--    that day) — so the lock would fire at the wrong clock time. Now looks
--    up a matching scheduled makeup_lesson_credits/group_makeup_credits row
--    for that exact date first and uses ITS time if one exists.
-- 2. Marking not-attending unconditionally inserted a brand-new makeup
--    credit (correct on a normal lesson day) — but if the date being
--    toggled IS itself an already-scheduled makeup, that left the stale
--    credit sitting at status='scheduled' forever (still showing as
--    "confirmed" everywhere) while a second, disconnected credit was
--    created alongside it. Now sends that specific credit back to 'owed'
--    instead, so the family sees exactly one accurate "needs a slot" entry.
--
-- Full body copied verbatim from 20260727100000_phase1_data_model.sql (the
-- only/latest definition — create or replace replaces the whole function).
create or replace function public.toggle_attendance(
  p_group_tier_id uuid,
  p_schedule_assignment_id uuid,
  p_player_id uuid,
  p_lesson_date date,
  p_attending boolean,
  p_actor_role text
) returns public.attendance
language plpgsql
security definer
set search_path = public
as $$
declare
  v_club_id uuid;
  v_start_time time;
  v_makeup_start time;
  v_makeup_credit_id uuid;
  v_cutoff_hrs int;
  v_lesson_ts timestamptz;
  v_existing public.attendance;
  v_row public.attendance;
begin
  if p_actor_role not in ('player', 'parent', 'coach') then
    raise exception 'invalid actor role';
  end if;
  if p_actor_role = 'player' and p_player_id <> auth.uid() then
    raise exception 'not authorized';
  end if;
  if p_actor_role = 'parent' and not public.is_accepted_parent_of(p_player_id) then
    raise exception 'not authorized';
  end if;
  if (p_group_tier_id is null) = (p_schedule_assignment_id is null) then
    raise exception 'exactly one of group_tier_id/schedule_assignment_id is required';
  end if;

  if p_group_tier_id is not null then
    select gt.club_id into v_club_id from public.group_tiers gt where gt.id = p_group_tier_id;
    select lts.start_time into v_start_time
      from public.lesson_time_slots lts
      where lts.group_tier_id = p_group_tier_id
        and (
          (lts.is_recurring and lts.day_of_week = extract(dow from p_lesson_date)::smallint)
          or (not lts.is_recurring and lts.one_time_date = p_lesson_date)
        )
      order by lts.start_time
      limit 1;
    select id, scheduled_start_time into v_makeup_credit_id, v_makeup_start
      from public.group_makeup_credits
      where group_tier_id = p_group_tier_id and scheduled_date = p_lesson_date and status = 'scheduled';
    if v_makeup_start is not null then v_start_time := v_makeup_start; end if;
    select * into v_existing from public.attendance
      where group_tier_id = p_group_tier_id and player_id = p_player_id and lesson_date = p_lesson_date;
  else
    select sa.club_id, sa.start_time into v_club_id, v_start_time
      from public.schedule_assignments sa where sa.id = p_schedule_assignment_id;
    select id, scheduled_start_time into v_makeup_credit_id, v_makeup_start
      from public.makeup_lesson_credits
      where original_schedule_assignment_id = p_schedule_assignment_id and scheduled_date = p_lesson_date and status = 'scheduled';
    if v_makeup_start is not null then v_start_time := v_makeup_start; end if;
    select * into v_existing from public.attendance
      where schedule_assignment_id = p_schedule_assignment_id and lesson_date = p_lesson_date;
  end if;

  if v_club_id is null then
    raise exception 'lesson not found';
  end if;
  if p_actor_role = 'coach' and not public.is_club_staff(v_club_id) then
    raise exception 'not authorized';
  end if;

  if v_existing.id is not null and v_existing.coach_override and p_actor_role <> 'coach' then
    raise exception 'attendance locked by coach override';
  end if;

  select cs.cancellation_notice_hours into v_cutoff_hrs from public.club_settings cs where cs.club_id = v_club_id;
  v_cutoff_hrs := coalesce(v_cutoff_hrs, 24);

  if p_actor_role <> 'coach' and v_start_time is not null then
    v_lesson_ts := (p_lesson_date::text || ' ' || v_start_time::text)::timestamptz;
    if v_lesson_ts - now() < make_interval(hours => v_cutoff_hrs) then
      raise exception 'attendance locked: past the % hour cancellation cutoff', v_cutoff_hrs;
    end if;
  end if;

  if p_group_tier_id is not null then
    insert into public.attendance (
      club_id, group_tier_id, player_id, lesson_date, attending,
      toggled_by, toggled_by_user_id, toggled_at, coach_override, locked
    ) values (
      v_club_id, p_group_tier_id, p_player_id, p_lesson_date, p_attending,
      p_actor_role, auth.uid(), now(), (p_actor_role = 'coach'), false
    )
    on conflict (group_tier_id, player_id, lesson_date) where group_tier_id is not null
    do update set attending = excluded.attending, toggled_by = excluded.toggled_by,
      toggled_by_user_id = excluded.toggled_by_user_id, toggled_at = excluded.toggled_at,
      coach_override = public.attendance.coach_override or excluded.coach_override
    returning * into v_row;

    if not p_attending then
      if v_makeup_credit_id is not null then
        update public.group_makeup_credits
          set status = 'owed', scheduled_date = null, scheduled_start_time = null, scheduled_end_time = null, scheduled_court_id = null
          where id = v_makeup_credit_id;
      elsif exists (
        select 1 from public.club_settings cs where cs.club_id = v_club_id and cs.allow_group_makeup
      ) then
        insert into public.group_makeup_credits (player_id, group_tier_id, missed_date)
        values (p_player_id, p_group_tier_id, p_lesson_date)
        on conflict (group_tier_id, player_id, missed_date) do nothing;
      end if;
    end if;
  else
    insert into public.attendance (
      club_id, schedule_assignment_id, player_id, lesson_date, attending,
      toggled_by, toggled_by_user_id, toggled_at, coach_override, locked
    ) values (
      v_club_id, p_schedule_assignment_id, p_player_id, p_lesson_date, p_attending,
      p_actor_role, auth.uid(), now(), (p_actor_role = 'coach'), false
    )
    on conflict (schedule_assignment_id, lesson_date) where schedule_assignment_id is not null
    do update set attending = excluded.attending, toggled_by = excluded.toggled_by,
      toggled_by_user_id = excluded.toggled_by_user_id, toggled_at = excluded.toggled_at,
      coach_override = public.attendance.coach_override or excluded.coach_override
    returning * into v_row;

    if not p_attending then
      if v_makeup_credit_id is not null then
        update public.makeup_lesson_credits
          set status = 'owed', scheduled_date = null, scheduled_start_time = null, scheduled_end_time = null, scheduled_court_id = null
          where id = v_makeup_credit_id;
      else
        insert into public.makeup_lesson_credits (player_id, original_schedule_assignment_id, missed_date)
        values (p_player_id, p_schedule_assignment_id, p_lesson_date)
        on conflict (original_schedule_assignment_id, missed_date) do nothing;
      end if;
    end if;
  end if;

  return v_row;
end;
$$;

grant execute on function public.toggle_attendance(uuid, uuid, uuid, date, boolean, text) to authenticated;
