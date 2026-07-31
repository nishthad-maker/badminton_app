-- Approving a join request already tags the player with a level (batch
-- type) — now it also drops them onto that batch's group-lesson roster
-- (player_tier_assignments), so the coach finds them already enrolled and
-- just needs to add a day/time, instead of re-adding every approved player
-- by hand. Matched by name within the same club; a no-op if no tier with
-- that name exists yet (e.g. a custom level with no corresponding lesson
-- card) or the player's already on the roster.

create or replace function public.approve_club_join_request(request_id uuid, p_level text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  req public.club_join_requests;
  v_tier_id uuid;
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

  if p_level is not null then
    select id into v_tier_id from public.group_tiers where club_id = req.club_id and name = p_level;
    if v_tier_id is not null then
      insert into public.player_tier_assignments (group_tier_id, player_id)
      values (v_tier_id, req.player_id)
      on conflict (group_tier_id, player_id) do nothing;
    end if;
  end if;
end;
$$;
