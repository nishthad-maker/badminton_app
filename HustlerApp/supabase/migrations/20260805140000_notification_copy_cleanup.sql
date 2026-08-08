-- Notification copy cleanup: server-side notification titles were carrying
-- decorative emoji on top of already-verbose bodies. The in-app bell already
-- renders a category icon per row (notification-center.tsx CATEGORY_ICON),
-- so an emoji in the title is redundant there; and on the OS push tray it
-- reads as noisy rather than informative. Dropping it from every
-- function-generated notification and trimming a couple of bodies that just
-- restated their own title. Client-side copy (lib/notifications.ts,
-- lib/routineReminders.ts) was cleaned up the same way in this batch, kept
-- out of this migration since it needs no DB change.
--
-- CREATE OR REPLACE for all five — each reproduces its most recent
-- authoritative body verbatim (per the "grep for every create or replace
-- before editing" gotcha in project_parent_calendar_and_assignments), with
-- only the title/body literals touched.

-- ── send_post_lesson_nudges — latest body: 20260731100000 ──────────────────
create or replace function public.send_post_lesson_nudges()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_local_now timestamp := (now() at time zone 'Asia/Kolkata');
  v_local_date date := v_local_now::date;
  v_local_time time := v_local_now::time;
  v_dow smallint := extract(dow from v_local_date)::smallint;
  r record;
  v_log_id uuid;
  v_coach_name text;
  v_already_journaled boolean;
  v_token text;
  v_title text := 'How was your lesson?';
  v_body text;
begin
  for r in
    select sa.id, sa.player_id, sa.coach_id
    from public.schedule_assignments sa
    where sa.day_of_week = v_dow
      and sa.end_time is not null
      and sa.end_time <= v_local_time
      and sa.end_time >= (v_local_time - interval '40 minutes')
      and sa.valid_from <= v_local_date
      and (sa.valid_until is null or sa.valid_until >= v_local_date)
      and not exists (
        select 1 from public.schedule_exceptions se
        where se.schedule_assignment_id = sa.id and se.date = v_local_date
      )
  loop
    select exists (
      select 1 from public.journal_entries je
      where je.user_id = r.player_id and je.entry_type = 'lesson' and je.entry_date = v_local_date
    ) into v_already_journaled;
    if v_already_journaled then continue; end if;

    if exists (
      select 1 from public.notification_preferences np
      where np.user_id = r.player_id and np.category = 'lesson_recap' and np.enabled = false
    ) then continue; end if;

    insert into public.lesson_notification_log (schedule_assignment_id, notify_date, kind)
    values (r.id, v_local_date, 'post_lesson_nudge')
    on conflict do nothing
    returning id into v_log_id;
    if v_log_id is null then continue; end if;

    select full_name into v_coach_name from public.profiles where id = r.coach_id;
    v_body := 'Jot down what you worked on with ' || coalesce(v_coach_name, 'your coach') || ' today.';

    insert into public.notifications (user_id, type, category, title, body, screen)
    values (r.player_id, 'lesson_recap', 'lesson_recap', v_title, v_body, '(tabs)?openJournal=lesson');

    select token into v_token from public.push_tokens where user_id = r.player_id limit 1;
    if v_token is not null then
      perform net.http_post(
        url := 'https://exp.host/--/api/v2/push/send',
        headers := '{"Content-Type": "application/json"}'::jsonb,
        body := jsonb_build_object(
          'to', v_token, 'title', v_title, 'body', v_body,
          'data', jsonb_build_object('screen', '(tabs)?openJournal=lesson'),
          'sound', 'default', 'priority', 'high'
        )
      );
    end if;
  end loop;
end;
$$;

-- ── send_evening_lesson_reminders — latest body: 20260731100000 ────────────
create or replace function public.send_evening_lesson_reminders()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_local_now timestamp := (now() at time zone 'Asia/Kolkata');
  v_tomorrow date := (v_local_now::date + 1);
  v_dow smallint := extract(dow from v_tomorrow)::smallint;
  r record;
  v_log_id uuid;
  v_coach_name text;
  v_last_entry text;
  v_token text;
  v_title text;
  v_body text;
begin
  for r in
    select sa.id, sa.player_id, sa.coach_id, sa.start_time
    from public.schedule_assignments sa
    where sa.day_of_week = v_dow
      and sa.valid_from <= v_tomorrow
      and (sa.valid_until is null or sa.valid_until >= v_tomorrow)
      and not exists (
        select 1 from public.schedule_exceptions se
        where se.schedule_assignment_id = sa.id and se.date = v_tomorrow
      )
  loop
    if exists (
      select 1 from public.notification_preferences np
      where np.user_id = r.player_id and np.category = 'lesson_reminder' and np.enabled = false
    ) then continue; end if;

    insert into public.lesson_notification_log (schedule_assignment_id, notify_date, kind)
    values (r.id, v_tomorrow, 'evening_reminder')
    on conflict do nothing
    returning id into v_log_id;
    if v_log_id is null then continue; end if;

    select full_name into v_coach_name from public.profiles where id = r.coach_id;

    select je.free_text into v_last_entry
    from public.journal_entries je
    where je.user_id = r.player_id and je.entry_type = 'lesson' and je.free_text is not null and je.is_draft = false
    order by je.entry_date desc, je.created_at desc
    limit 1;

    v_title := 'Private lesson tomorrow';
    v_body := 'With ' || coalesce(v_coach_name, 'your coach') || ' at ' || to_char(r.start_time, 'HH12:MI AM') || '.';
    if v_last_entry is not null then
      v_body := v_body || ' Last time: "' || left(v_last_entry, 80) || case when length(v_last_entry) > 80 then '...' else '' end || '"';
    end if;

    insert into public.notifications (user_id, type, category, title, body, screen)
    values (r.player_id, 'lesson_reminder', 'lesson_reminder', v_title, v_body, 'journal-history');

    select token into v_token from public.push_tokens where user_id = r.player_id limit 1;
    if v_token is not null then
      perform net.http_post(
        url := 'https://exp.host/--/api/v2/push/send',
        headers := '{"Content-Type": "application/json"}'::jsonb,
        body := jsonb_build_object(
          'to', v_token, 'title', v_title, 'body', v_body,
          'data', jsonb_build_object('screen', 'journal-history'),
          'sound', 'default', 'priority', 'high'
        )
      );
    end if;
  end loop;
end;
$$;

-- ── generate_cancellation_makeup_credit — latest body: 20260728120000 ──────
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
      values (v_player_id, 'makeup', 'makeup', 'Makeup Lesson Needed',
        'Find a makeup slot on your Calendar.', '(tabs)/calendar');
    end if;
  end if;
  return new;
end;
$$;

-- ── generate_tournament_exceptions — latest body: 20260728120000 ───────────
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
          values (new.player_id, 'makeup', 'makeup', 'Makeup Lesson Needed',
            'Find a makeup slot on your Calendar.', '(tabs)/calendar');
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

-- ── request_join_club_as_coach — latest body: 20260803200000 ───────────────
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
    select 1 from public.club_coaches where club_id = target.id and coach_id = auth.uid()
  ) into v_already_member;

  insert into public.club_coaches (club_id, coach_id, role, status)
  values (target.id, auth.uid(), 'staff', 'pending')
  on conflict (club_id, coach_id) do nothing;

  if not v_already_member and target.owner_id is not null and not exists (
    select 1 from public.notification_preferences np
    where np.user_id = target.owner_id and np.category = 'club' and np.enabled = false
  ) then
    select full_name into caller_name from public.profiles where id = auth.uid();
    insert into public.notifications (user_id, type, category, title, body, screen)
    values (
      target.owner_id, 'club_coach_join_request', 'club',
      'A coach wants to join',
      coalesce(caller_name, 'A coach') || ' requested to join ' || target.name || ' as a coach.',
      '(club-admin)/club-settings'
    );
  end if;

  return query select target.id, target.name;
end;
$$;
