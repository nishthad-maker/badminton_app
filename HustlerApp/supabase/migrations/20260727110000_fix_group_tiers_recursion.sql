-- Bug: "Could not create the lesson" on every Create Group Lesson attempt
-- (any staff coach, not just owners) — diagnosed live via the DIAG-migration
-- technique (see project memory "pending-request-bugs-and-debug-technique").
--
-- Root cause: group_tiers' "player views own group lessons" SELECT policy
-- does a raw `EXISTS (SELECT 1 FROM player_tier_assignments pta WHERE
-- pta.group_tier_id = group_tiers.id AND pta.player_id = auth.uid())` —
-- a direct table reference, not routed through a SECURITY DEFINER helper.
-- player_tier_assignments' own policies ("club staff view tier rosters",
-- "club staff manage tier rosters", "parents with club access view tier
-- rosters") do the mirror-image raw `EXISTS (SELECT 1 FROM group_tiers gt
-- WHERE gt.id = player_tier_assignments.group_tier_id AND ...)`. Together
-- these form a two-table RLS cycle: evaluating group_tiers' SELECT policy
-- touches player_tier_assignments, whose SELECT policy touches group_tiers
-- again, forever — "infinite recursion detected in policy for relation
-- group_tiers" (SQLSTATE 42P17). This is the exact same trap already fixed
-- once for player_tier_assignments' self-reference (is_in_group_tier), just
-- manifesting on the other side of the same relationship — it was latent
-- until `supabase-js`'s `.insert(...).select().single()` in
-- createGroupLesson() started requiring group_tiers' SELECT policy to be
-- evaluated to return the newly-inserted row.
--
-- Fix: route the group_tiers -> player_tier_assignments check through the
-- existing is_in_group_tier() SECURITY DEFINER helper (already used by
-- player_tier_assignments' own "player views tier rosters they belong to"
-- policy) instead of a raw cross-table EXISTS. SECURITY DEFINER bypasses the
-- callee table's RLS, which breaks the cycle at this one leg — sufficient to
-- unblock the whole relationship, since every other cross-reference between
-- these two tables only goes group_tiers -> (nothing) or already goes
-- through a SECURITY DEFINER function (is_club_staff, is_parent_with_club_access).

drop policy if exists "player views own group lessons" on public.group_tiers;
create policy "player views own group lessons" on public.group_tiers
  for select using (public.is_in_group_tier(id));
