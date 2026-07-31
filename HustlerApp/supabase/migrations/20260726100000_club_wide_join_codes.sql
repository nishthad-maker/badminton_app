-- Reverses direction of "joining a club": instead of the club searching for
-- (or redeeming a person's code for) a coach/player, each club has its OWN
-- two share-anywhere codes — one for coaches, one for players — prefixed C/
-- P so they're visually distinguishable. A coach or player enters the
-- club's code from their own profile to REQUEST membership; the owner
-- approves or rejects. This is deliberately NOT trust-first like the
-- person-to-person codes, since one club code can spread far more widely
-- than a code one specific person handed to one specific club.

-- Two long-lived, regenerable codes per club. Volatile defaults are
-- evaluated per-row by ALTER TABLE ... ADD COLUMN, so existing clubs each
-- get their own distinct code, not one shared value.
alter table public.club_settings add column coach_join_code text unique
  default ('C' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 5)));
alter table public.club_settings add column player_join_code text unique
  default ('P' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 5)));
alter table public.club_settings alter column coach_join_code set not null;
alter table public.club_settings alter column player_join_code set not null;

-- Pending/active gate on club_coaches. Existing rows default to 'active' so
-- already-approved coaches (added via the flows this migration removes)
-- keep working unaffected.
alter table public.club_coaches add column status text not null default 'active'
  check (status in ('pending', 'active'));

-- New: general club membership for players (previously players only ever
-- existed via a specific tier/lesson assignment — there was no "is this
-- player affiliated with this club at all" concept).
create table public.club_members (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete cascade,
  player_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'active')),
  created_at timestamptz not null default now(),
  unique (club_id, player_id)
);

create index on public.club_members (club_id);
create index on public.club_members (player_id);

alter table public.club_members enable row level security;

create policy "owner manages club members" on public.club_members
  for all using (public.is_club_owner(club_id)) with check (public.is_club_owner(club_id));

create policy "player views own membership" on public.club_members
  for select using (player_id = auth.uid());

create policy "player leaves club" on public.club_members
  for delete using (player_id = auth.uid());

-- is_club_owner/is_club_staff must only count ACTIVE rows now — otherwise a
-- still-pending coach would already pass every is_club_staff-gated check
-- across the whole club-admin section before ever being approved.
create or replace function public.is_club_staff(target_club_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.club_coaches
    where club_id = target_club_id and coach_id = auth.uid() and status = 'active'
  );
$$;

create or replace function public.is_club_owner(target_club_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.club_coaches
    where club_id = target_club_id and coach_id = auth.uid() and role = 'owner' and status = 'active'
  );
$$;

-- A coach requests to join by entering the club's coach code. Runs as
-- SECURITY DEFINER because the caller doesn't know the club_id up front
-- (only the code) and there's no public "look up a club by its join code"
-- policy to avoid — same reasoning as resolve_connect_code.
create function public.request_join_club_as_coach(input_code text)
returns table (club_id uuid, club_name text)
language plpgsql
security definer
set search_path = public
as $$
declare
  target public.clubs;
  caller_role text;
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

  insert into public.club_coaches (club_id, coach_id, role, status)
  values (target.id, auth.uid(), 'staff', 'pending')
  on conflict (club_id, coach_id) do nothing;

  return query select target.id, target.name;
end;
$$;

-- Same for a player requesting general club membership.
create function public.request_join_club_as_player(input_code text)
returns table (club_id uuid, club_name text)
language plpgsql
security definer
set search_path = public
as $$
declare
  target public.clubs;
  caller_role text;
begin
  select role into caller_role from public.profiles where id = auth.uid();
  if caller_role is distinct from 'player' then
    raise exception 'Only a Player account can join a club this way.';
  end if;

  select c.* into target
  from public.clubs c
  join public.club_settings cs on cs.club_id = c.id
  where cs.player_join_code = upper(input_code);

  if target.id is null then
    raise exception 'That code wasn''t found. Double-check it and try again.';
  end if;

  insert into public.club_members (club_id, player_id, status)
  values (target.id, auth.uid(), 'pending')
  on conflict (club_id, player_id) do nothing;

  return query select target.id, target.name;
end;
$$;
