-- Player-side club features: code-based join with club approval (separate
-- from the coach/club search-to-add flow, which stays instant), a
-- persistent player share-code for parent linking (replacing the old
-- 48-hour connect-code table), and player-facing RLS for their own private
-- lesson / group lesson schedule and roster.

-- ── 1. Player club join (request + approve, distinct from search-to-add) --

alter table public.club_settings add column player_join_code text unique
  default ('P' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 5)));
alter table public.club_settings alter column player_join_code set not null;

create table public.club_join_requests (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.profiles(id) on delete cascade,
  club_id uuid not null references public.clubs(id) on delete cascade,
  code_used text not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  requested_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references public.profiles(id) on delete set null
);

create index on public.club_join_requests (club_id);
create index on public.club_join_requests (player_id);

alter table public.club_join_requests enable row level security;

create policy "player views own join requests" on public.club_join_requests
  for select using (player_id = auth.uid());
create policy "club staff view join requests" on public.club_join_requests
  for select using (public.is_club_staff(club_id));
create policy "club staff review join requests" on public.club_join_requests
  for update using (public.is_club_staff(club_id)) with check (public.is_club_staff(club_id));

-- SECURITY DEFINER because the player only has the code, not the club_id —
-- same reasoning as request_join_club_as_coach. Creates a pending request
-- only; the club still has to approve before club_members gets a row.
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

  if exists (select 1 from public.club_members cm where cm.club_id = target.id and cm.player_id = auth.uid() and cm.status = 'active') then
    raise exception 'You''re already a member of this club.';
  end if;
  if exists (select 1 from public.club_join_requests r where r.club_id = target.id and r.player_id = auth.uid() and r.status = 'pending') then
    raise exception 'You already have a pending request to join this club.';
  end if;

  insert into public.club_join_requests (player_id, club_id, code_used) values (auth.uid(), target.id, upper(input_code));

  return query select target.id, target.name;
end;
$$;

-- ── 2. Persistent player share code for parent linking ---------------------

-- Replaces parent_link_codes (48h expiry, single-use) with one permanent
-- code per player — reduces friction for a purpose that's naturally
-- long-lived (a parent might link months after account creation), and is
-- now clearly a different *kind* of code than the club join code above
-- (personal + persistent vs. club-wide + regenerable-by-admin).
drop function if exists public.redeem_parent_link_code(text);
drop table if exists public.parent_link_codes;
drop function if exists public.can_manage_player_link(uuid);

create table public.player_share_codes (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null unique references public.profiles(id) on delete cascade,
  code text not null unique,
  created_at timestamptz not null default now()
);

alter table public.player_share_codes enable row level security;

create policy "player manages own share code" on public.player_share_codes
  for all using (player_id = auth.uid()) with check (player_id = auth.uid());

-- Recreated against the new table — same signature/behavior as before
-- (pending link, not instant), so lib/parentLink.ts's redeemCode() needs no
-- changes at all.
create function public.redeem_parent_link_code(input_code text)
returns table (player_id uuid, player_name text)
language plpgsql
security definer
set search_path = public
as $$
declare
  code_row public.player_share_codes;
  caller_role text;
  linked_player_name text;
  existing public.parent_children;
begin
  select role into caller_role from public.profiles where id = auth.uid();
  if caller_role is distinct from 'parent' then
    raise exception 'Only a Parent account can redeem a link code.';
  end if;

  select * into code_row from public.player_share_codes where code = upper(input_code);
  if code_row.id is null then
    raise exception 'That code wasn''t found. Double-check it and try again.';
  end if;

  select * into existing from public.parent_children where parent_id = auth.uid() and player_id = code_row.player_id;

  if existing.id is not null and existing.status = 'accepted' and existing.unlinked_at is null then
    raise exception 'You''re already linked to this child.';
  elsif existing.id is not null then
    update public.parent_children
    set status = 'pending', requested_at = now(), accepted_at = null, unlinked_at = null
    where id = existing.id;
  else
    insert into public.parent_children (parent_id, player_id, status, requested_at)
    values (auth.uid(), code_row.player_id, 'pending', now());
  end if;

  select full_name into linked_player_name from public.profiles where id = code_row.player_id;
  return query select code_row.player_id, coalesce(linked_player_name, 'Player');
end;
$$;

-- ── 3. Player-facing read access to their own club schedule/roster --------

create function public.is_rostered_player(target_club_id uuid)
returns boolean
language sql security definer stable set search_path = public
as $$
  select exists (select 1 from public.club_members cm where cm.player_id = auth.uid() and cm.club_id = target_club_id and cm.status = 'active');
$$;

create policy "rostered player views their club" on public.clubs
  for select using (public.is_rostered_player(id));
create policy "rostered player views club coaches" on public.club_coaches
  for select using (public.is_rostered_player(club_id));
create policy "rostered player views courts" on public.courts
  for select using (public.is_rostered_player(club_id));

create policy "player views own private lessons" on public.schedule_assignments
  for select using (player_id = auth.uid());
create policy "player views own lesson exceptions" on public.schedule_exceptions
  for select using (
    exists (select 1 from public.schedule_assignments sa where sa.id = schedule_assignment_id and sa.player_id = auth.uid())
  );

-- Scoped to tiers the player is actually enrolled in (not club-wide like
-- the parent/staff grants) — a player doesn't need to browse every other
-- group lesson in the club, just their own.
create policy "player views own group lessons" on public.group_tiers
  for select using (
    exists (select 1 from public.player_tier_assignments pta where pta.group_tier_id = group_tiers.id and pta.player_id = auth.uid())
  );
create policy "player views own group lesson slots" on public.lesson_time_slots
  for select using (
    exists (select 1 from public.player_tier_assignments pta where pta.group_tier_id = lesson_time_slots.group_tier_id and pta.player_id = auth.uid())
  );
create policy "player views own group lesson slot courts" on public.lesson_time_slot_courts
  for select using (
    exists (
      select 1 from public.lesson_time_slots lts join public.player_tier_assignments pta on pta.group_tier_id = lts.group_tier_id
      where lts.id = lesson_time_slot_courts.lesson_time_slot_id and pta.player_id = auth.uid()
    )
  );
create policy "player views own group lesson coaches" on public.lesson_coaches
  for select using (
    exists (select 1 from public.player_tier_assignments pta where pta.group_tier_id = lesson_coaches.group_tier_id and pta.player_id = auth.uid())
  );

-- The attendee-list requirement: any player enrolled in a tier can see every
-- row for that same tier (i.e. everyone else in it), not just their own —
-- self-referencing EXISTS on the same table, a standard safe RLS pattern
-- (evaluated as a semi-join, not recursive). Only ever selects player_id +
-- (joined client-side) profiles.full_name — parent_children is never
-- touched by this query, so there's no path for a parent identity to leak
-- through an attendee list.
create policy "player views tier rosters they belong to" on public.player_tier_assignments
  for select using (
    exists (
      select 1 from public.player_tier_assignments mine
      where mine.group_tier_id = player_tier_assignments.group_tier_id and mine.player_id = auth.uid()
    )
  );
