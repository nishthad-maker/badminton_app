-- Parent features: safety-first accept-based linking (replacing instant
-- code-redemption), club-dependency gating for parent visibility, a
-- schedule-request flow, and parent-submitted payment reports.

-- ── 1. Parent-child linking becomes request/accept, not instant -----------

-- parent_children already exists (club v2 rebuild) as an instant link —
-- existing rows were created under "sharing the code implies consent", so
-- they're safely treated as already-accepted; only new redemptions go
-- through the new pending/accept flow from here on.
alter table public.parent_children add column status text not null default 'accepted' check (status in ('pending', 'accepted'));
alter table public.parent_children add column requested_at timestamptz not null default now();
alter table public.parent_children add column accepted_at timestamptz;
alter table public.parent_children add column unlinked_at timestamptz;
update public.parent_children set accepted_at = created_at where status = 'accepted';

-- Redemption now creates a PENDING link, not an active one — the child (or
-- re-redeeming while already-pending) still needs to accept it explicitly.
create or replace function public.redeem_parent_link_code(input_code text)
returns table (player_id uuid, player_name text)
language plpgsql
security definer
set search_path = public
as $$
declare
  code_row public.parent_link_codes;
  caller_role text;
  linked_player_name text;
  existing public.parent_children;
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

  update public.parent_link_codes
  set used_at = now(), used_by = auth.uid()
  where id = code_row.id;

  select full_name into linked_player_name from public.profiles where id = code_row.player_id;
  return query select code_row.player_id, coalesce(linked_player_name, 'Player');
end;
$$;

-- Unlinking is now a soft-update (unlinked_at stamped) instead of a hard
-- delete, so there's a record the relationship existed. The old DELETE
-- policy is replaced by an UPDATE policy usable by the player, the parent,
-- OR a club owner of any club the child is rostered in (safety net if a
-- family dispute needs staff intervention).
drop policy if exists "player or parent revokes the link" on public.parent_children;

create policy "player, parent, or child's club owner manage the link" on public.parent_children
  for update using (
    player_id = auth.uid() or parent_id = auth.uid()
    or exists (select 1 from public.club_members cm where cm.player_id = parent_children.player_id and public.is_club_owner(cm.club_id))
  ) with check (
    player_id = auth.uid() or parent_id = auth.uid()
    or exists (select 1 from public.club_members cm where cm.player_id = parent_children.player_id and public.is_club_owner(cm.club_id))
  );

-- Visible to the child's club staff too (read-only oversight, per the
-- safety requirement that a link request isn't invisible to the club).
create policy "childs club staff views the link" on public.parent_children
  for select using (
    exists (select 1 from public.club_members cm where cm.player_id = parent_children.player_id and public.is_club_staff(cm.club_id))
  );

-- ── Helper functions for club-dependency-gated parent access ---------------

create function public.is_accepted_parent_of(target_player_id uuid)
returns boolean
language sql security definer stable set search_path = public
as $$
  select exists (
    select 1 from public.parent_children pc
    where pc.parent_id = auth.uid() and pc.player_id = target_player_id
      and pc.status = 'accepted' and pc.unlinked_at is null
  );
$$;

create function public.child_has_any_club(target_player_id uuid)
returns boolean
language sql security definer stable set search_path = public
as $$
  select exists (select 1 from public.club_members cm where cm.player_id = target_player_id and cm.status = 'active');
$$;

-- Gates data specific to ONE child (payments, their own session logs) — the
-- caller must be an accepted parent AND the child must be actively rostered
-- in exactly this club.
create function public.is_accepted_parent_with_club_access(target_player_id uuid, target_club_id uuid)
returns boolean
language sql security definer stable set search_path = public
as $$
  select public.is_accepted_parent_of(target_player_id)
    and exists (select 1 from public.club_members cm where cm.player_id = target_player_id and cm.club_id = target_club_id and cm.status = 'active');
$$;

-- Gates club-wide schedule/availability browsing (coaches, courts, the full
-- lesson calendar) — broader than the per-child function above on purpose:
-- a parent has to see the WHOLE club's schedule to find an open slot to
-- request, not just their own child's existing bookings.
create function public.is_parent_with_club_access(target_club_id uuid)
returns boolean
language sql security definer stable set search_path = public
as $$
  select exists (
    select 1 from public.club_members cm
    join public.parent_children pc on pc.player_id = cm.player_id
    where cm.club_id = target_club_id and cm.status = 'active'
      and pc.parent_id = auth.uid() and pc.status = 'accepted' and pc.unlinked_at is null
  );
$$;

-- ── 2. Journal: separate parent-share toggle, no club dependency ----------

alter table public.journal_entries add column shared_with_parent boolean not null default false;

create policy "parents view shared journal entries" on public.journal_entries
  for select using (shared_with_parent = true and public.is_accepted_parent_of(user_id));

-- ── 3. Progress (session logs) — needs the child rostered somewhere -------

create policy "parents view child sessions once rostered" on public.session_logs
  for select using (public.is_accepted_parent_of(user_id) and public.child_has_any_club(user_id));

-- ── 4. Club-wide read access for schedule/availability browsing -----------

create policy "parents with club access view clubs" on public.clubs
  for select using (public.is_parent_with_club_access(id));

create policy "parents with club access view coaches" on public.club_coaches
  for select using (public.is_parent_with_club_access(club_id));

create policy "parents with club access view courts" on public.courts
  for select using (public.is_parent_with_club_access(club_id));

create policy "parents with club access view lessons" on public.schedule_assignments
  for select using (public.is_parent_with_club_access(club_id));

create policy "parents with club access view lesson exceptions" on public.schedule_exceptions
  for select using (
    exists (select 1 from public.schedule_assignments sa where sa.id = schedule_assignment_id and public.is_parent_with_club_access(sa.club_id))
  );

create policy "parents with club access view group lessons" on public.group_tiers
  for select using (public.is_parent_with_club_access(club_id));

create policy "parents with club access view tier rosters" on public.player_tier_assignments
  for select using (
    exists (select 1 from public.group_tiers gt where gt.id = group_tier_id and public.is_parent_with_club_access(gt.club_id))
  );

create policy "parents with club access view time slots" on public.lesson_time_slots
  for select using (
    exists (select 1 from public.group_tiers gt where gt.id = group_tier_id and public.is_parent_with_club_access(gt.club_id))
  );

create policy "parents with club access view slot courts" on public.lesson_time_slot_courts
  for select using (
    exists (select 1 from public.lesson_time_slots lts join public.group_tiers gt on gt.id = lts.group_tier_id where lts.id = lesson_time_slot_id and public.is_parent_with_club_access(gt.club_id))
  );

create policy "parents with club access view lesson coaches" on public.lesson_coaches
  for select using (
    exists (select 1 from public.group_tiers gt where gt.id = group_tier_id and public.is_parent_with_club_access(gt.club_id))
  );

-- ── 5. Payments — scoped to the parent's own child only, never club-wide --

alter table public.lesson_payments add column reported_by_parent_id uuid references public.profiles(id) on delete set null;

create policy "parents view own child payments" on public.lesson_payments
  for select using (public.is_accepted_parent_with_club_access(player_id, club_id));

create policy "parents self-report own child payments" on public.lesson_payments
  for insert with check (public.is_accepted_parent_with_club_access(player_id, club_id) and reported_by_parent_id = auth.uid());

-- ── 6. Parent-initiated scheduling requests --------------------------------

create table public.schedule_requests (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid not null references public.profiles(id) on delete cascade,
  child_id uuid not null references public.profiles(id) on delete cascade,
  coach_id uuid not null references public.profiles(id) on delete cascade,
  club_id uuid not null references public.clubs(id) on delete cascade,
  day_of_week smallint not null check (day_of_week between 0 and 6),
  start_time time not null,
  end_time time not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  check (end_time > start_time)
);

create index on public.schedule_requests (club_id);
create index on public.schedule_requests (coach_id);
create index on public.schedule_requests (parent_id);

alter table public.schedule_requests enable row level security;

create policy "parent creates own schedule requests" on public.schedule_requests
  for insert with check (parent_id = auth.uid() and public.is_accepted_parent_with_club_access(child_id, club_id));

create policy "parent views own or club-wide requests for conflict check" on public.schedule_requests
  for select using (parent_id = auth.uid() or public.is_parent_with_club_access(club_id));

create policy "parent cancels own pending request" on public.schedule_requests
  for update using (parent_id = auth.uid()) with check (parent_id = auth.uid());

create policy "club staff review schedule requests" on public.schedule_requests
  for all using (public.is_club_staff(club_id)) with check (public.is_club_staff(club_id));
