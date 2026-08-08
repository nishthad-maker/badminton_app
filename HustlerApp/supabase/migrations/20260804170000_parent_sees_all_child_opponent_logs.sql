-- Previously a parent could only see a child's own-logged match if the
-- child had shared it with a coach — a private/unshared match stayed
-- invisible to the parent too. Confirmed with the user this should be
-- unconditional: a parent should always be able to see their own child's
-- match logs, tournament or not. Coach-sharing stays a fully separate axis
-- (shared_with_coach_ids) that only controls what a coach sees — it no
-- longer gates parent visibility at all.
drop policy if exists "parent views childs shared or own-authored opponent logs" on public.opponent_logs;

create policy "parent views childs opponent logs" on public.opponent_logs
  for select using (public.is_accepted_parent_of(player_id));
