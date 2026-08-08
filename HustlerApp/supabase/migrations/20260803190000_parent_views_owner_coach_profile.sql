-- Same recurring "shows generic label instead of a real name" bug, this time
-- for a private-lesson coach who is also the club owner. Confirmed via
-- impersonation (SET LOCAL ROLE authenticated + jwt claims) that a parent's
-- query for such a coach's profile returned zero rows, which is why
-- getChildLessons()'s coach_name lookup fell back to the literal 'Coach'.
--
-- `20260729130000_view_club_owner_profile.sql` already fixed this for club
-- staff and the player themselves (`is_club_staff(c.id) or` an active
-- `club_members` row for auth.uid()) but a linked PARENT satisfies neither
-- branch — club_members.player_id is the child's id, not the parent's.
-- Reusing `is_parent_with_club_access`, the same helper already used for
-- clubs/club_coaches/courts visibility (20260726140000_parent_features.sql).
create policy "parents with club access view the club owner's profile" on public.profiles
  for select using (
    exists (
      select 1 from public.clubs c
      where c.owner_id = profiles.id and public.is_parent_with_club_access(c.id)
    )
  );
