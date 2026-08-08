-- Makeup suggestions should prefer times that don't cost the family a
-- second trip to the club — e.g. right before/after a group lesson the
-- player already has that day — and should avoid weekday mornings when a
-- school-age player is in class. lib/makeup.ts now does that ranking
-- client-side, but it needs the player's OWN other commitments (regardless
-- of which coach/court they're with) to know what's "adjacent" — that's
-- what `playerSchedule` adds here.
-- Full body copied verbatim from 20260803210000_makeup_coach_relevance_filter.sql
-- (the current authoritative version) with one addition: a `playerSchedule`
-- array in the JSON payload.
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
      select jsonb_agg(jsonb_build_object('id', x.coach_id, 'fullName', p.full_name))
      from (
        select distinct cc.coach_id
        from public.club_coaches cc
        where cc.club_id = v_club_id and cc.status = 'active'
        and (
          cc.coach_id in (
            select lc.coach_id
            from public.player_tier_assignments pta
            join public.lesson_coaches lc on lc.group_tier_id = pta.group_tier_id
            join public.group_tiers gt on gt.id = pta.group_tier_id
            where pta.player_id = v_credit.player_id and gt.club_id = v_club_id
          )
          or cc.coach_id in (
            select sa3.coach_id
            from public.schedule_assignments sa3
            where sa3.player_id = v_credit.player_id and sa3.club_id = v_club_id
          )
        )
      ) x
      join public.profiles p on p.id = x.coach_id
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
    ), '[]'::jsonb),
    'coachTimeOff', coalesce((
      select jsonb_agg(jsonb_build_object(
        'coachId', cto.coach_id, 'kind', cto.kind, 'dayOfWeek', cto.day_of_week,
        'startTime', cto.start_time, 'endTime', cto.end_time,
        'startDate', cto.start_date, 'endDate', cto.end_date
      ))
      from public.coach_time_off cto where cto.club_id = v_club_id
    ), '[]'::jsonb),
    'playerSchedule', coalesce((
      select jsonb_agg(x) from (
        select jsonb_build_object(
          'dayOfWeek', sa4.day_of_week, 'startTime', sa4.start_time, 'endTime', sa4.end_time,
          'isRecurring', true, 'oneTimeDate', null
        ) as x
        from public.schedule_assignments sa4
        where sa4.player_id = v_credit.player_id and sa4.club_id = v_club_id
        union all
        select jsonb_build_object(
          'dayOfWeek', lts2.day_of_week, 'startTime', lts2.start_time, 'endTime', lts2.end_time,
          'isRecurring', lts2.is_recurring, 'oneTimeDate', lts2.one_time_date
        ) as x
        from public.player_tier_assignments pta2
        join public.group_tiers gt3 on gt3.id = pta2.group_tier_id
        join public.lesson_time_slots lts2 on lts2.group_tier_id = gt3.id
        where pta2.player_id = v_credit.player_id and gt3.club_id = v_club_id
      ) x
    ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

grant execute on function public.get_makeup_scheduling_context(uuid) to authenticated;
