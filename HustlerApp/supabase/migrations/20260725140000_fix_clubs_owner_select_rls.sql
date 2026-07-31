-- Fixes a chicken-and-egg RLS deadlock on club creation: `clubs` only had a
-- SELECT-applicable policy via is_club_staff(id), which itself depends on a
-- club_coaches row that doesn't exist yet the moment a club is first created.
-- This broke two things:
--   1. The initial `insert into clubs ... returning *` in club-setup.tsx —
--      Postgres filters RETURNING rows through SELECT policies, so the
--      freshly inserted club came back empty even though the row existed.
--   2. club_coaches' own bootstrap policy (`owner bootstraps first coach
--      row`) checks `exists (select 1 from clubs where owner_id = auth.uid())`
--      as a plain query — also blocked by the same missing SELECT visibility.
-- An owner should always be able to see their own club regardless of
-- club_coaches state, so this policy is not circular.
create policy "owner can always view their own club" on public.clubs
  for select using (owner_id = auth.uid());
