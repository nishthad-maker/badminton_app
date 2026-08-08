-- Coach-authored shared notes can now optionally carry the same
-- strengths/weaknesses tag vocabulary as match logs (constants/matchTags.ts),
-- so coach input can be folded into the combined strengths/weaknesses
-- summary alongside player- and parent-authored opponent_logs.
alter table public.coach_shared_notes add column if not exists strengths_tags text[] not null default '{}';
alter table public.coach_shared_notes add column if not exists weaknesses_tags text[] not null default '{}';

-- coach_shared_notes had player-own and coach-own SELECT but no parent
-- policy — a coach note has no share toggle to begin with (always visible
-- to the player the moment it's written), so extending that same visibility
-- to an accepted parent matches the "coach involvement implies parent
-- visibility" precedent already set for journal_entries/opponent_logs.
create policy "parent views childs coach shared notes" on public.coach_shared_notes
  for select using (public.is_accepted_parent_of(player_id));
