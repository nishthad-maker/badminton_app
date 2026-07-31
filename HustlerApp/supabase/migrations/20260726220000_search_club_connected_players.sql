-- Roster search-to-add previously searched EVERY role='player' profile in
-- the whole app by name/email (via the "club staff search player profiles"
-- policy), which meant any club could discover and add total strangers who
-- had never had any contact with the club. The actual useful case is
-- narrower: a club's own coaches already have direct coach_connections to
-- players they coach — search-to-add should surface those players (so the
-- club can formally roster someone its coaches already teach), not the
-- entire app's user base.
--
-- coach_connections' SELECT policy ("see own connections") is deliberately
-- narrow — only the specific coach or player on a row can see it, not other
-- coaches at the same club. Rather than widen that (which would let any
-- staff member browse every other coach's full connection list/timestamps
-- app-wide), this is a SECURITY DEFINER RPC that internally joins across
-- club_coaches -> coach_connections -> profiles and returns only the
-- minimal matching player rows, scoped to one club and one search query.
create function public.search_club_connected_players(input_club_id uuid, query text)
returns table (id uuid, full_name text, email text)
language sql
security definer
stable
set search_path = public
as $$
  select distinct p.id, p.full_name, p.email
  from public.profiles p
  join public.coach_connections cc on cc.player_id = p.id and cc.status = 'accepted'
  join public.club_coaches cc2 on cc2.coach_id = cc.coach_id and cc2.club_id = input_club_id and cc2.status = 'active'
  where public.is_club_staff(input_club_id)
    and p.role = 'player'
    and (query = '' or p.full_name ilike '%' || query || '%' or p.email ilike '%' || query || '%')
  limit 10;
$$;

grant execute on function public.search_club_connected_players(uuid, text) to authenticated;
