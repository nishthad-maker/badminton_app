-- Soft-deactivate for coaches: "Remove coach" today hard-deletes the
-- club_coaches row, which would orphan/cascade-break lesson_coaches,
-- coach_schedule_events, and attendance history referencing them. A coach
-- who leaves should lose access, not erase the record of who taught what.
alter table public.club_coaches drop constraint club_coaches_status_check;
alter table public.club_coaches add constraint club_coaches_status_check
  check (status in ('pending', 'active', 'inactive'));

-- is_club_staff/is_club_owner already require status = 'active' exactly, so
-- an inactive coach automatically loses every staff/owner-gated access path
-- with no further policy changes. The one gap: schedule_assignments' "owner
-- or own coach ..." policies check ONLY coach_id = auth.uid(), with no
-- is_club_staff gate at all — a deactivated coach would keep full CRUD on
-- their own private-lesson rows forever. Tighten those three to also
-- require active staff status.
drop policy "owner or own coach views lessons" on public.schedule_assignments;
create policy "owner or own coach views lessons" on public.schedule_assignments
  for select using (is_club_owner(club_id) or (coach_id = auth.uid() and is_club_staff(club_id)));

drop policy "owner or own coach updates lessons" on public.schedule_assignments;
create policy "owner or own coach updates lessons" on public.schedule_assignments
  for update
  using (is_club_owner(club_id) or (coach_id = auth.uid() and is_club_staff(club_id)))
  with check (is_club_owner(club_id) or (coach_id = auth.uid() and is_club_staff(club_id)));

drop policy "owner or own coach deletes lessons" on public.schedule_assignments;
create policy "owner or own coach deletes lessons" on public.schedule_assignments
  for delete using (is_club_owner(club_id) or (coach_id = auth.uid() and is_club_staff(club_id)));

-- Same gap on INSERT — an inactive coach shouldn't be able to create new
-- private lessons for themselves either.
drop policy "owner or own coach creates lessons" on public.schedule_assignments;
create policy "owner or own coach creates lessons" on public.schedule_assignments
  for insert with check (is_club_owner(club_id) or (coach_id = auth.uid() and is_club_staff(club_id)));
