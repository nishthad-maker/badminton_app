-- Club-set coach off-time (recurring breaks + date-range days off), a
-- coach-join notification for the club owner (there was none at all
-- before), and wiring both the "REQUEST A LESSON" open-slot check and the
-- makeup-credit suggestion algorithm to respect off-time.

-- ── 1. coach_time_off ────────────────────────────────────────────────────
-- Two kinds in one table (same discriminator pattern as lesson_payments.
-- related_to): a weekly recurring break (day_of_week + start/end time), or
-- a one-off date range (vacation). Exactly one shape of columns populated
-- per kind, enforced by the check constraint.
create table public.coach_time_off (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete cascade,
  coach_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('recurring_break', 'days_off')),
  day_of_week int check (day_of_week between 0 and 6),
  start_time time,
  end_time time,
  start_date date,
  end_date date,
  label text,
  created_at timestamptz not null default now(),
  check (
    (kind = 'recurring_break' and day_of_week is not null and start_time is not null and end_time is not null
      and start_date is null and end_date is null)
    or
    (kind = 'days_off' and start_date is not null and end_date is not null and end_date >= start_date
      and day_of_week is null and start_time is null and end_time is null)
  )
);

alter table public.coach_time_off enable row level security;

-- Same shape as club_coaches' own roster policy: staff can see it, only the
-- owner can change it — "so club can set that up" per the request.
create policy "club staff view, owner manages coach time off" on public.coach_time_off
  for all using (public.is_club_staff(club_id)) with check (public.is_club_owner(club_id));

-- Players and parents booking a slot/makeup need to read this too, to avoid
-- offering a time the coach isn't actually available at — mirrors the
-- existing "rostered player views club coaches" / "parents with club access
-- view coaches" policies on club_coaches itself.
create policy "rostered player views club coach time off" on public.coach_time_off
  for select using (public.is_rostered_player(club_id));

create policy "parents with club access view coach time off" on public.coach_time_off
  for select using (public.is_parent_with_club_access(club_id));

-- ── 2. Coach-join notification — there was none before ─────────────────
-- Only the club_coaches insert changed here (adds the notification); the
-- rest of the function body is unchanged from 20260726100000.
-- DROP+CREATE instead of CREATE OR REPLACE: the live function's OUT
-- parameters don't match what CREATE OR REPLACE will tolerate (Postgres
-- error 42P13), so replace it outright rather than trying to reconcile an
-- unknown live signature.
drop function if exists public.request_join_club_as_coach(text);
create function public.request_join_club_as_coach(input_code text)
returns table (club_id uuid, club_name text)
language plpgsql
security definer
set search_path = public
as $$
declare
  target public.clubs;
  caller_role text;
  caller_name text;
  v_already_member boolean;
begin
  select role into caller_role from public.profiles where id = auth.uid();
  if caller_role is distinct from 'coach' then
    raise exception 'Only a Coach account can join a club this way.';
  end if;

  select c.* into target
  from public.clubs c
  join public.club_settings cs on cs.club_id = c.id
  where cs.coach_join_code = upper(input_code);

  if target.id is null then
    raise exception 'That code wasn''t found. Double-check it and try again.';
  end if;

  select exists (
    select 1 from public.club_coaches where club_id = target.id and coach_id = auth.uid()
  ) into v_already_member;

  insert into public.club_coaches (club_id, coach_id, role, status)
  values (target.id, auth.uid(), 'staff', 'pending')
  on conflict (club_id, coach_id) do nothing;

  if not v_already_member and target.owner_id is not null and not exists (
    select 1 from public.notification_preferences np
    where np.user_id = target.owner_id and np.category = 'club' and np.enabled = false
  ) then
    select full_name into caller_name from public.profiles where id = auth.uid();
    insert into public.notifications (user_id, type, category, title, body, screen)
    values (
      target.owner_id, 'club_coach_join_request', 'club',
      '🏸 A coach wants to join',
      coalesce(caller_name, 'A coach') || ' requested to join ' || target.name || ' as a coach.',
      '(club-admin)/club-settings'
    );
  end if;

  return query select target.id, target.name;
end;
$$;

-- ── 3. Wire off-time into makeup-credit suggestions ─────────────────────
-- Full body copied verbatim from 20260803120000_parent_calendar_and_assignments.sql
-- (the current authoritative version — create or replace replaces the whole
-- function) with one addition: a `coachTimeOff` array in the JSON payload.
create or replace function public.get_makeup_scheduling_context(p_credit_id uuid)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_credit record;
  v_assignment record;
  v_club_id uuid;
  v_result jsonb;
begin
  select * into v_credit from public.makeup_lesson_credits where id = p_credit_id;
  if not found then
    raise exception 'Makeup credit not found';
  end if;

  select * into v_assignment from public.schedule_assignments where id = v_credit.original_schedule_assignment_id;
  if not found then
    raise exception 'Original lesson not found';
  end if;

  if not (
    v_credit.player_id = auth.uid()
    or public.is_accepted_parent_of(v_credit.player_id)
    or public.is_club_owner(v_assignment.club_id)
    or v_assignment.coach_id = auth.uid()
  ) then
    raise exception 'Not authorized';
  end if;

  v_club_id := v_assignment.club_id;

  select jsonb_build_object(
    'original', jsonb_build_object(
      'coachId', v_assignment.coach_id,
      'courtId', v_assignment.court_id,
      'startTime', v_assignment.start_time,
      'endTime', v_assignment.end_time,
      'missedDate', v_credit.missed_date
    ),
    'coaches', coalesce((
      select jsonb_agg(jsonb_build_object('id', cc.coach_id, 'fullName', p.full_name))
      from public.club_coaches cc
      join public.profiles p on p.id = cc.coach_id
      where cc.club_id = v_club_id and cc.status = 'active'
    ), '[]'::jsonb),
    'courts', coalesce((
      select jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name))
      from public.courts c where c.club_id = v_club_id
    ), '[]'::jsonb),
    'privateLessons', coalesce((
      select jsonb_agg(jsonb_build_object(
        'coachId', sa.coach_id, 'courtId', sa.court_id, 'dayOfWeek', sa.day_of_week,
        'startTime', sa.start_time, 'endTime', sa.end_time
      ))
      from public.schedule_assignments sa where sa.club_id = v_club_id
    ), '[]'::jsonb),
    'groupSlots', coalesce((
      select jsonb_agg(jsonb_build_object(
        'coachIds', slot_coaches.coach_ids, 'courtIds', slot_courts.court_ids,
        'dayOfWeek', lts.day_of_week, 'startTime', lts.start_time, 'endTime', lts.end_time,
        'isRecurring', lts.is_recurring, 'oneTimeDate', lts.one_time_date
      ))
      from public.lesson_time_slots lts
      join public.group_tiers gt on gt.id = lts.group_tier_id
      cross join lateral (
        select coalesce(jsonb_agg(lc.coach_id), '[]'::jsonb) as coach_ids
        from public.lesson_coaches lc where lc.group_tier_id = gt.id
      ) slot_coaches
      cross join lateral (
        select coalesce(jsonb_agg(ltsc.court_id), '[]'::jsonb) as court_ids
        from public.lesson_time_slot_courts ltsc where ltsc.lesson_time_slot_id = lts.id
      ) slot_courts
      where gt.club_id = v_club_id
    ), '[]'::jsonb),
    'oneOffBookings', coalesce((
      select jsonb_agg(x) from (
        select jsonb_build_object(
          'coachId', sa2.coach_id, 'courtId', mlc.scheduled_court_id, 'date', mlc.scheduled_date,
          'startTime', mlc.scheduled_start_time, 'endTime', mlc.scheduled_end_time
        ) as x
        from public.makeup_lesson_credits mlc
        join public.schedule_assignments sa2 on sa2.id = mlc.original_schedule_assignment_id
        where sa2.club_id = v_club_id and mlc.status in ('scheduled', 'pending_approval', 'proposed') and mlc.scheduled_date is not null
        union all
        select jsonb_build_object(
          'coachId', lc3.coach_id, 'courtId', gmc.scheduled_court_id, 'date', gmc.scheduled_date,
          'startTime', gmc.scheduled_start_time, 'endTime', gmc.scheduled_end_time
        ) as x
        from public.group_makeup_credits gmc
        join public.group_tiers gt2 on gt2.id = gmc.group_tier_id
        join public.lesson_coaches lc3 on lc3.group_tier_id = gt2.id
        where gt2.club_id = v_club_id and gmc.status in ('scheduled', 'pending_approval', 'proposed') and gmc.scheduled_date is not null
      ) x
    ), '[]'::jsonb),
    'tournamentBlocks', coalesce((
      select jsonb_agg(jsonb_build_object('startDate', tb.start_date, 'endDate', tb.end_date))
      from public.tournament_blocks tb where tb.player_id = v_credit.player_id
    ), '[]'::jsonb),
    'coachTimeOff', coalesce((
      select jsonb_agg(jsonb_build_object(
        'coachId', cto.coach_id, 'kind', cto.kind, 'dayOfWeek', cto.day_of_week,
        'startTime', cto.start_time, 'endTime', cto.end_time,
        'startDate', cto.start_date, 'endDate', cto.end_date
      ))
      from public.coach_time_off cto where cto.club_id = v_club_id
    ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

grant execute on function public.get_makeup_scheduling_context(uuid) to authenticated;
