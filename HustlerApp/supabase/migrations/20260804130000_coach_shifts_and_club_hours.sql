-- Three additions, all part of the same "how does a coach actually work"
-- picture:
--   1. coach_time_off gets a third kind, 'recurring_day_off' — a whole
--      weekday blocked every week (e.g. "doesn't work Sundays"), instead of
--      the club having to fake it with a 00:00-23:59 "break".
--   2. coach_shifts — a coach's actual working hours (e.g. 9am-4pm), a
--      *positive* availability window rather than a negative one. Additive:
--      a coach with zero shift rows is unrestricted (today's behavior,
--      unchanged) — only once a club defines at least one shift for a coach
--      does "no shift on this weekday" start meaning "not working that day".
--   3. club_settings.open_time/close_time — the club's own operating hours,
--      asked once during onboarding, used as the fallback bound for the
--      parent/player "Book a Lesson" hour grid when a coach has no shift of
--      their own defined.

-- ── 1. coach_time_off: add 'recurring_day_off' ──────────────────────────
-- Drop every existing check constraint on the table and recreate them
-- explicitly named, rather than guessing the auto-generated name of the
-- unnamed compound check from 20260803200000 — safer than a name guess that
-- silently no-ops if wrong.
do $$
declare r record;
begin
  for r in select conname from pg_constraint where conrelid = 'public.coach_time_off'::regclass and contype = 'c' loop
    execute format('alter table public.coach_time_off drop constraint %I', r.conname);
  end loop;
end $$;

alter table public.coach_time_off
  add constraint coach_time_off_kind_check check (kind in ('recurring_break', 'recurring_day_off', 'days_off')),
  add constraint coach_time_off_day_of_week_check check (day_of_week is null or day_of_week between 0 and 6),
  add constraint coach_time_off_shape_check check (
    (kind = 'recurring_break' and day_of_week is not null and start_time is not null and end_time is not null
      and start_date is null and end_date is null)
    or
    (kind = 'recurring_day_off' and day_of_week is not null and start_time is null and end_time is null
      and start_date is null and end_date is null)
    or
    (kind = 'days_off' and start_date is not null and end_date is not null and end_date >= start_date
      and day_of_week is null and start_time is null and end_time is null)
  );

-- ── 2. coach_shifts ──────────────────────────────────────────────────────
create table public.coach_shifts (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete cascade,
  coach_id uuid not null references public.profiles(id) on delete cascade,
  day_of_week int not null check (day_of_week between 0 and 6),
  start_time time not null,
  end_time time not null check (end_time > start_time),
  created_at timestamptz not null default now()
);

alter table public.coach_shifts enable row level security;

-- Same access shape as coach_time_off: staff can see it, only the owner
-- can change it; players/parents with club access need read access so a
-- booking request or makeup suggestion can respect it.
create policy "club staff view, owner manages coach shifts" on public.coach_shifts
  for all using (public.is_club_staff(club_id)) with check (public.is_club_owner(club_id));

create policy "rostered player views club coach shifts" on public.coach_shifts
  for select using (public.is_rostered_player(club_id));

create policy "parents with club access view coach shifts" on public.coach_shifts
  for select using (public.is_parent_with_club_access(club_id));

-- ── 3. club_settings: open_time / close_time ────────────────────────────
-- Nullable — an already-onboarded club has neither set, and the parent
-- booking grid falls back to its existing hardcoded 8am-8pm range until the
-- club sets these from Club Settings.
alter table public.club_settings add column if not exists open_time time;
alter table public.club_settings add column if not exists close_time time;

-- ── 4. get_makeup_scheduling_context: add coachShifts ───────────────────
-- Full body copied verbatim from 20260803200000_coach_time_off.sql (the
-- current authoritative version) with one addition: a `coachShifts` array.
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
    ), '[]'::jsonb),
    'coachShifts', coalesce((
      select jsonb_agg(jsonb_build_object(
        'coachId', cs.coach_id, 'dayOfWeek', cs.day_of_week, 'startTime', cs.start_time, 'endTime', cs.end_time
      ))
      from public.coach_shifts cs where cs.club_id = v_club_id
    ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

grant execute on function public.get_makeup_scheduling_context(uuid) to authenticated;
