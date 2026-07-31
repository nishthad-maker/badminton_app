-- Fix: approving a player's club join request did two separate network
-- round-trips (club_members upsert, then club_join_requests update) with no
-- transaction tying them together — a dropped connection between the two
-- could leave a player rostered with their request still showing "pending",
-- or vice versa. Wraps both in one SECURITY DEFINER RPC so the approval is
-- truly atomic (single statement-level transaction), matching the same
-- pattern already used for request_join_club_as_player/_as_coach.
--
-- Also opens approval up to any active staff member, not just the owner —
-- matches the existing trust level for roster management (search-to-add via
-- addPlayerToRoster has never been owner-gated; only level/priority-coach
-- assignment is owner-only).

create function public.approve_club_join_request(request_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  req public.club_join_requests;
begin
  select * into req from public.club_join_requests where id = request_id;
  if req.id is null then
    raise exception 'That request no longer exists.';
  end if;
  if not public.is_club_staff(req.club_id) then
    raise exception 'Not authorized.';
  end if;
  if req.status <> 'pending' then
    raise exception 'That request was already reviewed.';
  end if;

  insert into public.club_members (club_id, player_id, status)
  values (req.club_id, req.player_id, 'active')
  on conflict (club_id, player_id) do update set status = 'active';

  update public.club_join_requests
  set status = 'approved', reviewed_at = now(), reviewed_by = auth.uid()
  where id = request_id;
end;
$$;

grant execute on function public.approve_club_join_request(uuid) to authenticated;

-- Note: club_join_requests' existing "club staff review join requests" UPDATE
-- policy (from 20260726160000) is already is_club_staff-scoped, not
-- owner-only — reject was only ever owner-gated at the UI layer in
-- club-settings.tsx, which this pass also removes. No RLS change needed here.
