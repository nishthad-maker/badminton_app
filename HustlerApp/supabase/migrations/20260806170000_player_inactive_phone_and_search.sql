-- Soft-deactivate for players, mirroring the coach one — the only existing
-- removal path (leaveClub) is a player-initiated hard delete; club-admin has
-- no equivalent "this student left" action that preserves roster/attendance
-- history. club_members UPDATE stays owner-only (unchanged), matching the
-- existing owner-gated level/priority-coach controls in the dashboard
-- player folder — every active-check (is_rostered_player, roster-view
-- policies) already tests status = 'active' exactly, so an inactive player
-- disappears from active views automatically.
alter table public.club_members drop constraint club_members_status_check;
alter table public.club_members add constraint club_members_status_check
  check (status in ('pending', 'active', 'inactive'));

-- Needed for front-desk search/contact and for the walk-in rental/
-- registration flows. profiles' own UPDATE policy is auth.uid() = id only,
-- so a staffer can't set another player's phone directly — see
-- update_roster_player_phone below.
alter table public.profiles add column if not exists phone text;

-- Staff-level (not owner-only): editing a contact phone number is low-stakes
-- compared to level/priority-coach reassignment, so this doesn't need the
-- extra owner gate those have.
create or replace function public.update_roster_player_phone(p_club_member_id uuid, p_phone text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_club_id uuid;
  v_player_id uuid;
begin
  select club_id, player_id into v_club_id, v_player_id
  from public.club_members where id = p_club_member_id;

  if v_club_id is null or not public.is_club_staff(v_club_id) then
    raise exception 'not authorized';
  end if;

  update public.profiles set phone = p_phone where id = v_player_id;
end;
$$;

grant execute on function public.update_roster_player_phone(uuid, text) to authenticated;

-- Return type is changing (adding phone), so this has to be dropped first —
-- create or replace can't alter an existing function's return columns.
drop function if exists public.search_club_roster_players(uuid, text);

create function public.search_club_roster_players(input_club_id uuid, query text)
returns table (id uuid, full_name text, email text, level text, phone text)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.full_name, p.email, cm.level, p.phone
  from public.club_members cm
  join public.profiles p on p.id = cm.player_id
  where public.is_club_staff(input_club_id)
    and cm.club_id = input_club_id
    and cm.status = 'active'
    and (
      query = ''
      or p.full_name ilike '%' || query || '%'
      or p.email ilike '%' || query || '%'
      or p.phone ilike '%' || query || '%'
    )
  order by p.full_name
  limit 25;
$$;

grant execute on function public.search_club_roster_players(uuid, text) to authenticated;
