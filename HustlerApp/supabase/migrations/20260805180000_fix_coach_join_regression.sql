-- Found live, by actually testing a fresh coach join end-to-end (not just
-- reading code): request_join_club_as_coach was broken two ways at once.
--
-- 1. "column reference club_id is ambiguous" (42702) on every single call —
--    the function's `returns table (club_id uuid, ...)` creates an implicit
--    PL/pgSQL variable named club_id, which collided with the bare
--    `club_coaches.club_id` reference in the "already a member?" check.
--    This exact bug was fixed once before (20260726110000), by aliasing.
--
-- 2. The new club_coaches row was inserted with status='pending' instead of
--    'active'. project_coach_club_features (2026-07-26) deliberately made
--    coach join instant/no-approval, specifically calling out
--    `request_join_club_as_coach` reverting to 'pending' as the exact
--    regression to watch for.
--
-- Root cause of both: 20260803200000_coach_time_off.sql's DROP+CREATE
-- claimed to be "unchanged from 20260726100000" — but that's the *original*
-- pre-fix migration, not 20260726180000 (the actual latest/correct version
-- with the alias fix and status='active'). Everything downstream that
-- dutifully copied "the latest create-or-replace" (including this repo's
-- own 20260805140000 emoji-cleanup pass) faithfully carried the bug
-- forward without knowing the source it copied from was already broken.
-- Lesson: "latest in migration history" isn't the same guarantee as
-- "correct" if an earlier migration already silently regressed it — worth
-- a live smoke test after copying a function body, not just a diff review.
create or replace function public.request_join_club_as_coach(input_code text)
returns table (club_id uuid, club_name text)
language plpgsql
security definer
set search_path = public
as $$
declare
  target public.clubs;
  caller_role text;
  caller_name text;
  v_already_member boolean;
begin
  select role into caller_role from public.profiles where id = auth.uid();
  if caller_role is distinct from 'coach' then
    raise exception 'Only a Coach account can join a club this way.';
  end if;

  select c.* into target
  from public.clubs c
  join public.club_settings cs on cs.club_id = c.id
  where cs.coach_join_code = upper(input_code);

  if target.id is null then
    raise exception 'That code wasn''t found. Double-check it and try again.';
  end if;

  select exists (
    select 1 from public.club_coaches cc where cc.club_id = target.id and cc.coach_id = auth.uid()
  ) into v_already_member;

  insert into public.club_coaches (club_id, coach_id, role, status)
  values (target.id, auth.uid(), 'staff', 'active')
  on conflict (club_id, coach_id) do nothing;

  if not v_already_member and target.owner_id is not null and not exists (
    select 1 from public.notification_preferences np
    where np.user_id = target.owner_id and np.category = 'club' and np.enabled = false
  ) then
    select full_name into caller_name from public.profiles where id = auth.uid();
    insert into public.notifications (user_id, type, category, title, body, screen)
    values (
      target.owner_id, 'club_coach_join_request', 'club',
      'A coach joined',
      coalesce(caller_name, 'A coach') || ' joined ' || target.name || ' as a coach.',
      '(club-admin)/club-settings'
    );
  end if;

  return query select target.id, target.name;
end;
$$;
