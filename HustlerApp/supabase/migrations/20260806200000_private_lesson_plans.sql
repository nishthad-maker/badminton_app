-- A private-lesson "plan": a total session-count budget (e.g. "10 lessons")
-- that a recurring weekly booking draws down against, auto-stopping once
-- exhausted. New concept — nothing like it existed anywhere in this schema
-- (confirmed: no total_sessions/sessions_remaining/package/credits column
-- on schedule_assignments or elsewhere). A non-recurring ("just this week")
-- private booking doesn't get a plan row at all — it's created exactly like
-- today's one-off schedule_assignments (plan_id null, valid_until = that date).
create table public.private_lesson_plans (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete cascade,
  player_id uuid not null references public.profiles(id) on delete cascade,
  coach_id uuid not null references public.profiles(id) on delete cascade,
  total_sessions int not null check (total_sessions > 0),
  sessions_used int not null default 0,
  is_recurring boolean not null default true,
  status text not null default 'active' check (status in ('active', 'exhausted', 'cancelled')),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.private_lesson_plans enable row level security;

create policy "club staff manage private lesson plans" on public.private_lesson_plans
  for all using (is_club_staff(club_id)) with check (is_club_staff(club_id));

-- One plan can have several linked schedule_assignments rows (one per
-- selected weekday), all sharing plan_id.
alter table public.schedule_assignments add column if not exists plan_id uuid references public.private_lesson_plans(id) on delete set null;

-- ── Daily auto-stop job ──────────────────────────────────────────────────
-- Recomputes sessions_used from scratch each run (rather than incrementing
-- day-by-day) so a missed cron run never causes drift: for every active
-- plan, counts actual calendar occurrences of its linked
-- schedule_assignments from valid_from through yesterday, excluding dates
-- with a 'cancelled'/'rescheduled' schedule_exceptions row (the existing
-- per-date "this didn't happen" marker). Once sessions_used reaches
-- total_sessions, marks the plan 'exhausted' and freezes every linked
-- schedule_assignments row's valid_until at yesterday — which is already
-- what every consumer in the app checks to stop showing/booking a
-- recurring slot, so no other code needs to know about plans at all.
create extension if not exists pg_cron;

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
      select id, day_of_week, valid_from, coalesce(valid_until, v_yesterday) as effective_until
      from public.schedule_assignments
      where plan_id = v_plan.id
    loop
      if v_assignment.valid_from > v_yesterday then continue; end if;
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

select cron.schedule('advance-private-lesson-plans', '0 1 * * *', $cron$select public.advance_private_lesson_plans();$cron$);
