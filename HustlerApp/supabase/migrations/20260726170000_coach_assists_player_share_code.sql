-- Restores a capability the previous migration's table swap accidentally
-- dropped: (coach-tabs)/players.tsx lets a coach generate a player's
-- parent-link code on the player's behalf (e.g. helping a younger player
-- who isn't comfortable finding it themselves). That relied on
-- can_manage_player_link(), which was dropped along with parent_link_codes
-- — re-create it against player_share_codes instead.
create function public.can_manage_player_link(target_player_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select
    target_player_id = auth.uid()
    or exists (
      select 1 from public.coach_connections cc
      where cc.coach_id = auth.uid() and cc.player_id = target_player_id and cc.status = 'accepted'
    )
    or exists (
      select 1 from public.schedule_assignments sa
      where sa.player_id = target_player_id
        and (sa.coach_id = auth.uid() or public.is_club_owner(sa.club_id))
    )
    or exists (
      select 1 from public.player_tier_assignments pta
      join public.group_tiers gt on gt.id = pta.group_tier_id
      where pta.player_id = target_player_id
        and (public.is_club_staff(gt.club_id))
    );
$$;

create policy "authorized adult views or creates a players share code" on public.player_share_codes
  for all using (public.can_manage_player_link(player_id)) with check (public.can_manage_player_link(player_id));
