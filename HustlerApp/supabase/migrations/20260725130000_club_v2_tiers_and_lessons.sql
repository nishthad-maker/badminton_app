-- Club v2: replaces capacity-based classes/membership-plans with standing
-- group-tier assignments, a recurring-assignment + exception model for
-- private lessons, a private-lesson-only waitlist, and self-report +
-- club-approval payments. See 20260725120000_recreate_club_system.sql for
-- what this supersedes.

-- Drop the old capacity trigger/functions before dropping their table.
drop trigger if exists trg_enforce_class_group_capacity on public.schedule_assignments;
drop function if exists public.enforce_class_group_capacity();
drop function if exists public.count_class_group_enrollment(uuid);

drop table if exists public.player_memberships cascade;
drop table if exists public.membership_plans cascade;
drop table if exists public.waitlist_entries cascade;
drop table if exists public.schedule_assignments cascade;
drop table if exists public.class_groups cascade;

-- Compatible extensions to the tables we're keeping.
alter table public.clubs add column if not exists location text;

alter table public.club_settings rename column cancellation_window_hours to cancellation_notice_hours;
alter table public.club_settings drop column if exists waitlist_auto_promote;
alter table public.club_settings add column if not exists waitlist_claim_hours int not null default 24;

alter table public.club_coaches add column if not exists private_lesson_price_cents int;

-- Group tiers (standing assignment, no capacity/booking) ------------------

create table public.group_tiers (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete cascade,
  coach_id uuid references public.profiles(id) on delete set null,
  name text not null,
  day_of_week smallint not null check (day_of_week between 0 and 6),
  start_time time not null,
  created_at timestamptz not null default now()
);

create table public.player_tier_assignments (
  id uuid primary key default gen_random_uuid(),
  group_tier_id uuid not null references public.group_tiers(id) on delete cascade,
  player_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (group_tier_id, player_id)
);

create table public.group_attendance_exceptions (
  id uuid primary key default gen_random_uuid(),
  player_tier_assignment_id uuid not null references public.player_tier_assignments(id) on delete cascade,
  date date not null,
  status text not null default 'not_attending' check (status = 'not_attending'),
  created_at timestamptz not null default now(),
  unique (player_tier_assignment_id, date)
);

-- Private lessons: recurring assignment + exception model -----------------

create table public.schedule_assignments (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete cascade,
  player_id uuid not null references public.profiles(id) on delete cascade,
  coach_id uuid not null references public.profiles(id) on delete cascade,
  day_of_week smallint not null check (day_of_week between 0 and 6),
  start_time time not null,
  valid_from date not null default current_date,
  valid_until date,
  created_at timestamptz not null default now()
);

create table public.schedule_exceptions (
  id uuid primary key default gen_random_uuid(),
  schedule_assignment_id uuid not null references public.schedule_assignments(id) on delete cascade,
  date date not null,
  reason text not null check (reason in ('cancelled', 'tournament', 'rescheduled')),
  created_at timestamptz not null default now(),
  unique (schedule_assignment_id, date)
);

create table public.tournament_blocks (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.profiles(id) on delete cascade,
  start_date date not null,
  end_date date not null check (end_date >= start_date),
  created_at timestamptz not null default now()
);

create table public.makeup_lesson_credits (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.profiles(id) on delete cascade,
  original_schedule_assignment_id uuid not null references public.schedule_assignments(id) on delete cascade,
  missed_date date not null,
  status text not null default 'available' check (status in ('available', 'redeemed')),
  redeemed_date date,
  created_at timestamptz not null default now(),
  unique (original_schedule_assignment_id, missed_date)
);

-- Private-lesson-only waitlist ---------------------------------------------

create table public.waitlist_entries (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete cascade,
  coach_id uuid not null references public.profiles(id) on delete cascade,
  player_id uuid not null references public.profiles(id) on delete cascade,
  priority int not null default 0,
  status text not null default 'waiting' check (status in ('waiting', 'offered', 'claimed', 'expired', 'converted')),
  offered_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

-- Self-report + club-approval payments -------------------------------------

create table public.lesson_payments (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete cascade,
  player_id uuid not null references public.profiles(id) on delete cascade,
  related_to text not null check (related_to in ('private_lesson', 'group_tier')),
  schedule_assignment_id uuid references public.schedule_assignments(id) on delete set null,
  player_tier_assignment_id uuid references public.player_tier_assignments(id) on delete set null,
  payment_status text not null default 'unpaid' check (payment_status in ('unpaid', 'pending', 'paid', 'rejected')),
  payment_method text check (payment_method in ('cash', 'card', 'e_transfer', 'other')),
  payment_proof_url text,
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

-- Parent <-> player linking (schema only this pass, no UI yet) ------------

create table public.parent_children (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid not null references public.profiles(id) on delete cascade,
  player_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (parent_id, player_id)
);

-- Indexes -------------------------------------------------------------------

create index on public.group_tiers (club_id);
create index on public.group_tiers (coach_id);
create index on public.player_tier_assignments (player_id);
create index on public.group_attendance_exceptions (player_tier_assignment_id);
create index on public.schedule_assignments (club_id);
create index on public.schedule_assignments (coach_id);
create index on public.schedule_assignments (player_id);
create index on public.schedule_exceptions (schedule_assignment_id);
create index on public.tournament_blocks (player_id);
create index on public.makeup_lesson_credits (player_id);
create index on public.waitlist_entries (club_id, coach_id, priority);
create index on public.lesson_payments (club_id);
create index on public.lesson_payments (player_id);
create index on public.parent_children (parent_id);

-- Tournament auto-block: generate exceptions + makeup credits -------------

create function public.generate_tournament_exceptions()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  assignment record;
  d date;
begin
  for assignment in
    select * from public.schedule_assignments
    where player_id = new.player_id
      and valid_from <= new.end_date
      and (valid_until is null or valid_until >= new.start_date)
  loop
    d := new.start_date;
    while d <= new.end_date loop
      if extract(dow from d)::smallint = assignment.day_of_week then
        insert into public.schedule_exceptions (schedule_assignment_id, date, reason)
        values (assignment.id, d, 'tournament')
        on conflict (schedule_assignment_id, date) do nothing;

        insert into public.makeup_lesson_credits (player_id, original_schedule_assignment_id, missed_date)
        values (new.player_id, assignment.id, d)
        on conflict (original_schedule_assignment_id, missed_date) do nothing;
      end if;
      d := d + 1;
    end loop;
  end loop;
  return new;
end;
$$;

create trigger trg_generate_tournament_exceptions
  after insert on public.tournament_blocks
  for each row execute function public.generate_tournament_exceptions();

-- RLS -------------------------------------------------------------------

alter table public.group_tiers enable row level security;
alter table public.player_tier_assignments enable row level security;
alter table public.group_attendance_exceptions enable row level security;
alter table public.schedule_assignments enable row level security;
alter table public.schedule_exceptions enable row level security;
alter table public.tournament_blocks enable row level security;
alter table public.makeup_lesson_credits enable row level security;
alter table public.waitlist_entries enable row level security;
alter table public.lesson_payments enable row level security;
alter table public.parent_children enable row level security;

-- group_tiers: owner sees/manages all in their club; a teaching coach only sees their own.
create policy "owner or teaching coach views tiers" on public.group_tiers
  for select using (public.is_club_owner(club_id) or coach_id = auth.uid());
create policy "owner creates tiers" on public.group_tiers
  for insert with check (public.is_club_owner(club_id));
create policy "owner updates tiers" on public.group_tiers
  for update using (public.is_club_owner(club_id)) with check (public.is_club_owner(club_id));
create policy "owner deletes tiers" on public.group_tiers
  for delete using (public.is_club_owner(club_id));

create policy "owner or teaching coach views tier rosters" on public.player_tier_assignments
  for select using (
    exists (select 1 from public.group_tiers gt where gt.id = group_tier_id and (public.is_club_owner(gt.club_id) or gt.coach_id = auth.uid()))
  );
create policy "owner manages tier rosters" on public.player_tier_assignments
  for insert with check (
    exists (select 1 from public.group_tiers gt where gt.id = group_tier_id and public.is_club_owner(gt.club_id))
  );
create policy "owner deletes tier rosters" on public.player_tier_assignments
  for delete using (
    exists (select 1 from public.group_tiers gt where gt.id = group_tier_id and public.is_club_owner(gt.club_id))
  );

create policy "owner or teaching coach views attendance" on public.group_attendance_exceptions
  for select using (
    exists (
      select 1 from public.player_tier_assignments pta join public.group_tiers gt on gt.id = pta.group_tier_id
      where pta.id = player_tier_assignment_id and (public.is_club_owner(gt.club_id) or gt.coach_id = auth.uid())
    )
  );
create policy "owner manages attendance" on public.group_attendance_exceptions
  for all using (
    exists (
      select 1 from public.player_tier_assignments pta join public.group_tiers gt on gt.id = pta.group_tier_id
      where pta.id = player_tier_assignment_id and public.is_club_owner(gt.club_id)
    )
  ) with check (
    exists (
      select 1 from public.player_tier_assignments pta join public.group_tiers gt on gt.id = pta.group_tier_id
      where pta.id = player_tier_assignment_id and public.is_club_owner(gt.club_id)
    )
  );

-- schedule_assignments (private lessons): owner sees all, a coach only their own.
create policy "owner or own coach views lessons" on public.schedule_assignments
  for select using (public.is_club_owner(club_id) or coach_id = auth.uid());
create policy "owner or own coach creates lessons" on public.schedule_assignments
  for insert with check (public.is_club_owner(club_id) or coach_id = auth.uid());
create policy "owner or own coach updates lessons" on public.schedule_assignments
  for update using (public.is_club_owner(club_id) or coach_id = auth.uid()) with check (public.is_club_owner(club_id) or coach_id = auth.uid());
create policy "owner or own coach deletes lessons" on public.schedule_assignments
  for delete using (public.is_club_owner(club_id) or coach_id = auth.uid());

create policy "owner or own coach manages lesson exceptions" on public.schedule_exceptions
  for all using (
    exists (select 1 from public.schedule_assignments sa where sa.id = schedule_assignment_id and (public.is_club_owner(sa.club_id) or sa.coach_id = auth.uid()))
  ) with check (
    exists (select 1 from public.schedule_assignments sa where sa.id = schedule_assignment_id and (public.is_club_owner(sa.club_id) or sa.coach_id = auth.uid()))
  );

create policy "owner or coach with lessons manages tournament blocks" on public.tournament_blocks
  for all using (
    exists (select 1 from public.schedule_assignments sa where sa.player_id = tournament_blocks.player_id and (public.is_club_owner(sa.club_id) or sa.coach_id = auth.uid()))
  ) with check (
    exists (select 1 from public.schedule_assignments sa where sa.player_id = tournament_blocks.player_id and (public.is_club_owner(sa.club_id) or sa.coach_id = auth.uid()))
  );

create policy "owner or own coach views makeup credits" on public.makeup_lesson_credits
  for select using (
    exists (select 1 from public.schedule_assignments sa where sa.id = original_schedule_assignment_id and (public.is_club_owner(sa.club_id) or sa.coach_id = auth.uid()))
  );
create policy "owner or own coach updates makeup credits" on public.makeup_lesson_credits
  for update using (
    exists (select 1 from public.schedule_assignments sa where sa.id = original_schedule_assignment_id and (public.is_club_owner(sa.club_id) or sa.coach_id = auth.uid()))
  ) with check (
    exists (select 1 from public.schedule_assignments sa where sa.id = original_schedule_assignment_id and (public.is_club_owner(sa.club_id) or sa.coach_id = auth.uid()))
  );

create policy "owner or own coach manages waitlist" on public.waitlist_entries
  for all using (public.is_club_owner(club_id) or coach_id = auth.uid()) with check (public.is_club_owner(club_id) or coach_id = auth.uid());

-- lesson_payments: club owner only (coaches don't get billing visibility).
create policy "owner manages payments" on public.lesson_payments
  for all using (public.is_club_owner(club_id)) with check (public.is_club_owner(club_id));

-- parent_children: scaffolded for phase 2, parent manages their own links.
create policy "parent manages own children links" on public.parent_children
  for all using (parent_id = auth.uid()) with check (parent_id = auth.uid());
