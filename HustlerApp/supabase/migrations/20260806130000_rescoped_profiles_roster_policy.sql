-- The previous migration (20260806110000) dropped "club staff search player
-- profiles" outright because its only known client-side caller had been
-- switched to a SECURITY DEFINER RPC that doesn't need it. That missed a
-- second dependency: every embedded `club_members.select('...,
-- profiles(full_name)')` query (the roster views in (coach-tabs)/players.tsx,
-- lib/club.ts's getClubRosterForCoach, etc.) is a PostgREST embed, and an
-- embed still enforces RLS on the embedded table — with no SELECT policy
-- left on profiles for "a club-roster player, seen by that club's own
-- coach", every one of those embeds now silently returns `profiles: null`
-- instead of erroring, so player names across the coach's own roster views
-- quietly went blank. Confirmed live: club_members embed returned
-- `"profiles":null` for a real, actively-rostered player.
--
-- Replacing with the policy that should have shipped originally: scoped to
-- "the target player is an ACTIVE member of a club where the caller is
-- ACTIVE staff" (club_members + club_coaches), not "any coach anywhere, any
-- player, no relationship required" like the one that was removed.
create policy "club staff view roster player profiles" on public.profiles
  for select using (
    role = 'player' and exists (
      select 1
      from public.club_members cm
      join public.club_coaches cc on cc.club_id = cm.club_id
      where cm.player_id = profiles.id
        and cm.status = 'active'
        and cc.coach_id = auth.uid()
        and cc.status = 'active'
    )
  );
