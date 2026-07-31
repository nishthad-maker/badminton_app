-- Makeup slot requests: a player picks a suggested makeup time (computed
-- client-side from data returned by get_makeup_scheduling_context below) and
-- submits it for their coach/club to approve — mirrors the existing
-- request -> approve pattern used elsewhere (club join requests, schedule
-- requests) rather than letting a player instantly book themselves in.
--
-- Also fixes a real gap: makeup_lesson_credits never had a player-facing
-- SELECT policy at all (only "owner or own coach"), unlike its group_makeup_credits
-- sibling which already had "player views own group makeup credits" — so
-- getPlayerMakeupCredits() has been silently returning zero private-lesson
-- rows for the player this whole time.

-- ── RLS: player can see and request their own private-lesson makeup credit ──

drop policy if exists "player views own makeup credits" on public.makeup_lesson_credits;
create policy "player views own makeup credits" on public.makeup_lesson_credits
  for select using (player_id = auth.uid());

-- Scoped narrowly: a player may only move their OWN 'owed' row to
-- 'pending_approval' (setting the slot they're requesting) — never straight
-- to 'scheduled'/'done', and never touch anyone else's row. The club/coach's
-- existing "owner or own coach updates makeup credits" policy (unchanged)
-- already covers approving (-> scheduled) or declining (-> owed) it.
drop policy if exists "player requests own makeup slot" on public.makeup_lesson_credits;
create policy "player requests own makeup slot" on public.makeup_lesson_credits
  for update using (player_id = auth.uid() and status = 'owed')
  with check (player_id = auth.uid() and status = 'pending_approval');

alter table public.makeup_lesson_credits drop constraint if exists makeup_lesson_credits_status_check;
alter table public.makeup_lesson_credits add constraint makeup_lesson_credits_status_check
  check (status in ('owed', 'pending_approval', 'scheduled', 'done'));

-- ── Notify the player the moment a makeup credit is created, not just once ──
-- they happen to open the app and notice it — both trigger functions that
-- create makeup_lesson_credits rows get this appended. Bell-row only (no
-- push token dispatch from SQL); mirrors lib/notifications.ts's own
-- preference gate so a player who muted "makeup" category still gets skipped.

create or replace function public.generate_cancellation_makeup_credit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_credit_id uuid;
  v_player_id uuid;
begin
  if new.reason = 'cancelled' then
    insert into public.makeup_lesson_credits (player_id, original_schedule_assignment_id, missed_date)
    select sa.player_id, sa.id, new.date
    from public.schedule_assignments sa
    where sa.id = new.schedule_assignment_id
    on conflict (original_schedule_assignment_id, missed_date) do nothing
    returning id, player_id into v_credit_id, v_player_id;

    if v_credit_id is not null and not exists (
      select 1 from public.notification_preferences np
      where np.user_id = v_player_id and np.category = 'makeup' and np.enabled = false
    ) then
      insert into public.notifications (user_id, type, category, title, body, screen)
      values (v_player_id, 'makeup', 'makeup', '📅 Makeup Lesson Needed',
        'You missed a private lesson — find a makeup slot on your Calendar.', '(tabs)/calendar');
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.generate_tournament_exceptions()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  assignment record;
  tier record;
  d date;
  v_credit_id uuid;
begin
  for assignment in
    select * from public.schedule_assignments
    where player_id = new.player_id
      and valid_from <= new.end_date
      and (valid_until is null or valid_until >= new.start_date)
  loop
    d := new.start_date;
    while d <= new.end_date loop
      if extract(dow from d)::smallint = assignment.day_of_week then
        insert into public.schedule_exceptions (schedule_assignment_id, date, reason)
        values (assignment.id, d, 'tournament')
        on conflict (schedule_assignment_id, date) do nothing;

        insert into public.makeup_lesson_credits (player_id, original_schedule_assignment_id, missed_date)
        values (new.player_id, assignment.id, d)
        on conflict (original_schedule_assignment_id, missed_date) do nothing
        returning id into v_credit_id;

        if v_credit_id is not null and not exists (
          select 1 from public.notification_preferences np
          where np.user_id = new.player_id and np.category = 'makeup' and np.enabled = false
        ) then
          insert into public.notifications (user_id, type, category, title, body, screen)
          values (new.player_id, 'makeup', 'makeup', '📅 Makeup Lesson Needed',
            'You missed a private lesson — find a makeup slot on your Calendar.', '(tabs)/calendar');
        end if;
      end if;
      d := d + 1;
    end loop;
  end loop;

  for tier in
    select distinct gt.id as group_tier_id, gt.club_id, lts.day_of_week, lts.is_recurring, lts.one_time_date
    from public.player_tier_assignments pta
    join public.group_tiers gt on gt.id = pta.group_tier_id
    join public.lesson_time_slots lts on lts.group_tier_id = gt.id
    where pta.player_id = new.player_id
  loop
    d := new.start_date;
    while d <= new.end_date loop
      if (tier.is_recurring and extract(dow from d)::smallint = tier.day_of_week)
         or (not tier.is_recurring and tier.one_time_date = d) then
        insert into public.attendance (
          club_id, group_tier_id, player_id, lesson_date, attending,
          toggled_by, toggled_by_user_id, toggled_at, coach_override, locked
        ) values (
          tier.club_id, tier.group_tier_id, new.player_id, d, false,
          'system', new.player_id, now(), true, true
        )
        on conflict (group_tier_id, player_id, lesson_date) where group_tier_id is not null
        do update set attending = false, coach_override = true, locked = true;
      end if;
      d := d + 1;
    end loop;
  end loop;

  return new;
end;
$$;

-- ── Scheduling context RPC ────────────────────────────────────────────────
-- Everything a client needs to compute makeup-slot suggestions itself, in
-- one security-definer call — a plain player has no RLS visibility into
-- other coaches'/players' schedule_assignments, courts, or lesson_time_slots
-- (by design), so the actual candidate-slot search has to run against data
-- fetched through here rather than ad-hoc queries the player's own session
-- could never see. The search/ranking logic itself lives in
-- lib/makeup.ts (getMakeupSuggestions) — kept out of SQL so it stays easy to
-- read, adjust, and reason about.

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
  select * into v_credit from public.makeup_lesson_credits where id = p_credit_id and player_id = auth.uid();
  if not found then
    raise exception 'Makeup credit not found';
  end if;

  select * into v_assignment from public.schedule_assignments where id = v_credit.original_schedule_assignment_id;
  if not found then
    raise exception 'Original lesson not found';
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
        where sa2.club_id = v_club_id and mlc.status in ('scheduled', 'pending_approval') and mlc.scheduled_date is not null
        union all
        select jsonb_build_object(
          'coachId', lc3.coach_id, 'courtId', gmc.scheduled_court_id, 'date', gmc.scheduled_date,
          'startTime', gmc.scheduled_start_time, 'endTime', gmc.scheduled_end_time
        ) as x
        from public.group_makeup_credits gmc
        join public.group_tiers gt2 on gt2.id = gmc.group_tier_id
        join public.lesson_coaches lc3 on lc3.group_tier_id = gt2.id
        where gt2.club_id = v_club_id and gmc.status in ('scheduled', 'pending_approval') and gmc.scheduled_date is not null
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
