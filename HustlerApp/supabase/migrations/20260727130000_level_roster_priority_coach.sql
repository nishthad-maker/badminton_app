-- Two related gaps found during QA against the Phase 1 spec:
-- (a) club_coaches.assigned_levels (added earlier this session) was purely
--     informational — nothing actually filtered the roster by it, so "assign
--     a coach to a level -> they only see players of that level" didn't hold.
-- (b) there was no "priority coach" concept anywhere — spec explicitly wants
--     a player's non-priority coaches shown greyed-out/view-only rather than
--     hidden.

-- ── Priority coach -----------------------------------------------------------

alter table public.club_members add column if not exists priority_coach_id uuid references public.profiles(id) on delete set null;

-- ── Level-based roster filtering ---------------------------------------------

create function public.coach_assigned_levels(target_club_id uuid)
returns text[]
language sql
security definer
stable
set search_path = public
as $$
  select coalesce(assigned_levels, '{}') from public.club_coaches
  where club_id = target_club_id and coach_id = auth.uid() and status = 'active'
  limit 1;
$$;

grant execute on function public.coach_assigned_levels(uuid) to authenticated;

-- Replaces "coaches view roster per admin-set scope" (from
-- 20260726180000_coach_club_features.sql) with the same logic plus an
-- additional level filter: if the coach has any assigned_levels set, they
-- only see roster players tagged with one of those levels, on top of
-- whatever roster_scope already allowed. A coach with no assigned levels
-- (the default) is unaffected — this is purely additive.
drop policy if exists "coaches view roster per admin-set scope" on public.club_members;

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
      and (
        cardinality(public.coach_assigned_levels(club_id)) = 0
        or club_members.level = any (public.coach_assigned_levels(club_id))
      )
    )
  );
