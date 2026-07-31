-- Spec point 10 ("Tournament: player/parent marks dates") had no self-service
-- path at all before this — tournament_blocks could only be created by a
-- club owner or the player's own coach (calendar.tsx's block-lesson action).
-- Adds the missing player/parent insert+select policies; the existing
-- generate_tournament_exceptions() trigger already fires on any insert
-- regardless of who made it, so no trigger change is needed — the block
-- applies instantly (no separate approval step exists in this schema, same
-- as every other instant-apply action in the app).

create policy "player creates own tournament blocks" on public.tournament_blocks
  for insert with check (player_id = auth.uid());

create policy "player views own tournament blocks" on public.tournament_blocks
  for select using (player_id = auth.uid());

create policy "parent creates childs tournament blocks" on public.tournament_blocks
  for insert with check (public.is_accepted_parent_of(player_id));
