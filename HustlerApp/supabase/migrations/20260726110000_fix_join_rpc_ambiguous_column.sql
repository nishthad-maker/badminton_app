-- request_join_club_as_coach/player declared OUT parameters named club_id/
-- club_name, which shadowed the actual club_coaches.club_id /
-- club_members.club_id columns inside each function's own INSERT ... ON
-- CONFLICT (club_id, ...) clause, raising "column reference club_id is
-- ambiguous" on every real call. Renaming the OUT parameters fixes it.
drop function if exists public.request_join_club_as_coach(text);
drop function if exists public.request_join_club_as_player(text);

create function public.request_join_club_as_coach(input_code text)
returns table (joined_club_id uuid, joined_club_name text)
language plpgsql
security definer
set search_path = public
as $$
declare
  target public.clubs;
  caller_role text;
begin
  select role into caller_role from public.profiles where id = auth.uid();
  if caller_role is distinct from 'coach' then
    raise exception 'Only a Coach account can join a club this way.';
  end if;

  select c.* into target
  from public.clubs c
  join public.club_settings cs on cs.club_id = c.id
  where cs.coach_join_code = upper(input_code);

  if target.id is null then
    raise exception 'That code wasn''t found. Double-check it and try again.';
  end if;

  insert into public.club_coaches (club_id, coach_id, role, status)
  values (target.id, auth.uid(), 'staff', 'pending')
  on conflict (club_id, coach_id) do nothing;

  return query select target.id, target.name;
end;
$$;

create function public.request_join_club_as_player(input_code text)
returns table (joined_club_id uuid, joined_club_name text)
language plpgsql
security definer
set search_path = public
as $$
declare
  target public.clubs;
  caller_role text;
begin
  select role into caller_role from public.profiles where id = auth.uid();
  if caller_role is distinct from 'player' then
    raise exception 'Only a Player account can join a club this way.';
  end if;

  select c.* into target
  from public.clubs c
  join public.club_settings cs on cs.club_id = c.id
  where cs.player_join_code = upper(input_code);

  if target.id is null then
    raise exception 'That code wasn''t found. Double-check it and try again.';
  end if;

  insert into public.club_members (club_id, player_id, status)
  values (target.id, auth.uid(), 'pending')
  on conflict (club_id, player_id) do nothing;

  return query select target.id, target.name;
end;
$$;
