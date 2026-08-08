-- The "shows a generic label instead of a real name" bug, same class as
-- 20260729130000's club-owner fix — confirmed via a throwaway DIAG migration
-- that `profiles` has no policy at all covering a parent's own row for the
-- player they're requesting to link to (or already linked with). The base
-- policies are "own profile", "coach profiles" (is_coach = true), coach/club
-- relationship ones — nothing keyed off parent_children. lib/parentLink.ts's
-- namesById lookup was already fixed once (the ambiguous-embed bug, see
-- project_pending_request_bugs_and_debug_technique) but that only fixed HOW
-- the name is looked up, not WHETHER the lookup is allowed to see the row —
-- it was silently falling back to the generic 'Parent' string the whole time.
--
-- Purely additive, mirrors 20260729130000's framing: only ever widens who
-- can read a name already displayed elsewhere in the app once linked.
create policy "player views a linking or linked parent's profile" on public.profiles
  for select using (
    exists (
      select 1 from public.parent_children pc
      where pc.parent_id = profiles.id and pc.player_id = auth.uid() and pc.unlinked_at is null
    )
  );
