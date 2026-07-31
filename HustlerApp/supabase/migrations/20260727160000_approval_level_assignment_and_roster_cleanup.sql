-- Fix: club join approval had no way to set the player's level for this
-- club, and there was still a parallel "search by name/email, add instantly"
-- roster path (search_club_connected_players / addPlayerToRoster's caller in
-- dashboard.tsx) that bypassed the code -> request -> approve flow entirely.
-- Per explicit product direction: ALL players join via code -> request ->
-- approve, no direct-add path.

-- ── Approval now sets the level atomically, in the same transaction -------

create or replace function public.approve_club_join_request(request_id uuid, p_level text default null)
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

  insert into public.club_members (club_id, player_id, status, level)
  values (req.club_id, req.player_id, 'active', p_level)
  on conflict (club_id, player_id) do update set status = 'active', level = excluded.level;

  update public.club_join_requests
  set status = 'approved', reviewed_at = now(), reviewed_by = auth.uid()
  where id = request_id;
end;
$$;

-- ── Remove the direct-add roster search path -------------------------------
-- Was the only caller of this RPC (dashboard.tsx's "search by name/email, add
-- a player your coaches already teach — no code needed" card); the
-- club_members-scoped search_club_roster_players (used for adding a player
-- to a specific lesson, from the already-approved pool) is unaffected and
-- stays.
drop function if exists public.search_club_connected_players(uuid, text);
