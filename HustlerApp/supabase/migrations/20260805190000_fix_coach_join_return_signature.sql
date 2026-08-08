-- The 20260805180000 fix was real but incomplete — it silenced the
-- "column reference club_id is ambiguous" error in the one query where a
-- human would obviously see the collision (the SELECT EXISTS check), but
-- PL/pgSQL's variable-resolution pass flags a declared OUT parameter name
-- against *any* bare identifier match in embedded SQL, including inside an
-- INSERT's own column list / ON CONFLICT target — contexts a human reads as
-- unambiguous but plpgsql's textual substitution does not. Confirmed live:
-- calling the RPC still 400'd with the exact same 42702 error after that
-- fix, from `insert into club_coaches (club_id, ...) on conflict (club_id,
-- coach_id) do nothing`.
--
-- The actual, complete fix: `lib/club.ts`'s requestJoinClubAsCoach (line
-- 173) already reads `row.joined_club_id` / `row.joined_club_name` off the
-- RPC response — the client was always written against prefixed output
-- column names specifically to dodge this exact collision. The live
-- function's `RETURNS TABLE (club_id uuid, club_name text)` (inherited from
-- the same bad-source-migration regression as before) just never matched
-- that contract, so even ignoring the crash this would have silently
-- returned `undefined` clubId/clubName to the client on success.
-- CREATE OR REPLACE can't change a function's OUT-parameter row type —
-- same DROP+CREATE requirement noted in 20260803200000_coach_time_off.sql.
drop function if exists public.request_join_club_as_coach(text);
create function public.request_join_club_as_coach(input_code text)
returns table (joined_club_id uuid, joined_club_name text)
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
