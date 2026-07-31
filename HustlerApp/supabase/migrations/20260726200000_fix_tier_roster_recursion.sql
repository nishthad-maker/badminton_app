-- "player views tier rosters they belong to" (added in the player-club-
-- features pass) queries player_tier_assignments FROM WITHIN a policy ON
-- player_tier_assignments — a bare self-referencing EXISTS like that is a
-- textbook Postgres RLS trap: to decide whether a row is visible, Postgres
-- has to evaluate the policy, which runs a query against the same table,
-- which again needs every policy (including this one) evaluated for ITS
-- rows, forever. Postgres detects the cycle and raises "infinite recursion
-- detected in policy for relation player_tier_assignments" (SQLSTATE
-- 42P17) the moment ANY RLS-subject caller touches this table — which is
-- why "Create Group Lesson" (which chains into player_tier_assignments via
-- the new coach-club-features roster_scope policy on club_members) started
-- failing. This wasn't a new bug, just newly exercised.
--
-- Fix: move the self-check into a SECURITY DEFINER helper, exactly like
-- is_club_staff/is_club_owner already do for club_coaches (a SECURITY
-- DEFINER function's internal query doesn't re-trigger the RLS of the
-- policy that called it, breaking the cycle) — this is a proven-safe
-- pattern already used throughout this codebase, not a new technique.
create function public.is_in_group_tier(target_group_tier_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.player_tier_assignments
    where group_tier_id = target_group_tier_id and player_id = auth.uid()
  );
$$;

drop policy if exists "player views tier rosters they belong to" on public.player_tier_assignments;

create policy "player views tier rosters they belong to" on public.player_tier_assignments
  for select using (public.is_in_group_tier(group_tier_id));
