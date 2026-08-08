-- Mirror image of 20260803150000 (which let a player see a linking/linked
-- parent's real name instead of the generic fallback) — the same gap existed
-- in the other direction. No policy on `profiles` covered a parent reading
-- their own linked child's row either, so lib/parentLink.ts's namesById
-- lookup silently found nothing and getLinkedChildren fell back to the
-- literal string 'Player' everywhere on the parent dashboard (header
-- subtitle, child switcher chip, unlink confirmation).
create policy "parent views a linking or linked child's profile" on public.profiles
  for select using (
    exists (
      select 1 from public.parent_children pc
      where pc.player_id = profiles.id and pc.parent_id = auth.uid() and pc.unlinked_at is null
    )
  );
