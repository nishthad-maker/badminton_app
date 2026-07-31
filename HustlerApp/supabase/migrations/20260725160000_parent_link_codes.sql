-- Parent-child linking via a short-lived 6-character code. A player (or a
-- coach/club acting on a younger player's behalf) generates a code; a parent
-- redeems it instantly (sharing the code implies consent, no approval step).

create table public.parent_link_codes (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  player_id uuid not null references public.profiles(id) on delete cascade,
  created_by uuid not null references public.profiles(id) on delete cascade,
  expires_at timestamptz not null,
  used_at timestamptz,
  used_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index on public.parent_link_codes (player_id);
create index on public.parent_link_codes (created_by);

-- Who may generate a code for a given player: the player themselves, a coach
-- with an accepted personal connection to them, or a coach/club-owner who
-- has that player in a private lesson or group tier at their club.
create function public.can_manage_player_link(target_player_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select
    target_player_id = auth.uid()
    or exists (
      select 1 from public.coach_connections cc
      where cc.coach_id = auth.uid() and cc.player_id = target_player_id and cc.status = 'accepted'
    )
    or exists (
      select 1 from public.schedule_assignments sa
      where sa.player_id = target_player_id
        and (sa.coach_id = auth.uid() or public.is_club_owner(sa.club_id))
    )
    or exists (
      select 1 from public.player_tier_assignments pta
      join public.group_tiers gt on gt.id = pta.group_tier_id
      where pta.player_id = target_player_id
        and (gt.coach_id = auth.uid() or public.is_club_owner(gt.club_id))
    );
$$;

-- Redemption is a single atomic RPC rather than a plain client insert/select:
-- a declarative "look up by code" SELECT policy would have to be USING
-- (true) since RLS can't restrict "only when filtering by exact code",
-- which would let any authenticated user list every code in the table.
-- This function does the lookup, validation, linking, and used-stamping
-- server-side, so the table itself needs no public SELECT policy at all.
create function public.redeem_parent_link_code(input_code text)
returns table (player_id uuid, player_name text)
language plpgsql
security definer
set search_path = public
as $$
declare
  code_row public.parent_link_codes;
  caller_role text;
  linked_player_name text;
begin
  select role into caller_role from public.profiles where id = auth.uid();
  if caller_role is distinct from 'parent' then
    raise exception 'Only a Parent account can redeem a link code.';
  end if;

  select * into code_row from public.parent_link_codes where code = upper(input_code);
  if code_row.id is null then
    raise exception 'That code wasn''t found. Double-check it and try again.';
  end if;
  if code_row.used_at is not null then
    raise exception 'That code has already been used.';
  end if;
  if code_row.expires_at < now() then
    raise exception 'That code has expired. Ask for a new one.';
  end if;

  insert into public.parent_children (parent_id, player_id)
  values (auth.uid(), code_row.player_id)
  on conflict (parent_id, player_id) do nothing;

  update public.parent_link_codes
  set used_at = now(), used_by = auth.uid()
  where id = code_row.id;

  select full_name into linked_player_name from public.profiles where id = code_row.player_id;
  return query select code_row.player_id, coalesce(linked_player_name, 'Player');
end;
$$;

alter table public.parent_link_codes enable row level security;

create policy "player or generator views the code" on public.parent_link_codes
  for select using (created_by = auth.uid() or player_id = auth.uid());

create policy "authorized adult generates a code" on public.parent_link_codes
  for insert with check (created_by = auth.uid() and public.can_manage_player_link(player_id));

create policy "player or generator cancels an unused code" on public.parent_link_codes
  for delete using (created_by = auth.uid() or player_id = auth.uid());

-- Widen parent_children so the player side has visibility too (previously
-- only the parent could see/manage their own links) — needed so a player
-- can see who's linked to them and revoke at any time.
drop policy "parent manages own children links" on public.parent_children;

create policy "player or parent views the link" on public.parent_children
  for select using (player_id = auth.uid() or parent_id = auth.uid());

create policy "parent creates their own link" on public.parent_children
  for insert with check (parent_id = auth.uid());

create policy "player or parent revokes the link" on public.parent_children
  for delete using (player_id = auth.uid() or parent_id = auth.uid());
