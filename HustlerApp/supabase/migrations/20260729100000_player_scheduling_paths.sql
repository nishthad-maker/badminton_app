-- Gives players three direct scheduling paths that previously only existed
-- for parents (schedule_requests) or club-admins (waitlist_entries), so the
-- Calendar tab can host them instead of everything routing through Profile.
--
-- 1. Reschedule: a player can submit a schedule_request for themselves
--    (parent_id = child_id = auth.uid()), optionally tagged with which of
--    their own existing lessons it replaces. On approval, club-calendar.tsx
--    now deletes the replaced lesson alongside creating the new one.
-- 2. Waitlist: a player can join/view/leave their own waitlist_entries rows
--    (club/coach-side management already existed, player-side did not).
-- 3. Coach availability: no new table needed — getCoachBusyWindows already
--    computes this from schedule_assignments/lesson_time_slots/pending
--    schedule_requests, which players already have SELECT access to.

alter table public.schedule_requests
  add column if not exists replaces_schedule_assignment_id uuid references public.schedule_assignments(id) on delete set null;

drop policy if exists "player creates own schedule request" on public.schedule_requests;
create policy "player creates own schedule request" on public.schedule_requests
  for insert with check (
    parent_id = auth.uid()
    and child_id = auth.uid()
    and public.is_rostered_player(club_id)
    and (
      replaces_schedule_assignment_id is null
      or exists (select 1 from public.schedule_assignments sa where sa.id = replaces_schedule_assignment_id and sa.player_id = auth.uid())
    )
  );

-- Existing "parent views own or club-wide requests" (parent_id = auth.uid())
-- and "parent cancels own pending request" policies already cover the
-- self-service case unchanged, since a player's own rows have parent_id =
-- their own id.

drop policy if exists "player joins own waitlist" on public.waitlist_entries;
create policy "player joins own waitlist" on public.waitlist_entries
  for insert with check (player_id = auth.uid() and public.is_rostered_player(club_id));

drop policy if exists "player views own waitlist entries" on public.waitlist_entries;
create policy "player views own waitlist entries" on public.waitlist_entries
  for select using (player_id = auth.uid());

drop policy if exists "player leaves own waitlist" on public.waitlist_entries;
create policy "player leaves own waitlist" on public.waitlist_entries
  for delete using (player_id = auth.uid() and status = 'waiting');
