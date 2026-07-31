-- The recurring "shows as 'Coach' instead of a real name" bug (coach picker
-- pill, a player's private-lesson list, etc.) traced to one consistent
-- pattern: it only ever happens for the CLUB OWNER's own name, never a
-- regular staff coach's. Staff coaches resolve fine because something
-- already grants visibility into fellow club_coaches rows; nothing grants
-- visibility into the owner's profile specifically when the viewer is a
-- staff coach or player rather than the owner themselves.
--
-- Purely additive: this only ever widens who can read a name that's already
-- shown all over the app (rosters, coach chips, lesson lists) — it can't
-- hide anything that used to be visible.

drop policy if exists "club members view their club owner's profile" on public.profiles;
create policy "club members view their club owner's profile" on public.profiles
  for select using (
    exists (
      select 1 from public.clubs c
      where c.owner_id = profiles.id
        and (
          public.is_club_staff(c.id)
          or exists (
            select 1 from public.club_members cm
            where cm.club_id = c.id and cm.player_id = auth.uid() and cm.status = 'active'
          )
        )
    )
  );
