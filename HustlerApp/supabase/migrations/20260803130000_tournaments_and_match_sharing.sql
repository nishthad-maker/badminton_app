-- Tournament naming/linking + parent access to match ("opponent") logs +
-- journal auto-share-to-parent-on-coach-share.

-- ── Tournaments get a name (previously just a date range, unsearchable) ─────
alter table public.tournament_blocks add column if not exists name text not null default 'Tournament';

-- ── Link a logged match to the tournament it happened at (nullable — most
-- quick logs/practice matches won't have one) --------------------------------
alter table public.opponent_logs add column if not exists tournament_block_id uuid references public.tournament_blocks(id) on delete set null;

-- Who actually wrote this entry — null for a player's own log (the existing,
-- default case), set when a parent logged it on their child's behalf.
alter table public.opponent_logs add column if not exists logged_by_parent_id uuid references public.profiles(id) on delete set null;

-- ── Parent access to `opponents` (per-opponent aggregate the player already
-- has) — needed so a parent's log can resolve/create the same opponent row
-- their child's own logs use, without a separate "parent's view" of the
-- opponent list. Wins/losses are never touched by a parent-authored log (see
-- lib/parentMatchLog.ts) so there's no update policy needed here. ───────────
create policy "parent views childs opponents" on public.opponents
  for select using (public.is_accepted_parent_of(player_id));

create policy "parent creates childs opponent" on public.opponents
  for insert with check (public.is_accepted_parent_of(player_id));

-- ── Parent access to opponent_logs: gated, not blanket. A parent sees a
-- child's log if it was shared with any coach (same bar the coach itself
-- clears) OR the parent wrote it themselves — a player's private, unshared
-- scouting notes stay private. Mirrors the "read-only unless shared" stance
-- already used for the parent Dashboard's assignment card. ──────────────────
create policy "parent views childs shared or own-authored opponent logs" on public.opponent_logs
  for select using (
    public.is_accepted_parent_of(player_id)
    and (cardinality(shared_with_coach_ids) > 0 or logged_by_parent_id = auth.uid())
  );

create policy "parent creates own-authored opponent log" on public.opponent_logs
  for insert with check (
    logged_by_parent_id = auth.uid() and public.is_accepted_parent_of(player_id)
  );

create policy "parent updates own-authored opponent log" on public.opponent_logs
  for update using (logged_by_parent_id = auth.uid())
  with check (logged_by_parent_id = auth.uid());

-- ── Journal: sharing with a coach now automatically implies parent
-- visibility too (JournalSheet.tsx is updated to always write
-- shared_with_parent = sharedWithParent || shareIds.length > 0 going
-- forward) — backfill existing rows so they aren't left inconsistent. ───────
update public.journal_entries set shared_with_parent = true
where shared_with_coach = true and shared_with_parent = false;
