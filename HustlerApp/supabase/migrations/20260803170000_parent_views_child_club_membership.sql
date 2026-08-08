-- Same recurring bug pattern as the last two migrations: getChildClubs()
-- queries club_members directly (`.eq('player_id', childId).eq('status',
-- 'active')`) and silently discards the error, so a parent whose child IS
-- actively rostered still saw "isn't in a club yet" — club_members had no
-- parent-visibility policy at all (only "player views own membership",
-- club-staff/owner ones). This is what's actually gating the parent
-- dashboard's `hasAnyClub` flag (progress/schedule/payments sections),
-- so it silently broke everything downstream of it too, not just the notice.
--
-- `clubs`, `club_coaches`, `courts` etc. already had a parent-visibility
-- policy (`is_parent_with_club_access`, from 20260726140000) — club_members
-- itself was the one table in that chain that got missed.
create policy "parent views childs club membership" on public.club_members
  for select using (public.is_accepted_parent_of(player_id));
