-- Parent Dashboard/Calendar buildout: parents get read access to their
-- child's coach-assigned workouts (previously no parent RLS at all), plus
-- the same makeup-credit and waitlist self-service that players already
-- have — that machinery already exists (lib/makeup.ts, the waitlist
-- functions in lib/parentDashboard.ts), it just silently failed for a
-- parent caller because every policy behind it was `player_id = auth.uid()`
-- only.

-- ── Coach-assigned workouts (read-only for parents) --------------------------
-- `assignments` has no club_id (it predates the club system, coach_id/
-- player_id only) so this uses the no-club-needed gating tier, same as
-- journal_entries.
create policy "parent views childs assignments" on public.assignments
  for select using (public.is_accepted_parent_of(player_id));

-- ── Makeup credits: parent SELECT + the same two self-service transitions
-- players get (request a slot, respond to a proposed slot) ------------------

-- makeup_lesson_credits never had ANY parent SELECT policy — getChildProgress/
-- getPlayerMakeupCredits(childId) has been silently returning zero private-
-- lesson rows for parents this whole time, same class of gap the player-side
-- fix in 20260728120000_makeup_slot_requests.sql called out for players.
create policy "parent views childs makeup credits" on public.makeup_lesson_credits
  for select using (public.is_accepted_parent_of(player_id));

create policy "parent requests childs makeup slot" on public.makeup_lesson_credits
  for update using (public.is_accepted_parent_of(player_id) and status = 'owed')
  with check (public.is_accepted_parent_of(player_id) and status = 'pending_approval');

create policy "parent responds to childs proposed makeup slot" on public.makeup_lesson_credits
  for update using (public.is_accepted_parent_of(player_id) and status = 'proposed')
  with check (public.is_accepted_parent_of(player_id) and status in ('scheduled', 'owed'));

-- group_makeup_credits already has a parent SELECT policy
-- ("parent views childs group makeup credits"). It has no player-facing
-- UPDATE policy either (only club staff can move those rows) — that's a
-- pre-existing gap for players too, not something introduced or fixed here.

-- get_makeup_scheduling_context() is `security definer` and its authorization
-- check (v_credit.player_id = auth.uid() or is_club_owner or the lesson's
-- coach) never accounted for a parent caller — even with the table RLS
-- above, a parent's call would still raise "Not authorized". Re-declaring
-- the full body (copied verbatim from 20260728130000_club_proposed_makeup_slots.sql)
-- with just that one check widened, since `create or replace` replaces the
-- whole function.
create or replace function public.get_makeup_scheduling_context(p_credit_id uuid)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_credit record;
  v_assignment record;
  v_club_id uuid;
  v_result jsonb;
begin
  select * into v_credit from public.makeup_lesson_credits where id = p_credit_id;
  if not found then
    raise exception 'Makeup credit not found';
  end if;

  select * into v_assignment from public.schedule_assignments where id = v_credit.original_schedule_assignment_id;
  if not found then
    raise exception 'Original lesson not found';
  end if;

  if not (
    v_credit.player_id = auth.uid()
    or public.is_accepted_parent_of(v_credit.player_id)
    or public.is_club_owner(v_assignment.club_id)
    or v_assignment.coach_id = auth.uid()
  ) then
    raise exception 'Not authorized';
  end if;

  v_club_id := v_assignment.club_id;

  select jsonb_build_object(
    'original', jsonb_build_object(
      'coachId', v_assignment.coach_id,
      'courtId', v_assignment.court_id,
      'startTime', v_assignment.start_time,
      'endTime', v_assignment.end_time,
      'missedDate', v_credit.missed_date
    ),
    'coaches', coalesce((
      select jsonb_agg(jsonb_build_object('id', cc.coach_id, 'fullName', p.full_name))
      from public.club_coaches cc
      join public.profiles p on p.id = cc.coach_id
      where cc.club_id = v_club_id and cc.status = 'active'
    ), '[]'::jsonb),
    'courts', coalesce((
      select jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name))
      from public.courts c where c.club_id = v_club_id
    ), '[]'::jsonb),
    'privateLessons', coalesce((
      select jsonb_agg(jsonb_build_object(
        'coachId', sa.coach_id, 'courtId', sa.court_id, 'dayOfWeek', sa.day_of_week,
        'startTime', sa.start_time, 'endTime', sa.end_time
      ))
      from public.schedule_assignments sa where sa.club_id = v_club_id
    ), '[]'::jsonb),
    'groupSlots', coalesce((
      select jsonb_agg(jsonb_build_object(
        'coachIds', slot_coaches.coach_ids, 'courtIds', slot_courts.court_ids,
        'dayOfWeek', lts.day_of_week, 'startTime', lts.start_time, 'endTime', lts.end_time,
        'isRecurring', lts.is_recurring, 'oneTimeDate', lts.one_time_date
      ))
      from public.lesson_time_slots lts
      join public.group_tiers gt on gt.id = lts.group_tier_id
      cross join lateral (
        select coalesce(jsonb_agg(lc.coach_id), '[]'::jsonb) as coach_ids
        from public.lesson_coaches lc where lc.group_tier_id = gt.id
      ) slot_coaches
      cross join lateral (
        select coalesce(jsonb_agg(ltsc.court_id), '[]'::jsonb) as court_ids
        from public.lesson_time_slot_courts ltsc where ltsc.lesson_time_slot_id = lts.id
      ) slot_courts
      where gt.club_id = v_club_id
    ), '[]'::jsonb),
    'oneOffBookings', coalesce((
      select jsonb_agg(x) from (
        select jsonb_build_object(
          'coachId', sa2.coach_id, 'courtId', mlc.scheduled_court_id, 'date', mlc.scheduled_date,
          'startTime', mlc.scheduled_start_time, 'endTime', mlc.scheduled_end_time
        ) as x
        from public.makeup_lesson_credits mlc
        join public.schedule_assignments sa2 on sa2.id = mlc.original_schedule_assignment_id
        where sa2.club_id = v_club_id and mlc.status in ('scheduled', 'pending_approval', 'proposed') and mlc.scheduled_date is not null
        union all
        select jsonb_build_object(
          'coachId', lc3.coach_id, 'courtId', gmc.scheduled_court_id, 'date', gmc.scheduled_date,
          'startTime', gmc.scheduled_start_time, 'endTime', gmc.scheduled_end_time
        ) as x
        from public.group_makeup_credits gmc
        join public.group_tiers gt2 on gt2.id = gmc.group_tier_id
        join public.lesson_coaches lc3 on lc3.group_tier_id = gt2.id
        where gt2.club_id = v_club_id and gmc.status in ('scheduled', 'pending_approval', 'proposed') and gmc.scheduled_date is not null
      ) x
    ), '[]'::jsonb),
    'tournamentBlocks', coalesce((
      select jsonb_agg(jsonb_build_object('startDate', tb.start_date, 'endDate', tb.end_date))
      from public.tournament_blocks tb where tb.player_id = v_credit.player_id
    ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

grant execute on function public.get_makeup_scheduling_context(uuid) to authenticated;

-- ── Waitlist: parent joins/views/leaves on behalf of their child, mirroring
-- the player self-service policies from 20260729100000_player_scheduling_paths.sql --

create policy "parent joins childs waitlist" on public.waitlist_entries
  for insert with check (public.is_accepted_parent_with_club_access(player_id, club_id));

create policy "parent views childs waitlist entries" on public.waitlist_entries
  for select using (public.is_accepted_parent_of(player_id));

create policy "parent leaves childs waitlist" on public.waitlist_entries
  for delete using (public.is_accepted_parent_of(player_id));
