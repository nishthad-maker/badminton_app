-- Recreate the Club admin system (see 20260718160000_teardown_club_system.sql for the prior removal).
-- Fresh reconstruction under the same table/function names; player_memberships uses a manual
-- self-report + admin-approval payment flow instead of the previous Stripe fields.

alter table public.profiles
  add column if not exists role text not null default 'player'
  check (role in ('player', 'coach', 'club', 'parent'));

update public.profiles set role = 'coach' where is_coach = true and role = 'player';

create table public.clubs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

create table public.club_settings (
  club_id uuid primary key references public.clubs(id) on delete cascade,
  cancellation_window_hours int not null default 24,
  waitlist_auto_promote boolean not null default true,
  updated_at timestamptz not null default now()
);

create table public.club_coaches (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete cascade,
  coach_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'staff' check (role in ('owner', 'staff')),
  created_at timestamptz not null default now(),
  unique (club_id, coach_id)
);

create table public.class_groups (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete cascade,
  coach_id uuid references public.profiles(id) on delete set null,
  name text not null,
  description text,
  day_of_week smallint not null check (day_of_week between 0 and 6),
  start_time time not null,
  end_time time not null,
  capacity int not null check (capacity > 0),
  created_at timestamptz not null default now()
);

create table public.schedule_assignments (
  id uuid primary key default gen_random_uuid(),
  class_group_id uuid not null references public.class_groups(id) on delete cascade,
  player_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'active' check (status in ('active', 'cancelled')),
  enrolled_at timestamptz not null default now(),
  unique (class_group_id, player_id)
);

create table public.waitlist_entries (
  id uuid primary key default gen_random_uuid(),
  class_group_id uuid not null references public.class_groups(id) on delete cascade,
  player_id uuid not null references public.profiles(id) on delete cascade,
  priority int not null default 0,
  status text not null default 'waiting' check (status in ('waiting', 'promoted', 'expired')),
  created_at timestamptz not null default now(),
  unique (class_group_id, player_id)
);

create table public.membership_plans (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete cascade,
  class_group_id uuid references public.class_groups(id) on delete set null,
  name text not null,
  price_cents int not null default 0,
  billing_interval text not null check (billing_interval in ('one_time', 'weekly', 'monthly', 'term')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.player_memberships (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.profiles(id) on delete cascade,
  club_id uuid not null references public.clubs(id) on delete cascade,
  membership_plan_id uuid not null references public.membership_plans(id) on delete cascade,
  status text not null default 'active' check (status in ('active', 'cancelled', 'expired')),
  payment_status text not null default 'unpaid' check (payment_status in ('unpaid', 'pending', 'paid')),
  payment_method text check (payment_method in ('cash', 'card', 'e_transfer', 'other')),
  payment_proof_url text,
  marked_paid_by uuid references public.profiles(id) on delete set null,
  marked_paid_at timestamptz,
  created_at timestamptz not null default now()
);

create index on public.club_coaches (coach_id);
create index on public.class_groups (club_id);
create index on public.schedule_assignments (player_id);
create index on public.waitlist_entries (class_group_id, priority);
create index on public.membership_plans (club_id);
create index on public.player_memberships (club_id);
create index on public.player_memberships (player_id);

-- RLS helpers --------------------------------------------------------------

create function public.is_club_staff(target_club_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.club_coaches
    where club_id = target_club_id and coach_id = auth.uid()
  );
$$;

create function public.is_club_owner(target_club_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.club_coaches
    where club_id = target_club_id and coach_id = auth.uid() and role = 'owner'
  );
$$;

create function public.count_class_group_enrollment(target_class_group_id uuid)
returns int
language sql
security definer
stable
set search_path = public
as $$
  select count(*)::int from public.schedule_assignments
  where class_group_id = target_class_group_id and status = 'active';
$$;

create function public.enforce_class_group_capacity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  class_capacity int;
  current_count int;
begin
  if new.status <> 'active' then
    return new;
  end if;

  select capacity into class_capacity from public.class_groups where id = new.class_group_id;
  select public.count_class_group_enrollment(new.class_group_id) into current_count;

  if current_count >= class_capacity then
    raise exception 'class_group % is at capacity', new.class_group_id
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

create trigger trg_enforce_class_group_capacity
  before insert on public.schedule_assignments
  for each row execute function public.enforce_class_group_capacity();

-- RLS ------------------------------------------------------------------

alter table public.clubs enable row level security;
alter table public.club_settings enable row level security;
alter table public.club_coaches enable row level security;
alter table public.class_groups enable row level security;
alter table public.schedule_assignments enable row level security;
alter table public.waitlist_entries enable row level security;
alter table public.membership_plans enable row level security;
alter table public.player_memberships enable row level security;

create policy "club staff manage their club" on public.clubs
  for all using (public.is_club_staff(id)) with check (public.is_club_owner(id));

create policy "anyone authenticated can create a club" on public.clubs
  for insert with check (auth.uid() = owner_id);

create policy "club staff manage settings" on public.club_settings
  for all using (public.is_club_staff(club_id)) with check (public.is_club_staff(club_id));

create policy "club staff manage roster" on public.club_coaches
  for all using (public.is_club_staff(club_id)) with check (public.is_club_owner(club_id));

create policy "owner bootstraps first coach row" on public.club_coaches
  for insert with check (
    coach_id = auth.uid()
    and exists (select 1 from public.clubs c where c.id = club_id and c.owner_id = auth.uid())
  );

create policy "club staff manage classes" on public.class_groups
  for all using (public.is_club_staff(club_id)) with check (public.is_club_staff(club_id));

create policy "club staff manage enrollments" on public.schedule_assignments
  for all using (
    exists (select 1 from public.class_groups cg where cg.id = class_group_id and public.is_club_staff(cg.club_id))
  ) with check (
    exists (select 1 from public.class_groups cg where cg.id = class_group_id and public.is_club_staff(cg.club_id))
  );

create policy "club staff manage waitlist" on public.waitlist_entries
  for all using (
    exists (select 1 from public.class_groups cg where cg.id = class_group_id and public.is_club_staff(cg.club_id))
  ) with check (
    exists (select 1 from public.class_groups cg where cg.id = class_group_id and public.is_club_staff(cg.club_id))
  );

create policy "club staff manage plans" on public.membership_plans
  for all using (public.is_club_staff(club_id)) with check (public.is_club_staff(club_id));

create policy "club staff manage memberships" on public.player_memberships
  for all using (public.is_club_staff(club_id)) with check (public.is_club_staff(club_id));
