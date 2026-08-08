-- Coach off-time was club-owner-set only ("club sets that up" per the
-- original request) — now a coach can also mark their own vacation/days
-- off directly, informing the club instead of asking the owner to do it.
-- Additive: the existing owner-manages-anyone policy is untouched.
create policy "coach manages own time off" on public.coach_time_off
  for all using (coach_id = auth.uid())
  with check (coach_id = auth.uid() and public.is_club_staff(club_id));
