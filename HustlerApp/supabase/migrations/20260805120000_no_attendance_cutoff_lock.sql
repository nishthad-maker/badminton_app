-- The 24-hour (or whatever the club set) cancellation cutoff used to
-- outright BLOCK a player/parent from toggling attendance at all once
-- inside that window ("attendance locked: past the N hour cancellation
-- cutoff") — real emergencies don't respect a cutoff, and clubs don't
-- consistently enforce the policy anyway, so a hard block was just
-- friction. Attendance can now be toggled any time; the club still learns
-- about a genuinely late cancellation (see notifyPostCutoffCancellation,
-- wired into lib/attendance.ts's side-effect notification instead of
-- lib/attendance.ts silently blocking it).
--
-- Full body copied verbatim from 20260803230000_makeup_attendance_toggle.sql
-- (the latest definition — create or replace replaces the whole function),
-- with only the cutoff-lock raise removed.
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

  -- Cancellation cutoff is no longer enforced here — a player/parent can
  -- always toggle attendance. The club still finds out when it was late;
  -- see notifyPostCutoffCancellation in lib/attendance.ts.

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
