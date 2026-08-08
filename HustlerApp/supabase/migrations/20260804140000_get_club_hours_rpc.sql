-- club_settings only has one RLS policy ("club staff manage settings" from
-- 20260725120000), so a parent/player fetching open_time/close_time for the
-- Book-a-Lesson hour grid would silently get nothing back — the row is
-- staff-only. Broadening the table's own SELECT policy would also expose
-- coach_join_code/player_join_code (secret invite codes) to anyone rostered,
-- which the club hours feature has no business doing. A narrow
-- security-definer function that returns just these two non-sensitive
-- columns avoids widening the table's RLS at all.
create or replace function public.get_club_hours(p_club_id uuid)
returns table (open_time time, close_time time)
language sql
security definer
stable
set search_path = public
as $$
  select cs.open_time, cs.close_time from public.club_settings cs where cs.club_id = p_club_id;
$$;

grant execute on function public.get_club_hours(uuid) to authenticated;
