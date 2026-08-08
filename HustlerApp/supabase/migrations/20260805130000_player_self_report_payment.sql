-- A player without a linked parent (or who just doesn't want them involved)
-- had no way to report their own club payment — only a parent could.
-- Mirrors "parents view/self-report own child payments" from
-- 20260726140000_parent_features.sql, but for the player themselves;
-- reported_by_parent_id stays null on a player-submitted row so it's
-- distinguishable from a parent's report.
create policy "player views own payments" on public.lesson_payments
  for select using (player_id = auth.uid());

create policy "player self-reports own payments" on public.lesson_payments
  for insert with check (player_id = auth.uid() and reported_by_parent_id is null);
