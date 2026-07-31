-- Missed in the previous parent-features migration: the parent activity
-- feed's "upcoming tournaments" item reads tournament_blocks, which had no
-- parent-visibility policy yet. Same trust level as session_logs — visible
-- once the child is rostered in any club, no need to scope to one specific
-- club since a tournament block isn't itself club-specific.
create policy "parents view child tournament blocks" on public.tournament_blocks
  for select using (public.is_accepted_parent_of(player_id) and public.child_has_any_club(player_id));
