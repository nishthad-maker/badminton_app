-- Coach-side club features: instant multi-club coach join, admin-controlled
-- roster visibility scope, and admin-controlled other-coach schedule edit
-- access. Reuses club_coaches (already multi-club-capable via its
-- unique(club_id, coach_id) constraint) rather than introducing a parallel
-- coach-club-link table — it's already the single source of truth for
-- "is this coach part of this club" and every RLS helper already keys off
-- it, so extending it in place avoids a second, competing membership model.

-- ── 1. Per-coach admin-controlled permissions ------------------------------

alter table public.club_coaches add column roster_scope text not null default 'own_only'
  check (roster_scope in ('own_only', 'full_roster'));
alter table public.club_coaches add column can_edit_other_schedules boolean not null default false;

-- ── 2. Coach club join becomes instant, not pending-approval ---------------

-- Previously a coach's join-by-code request landed as status='pending' and
-- needed the owner to flip it to 'active' from club-settings.tsx. The new
-- coach-club-join flow is explicitly instant (codes are handed directly to
-- coaches a club has already hired, unlike the player join flow which stays
-- approval-gated) — same function name/signature, only the inserted status
-- changes. The "PENDING COACH REQUESTS" approve/reject UI in
-- club-settings.tsx is left in place for any legacy pending rows; it simply
-- won't gain new ones going forward.
create or replace function public.request_join_club_as_coach(input_code text)
returns table (joined_club_id uuid, joined_club_name text)
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
  values (target.id, auth.uid(), 'staff', 'active')
  on conflict (club_id, coach_id) do nothing;

  return query select target.id, target.name;
end;
$$;

-- ── 3. Helper functions for the two admin-controlled permissions -----------

create function public.coach_roster_scope(target_club_id uuid)
returns text
language sql
security definer
stable
set search_path = public
as $$
  select roster_scope from public.club_coaches
  where club_id = target_club_id and coach_id = auth.uid() and status = 'active'
  limit 1;
$$;

create function public.coach_can_edit_others(target_club_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select coalesce((
    select can_edit_other_schedules from public.club_coaches
    where club_id = target_club_id and coach_id = auth.uid() and status = 'active'
    limit 1
  ), false);
$$;

-- ── 4. Roster visibility: club_members SELECT respects roster_scope --------

-- Replaces the blanket "any active staff sees the whole roster" policy from
-- the search-to-add rework. A coach scoped 'own_only' only sees players they
-- actually teach (a private-lesson assignment, or enrollment in a group
-- lesson they're a coach on) — everyone still keeps INSERT (search-to-add)
-- and the owner keeps UPDATE/DELETE unchanged from before.
drop policy if exists "club staff view roster" on public.club_members;

create policy "coaches view roster per admin-set scope" on public.club_members
  for select using (
    public.is_club_owner(club_id)
    or (
      public.is_club_staff(club_id)
      and (
        public.coach_roster_scope(club_id) = 'full_roster'
        or exists (
          select 1 from public.schedule_assignments sa
          where sa.club_id = club_members.club_id and sa.player_id = club_members.player_id and sa.coach_id = auth.uid()
        )
        or exists (
          select 1 from public.player_tier_assignments pta
          join public.group_tiers gt on gt.id = pta.group_tier_id
          join public.lesson_coaches lc on lc.group_tier_id = gt.id
          where gt.club_id = club_members.club_id and pta.player_id = club_members.player_id and lc.coach_id = auth.uid()
        )
      )
    )
  );

-- ── 5. Other-coach private-lesson schedules: read-only for club staff, ----
-- ── editable only with the admin-granted override -------------------------

-- Additive SELECT policy (permissive policies OR together) — every active
-- staff member can now see every private lesson in the club, not just the
-- owner or the assigned coach, for coordination/coverage awareness. The
-- existing "owner or own coach" policies still gate insert/update/delete.
create policy "club staff view all club lessons" on public.schedule_assignments
  for select using (public.is_club_staff(club_id));

create policy "coach with override creates others lessons" on public.schedule_assignments
  for insert with check (public.is_club_staff(club_id) and public.coach_can_edit_others(club_id));

create policy "coach with override updates others lessons" on public.schedule_assignments
  for update using (public.is_club_staff(club_id) and public.coach_can_edit_others(club_id))
  with check (public.is_club_staff(club_id) and public.coach_can_edit_others(club_id));

create policy "coach with override deletes others lessons" on public.schedule_assignments
  for delete using (public.is_club_staff(club_id) and public.coach_can_edit_others(club_id));

create policy "club staff view all lesson exceptions" on public.schedule_exceptions
  for select using (
    exists (select 1 from public.schedule_assignments sa where sa.id = schedule_assignment_id and public.is_club_staff(sa.club_id))
  );

create policy "coach with override manages others lesson exceptions" on public.schedule_exceptions
  for all using (
    exists (
      select 1 from public.schedule_assignments sa
      where sa.id = schedule_assignment_id and public.is_club_staff(sa.club_id) and public.coach_can_edit_others(sa.club_id)
    )
  ) with check (
    exists (
      select 1 from public.schedule_assignments sa
      where sa.id = schedule_assignment_id and public.is_club_staff(sa.club_id) and public.coach_can_edit_others(sa.club_id)
    )
  );
