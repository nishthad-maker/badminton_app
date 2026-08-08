-- A durable log of individual private-lesson sessions, one row per date a
-- plan-based recurring lesson actually happened (i.e. counted toward
-- sessions_used by advance_private_lesson_plans()). Previously that cron
-- only kept a running count, recomputed from scratch each run, so there was
-- no record of WHICH dates made up that count — just the total. This table
-- gives clubs an actual date-by-date history to show on a player's file,
-- populated as a side effect of the same cron loop, denormalized (club_id/
-- player_id/coach_id copied straight onto the row rather than only reachable
-- via joins) so a row still means something even if the plan or schedule
-- assignment it came from is later deleted.
--
-- Scope: only plan-based recurring lessons are logged here, matching what
-- the cron already tracks. One-off "just this week" private bookings have
-- no session-budget concept at all (see private_lesson_plans.sql) and stay
-- out of this table too — nothing to log against.
create table public.private_lesson_sessions (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.private_lesson_plans(id) on delete cascade,
  schedule_assignment_id uuid references public.schedule_assignments(id) on delete set null,
  club_id uuid not null references public.clubs(id) on delete cascade,
  player_id uuid not null references public.profiles(id) on delete cascade,
  coach_id uuid not null references public.profiles(id) on delete cascade,
  session_date date not null,
  created_at timestamptz not null default now(),
  unique (schedule_assignment_id, session_date)
);

alter table public.private_lesson_sessions enable row level security;

-- Read-only for clients — only the SECURITY DEFINER cron below writes here.
create policy "club staff view private lesson sessions" on public.private_lesson_sessions
  for select using (is_club_staff(club_id));

-- Same loop as before, extended to also insert one log row per date it
-- counts (idempotent via the unique constraint + on conflict do nothing —
-- safe even though the surrounding count is still recomputed from scratch
-- every run).
create or replace function public.advance_private_lesson_plans()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan record;
  v_assignment record;
  v_used int;
  v_yesterday date := (current_date - 1);
begin
  for v_plan in
    select * from public.private_lesson_plans where status = 'active'
  loop
    v_used := 0;
    for v_assignment in
      select id, coach_id, day_of_week, valid_from, coalesce(valid_until, v_yesterday) as effective_until
      from public.schedule_assignments
      where plan_id = v_plan.id
    loop
      if v_assignment.valid_from > v_yesterday then continue; end if;

      insert into public.private_lesson_sessions (plan_id, schedule_assignment_id, club_id, player_id, coach_id, session_date)
      select v_plan.id, v_assignment.id, v_plan.club_id, v_plan.player_id, v_assignment.coach_id, d::date
      from generate_series(v_assignment.valid_from, least(v_assignment.effective_until, v_yesterday), interval '1 day') as d
      where extract(dow from d)::smallint = v_assignment.day_of_week
        and not exists (
          select 1 from public.schedule_exceptions se
          where se.schedule_assignment_id = v_assignment.id
            and se.date = d::date
            and se.reason in ('cancelled', 'rescheduled')
        )
      on conflict (schedule_assignment_id, session_date) do nothing;

      v_used := v_used + (
        select count(*)
        from generate_series(v_assignment.valid_from, least(v_assignment.effective_until, v_yesterday), interval '1 day') as d
        where extract(dow from d)::smallint = v_assignment.day_of_week
          and not exists (
            select 1 from public.schedule_exceptions se
            where se.schedule_assignment_id = v_assignment.id
              and se.date = d::date
              and se.reason in ('cancelled', 'rescheduled')
          )
      );
    end loop;

    update public.private_lesson_plans set sessions_used = v_used where id = v_plan.id;

    if v_used >= v_plan.total_sessions then
      update public.private_lesson_plans set status = 'exhausted' where id = v_plan.id;
      update public.schedule_assignments
        set valid_until = v_yesterday
        where plan_id = v_plan.id and (valid_until is null or valid_until > v_yesterday);
    end if;
  end loop;
end;
$$;

-- Backfill immediately rather than waiting for tomorrow's 1am run, so
-- history shows up today for any plan that's already been running a while.
select public.advance_private_lesson_plans();
