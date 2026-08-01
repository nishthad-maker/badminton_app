-- Two scheduled private-lesson reminders, driven by pg_cron + pg_net so they
-- fire even when nobody has the app open — the existing reminder in
-- lib/lessonReminders.ts is explicitly client-triggered/best-effort only
-- (see its own header comment: fires only if a player's screen happens to be
-- open within 2 hours of a lesson). Both target private lessons only
-- (schedule_assignments) — group lessons aren't in scope here.
--
-- 1. Post-lesson nudge: ~0-40 min after a private lesson's end_time, prompt
--    the player to write a "Lesson learned" journal entry. Skipped if
--    they've already written one today. Deep-links into the Journal sheet
--    pre-set to the lesson-entry type via (tabs)?openJournal=lesson (see
--    JournalSheet's initialEntryType prop, JournalFAB's autoOpenType prop,
--    and (tabs)/_layout.tsx reading the query param).
-- 2. Evening-before reminder: once daily at a fixed local time, for anyone
--    with a private lesson the next day, surfacing their most recent
--    lesson-type journal entry as a "last time you wrote..." recap so they
--    can actually reread it before the lesson. Deep-links to journal-history.
--
-- Both assume the club's operating timezone is Asia/Kolkata (IST) — there is
-- no per-user/per-club timezone column anywhere in this schema yet, so this
-- is a single hardcoded assumption baked into both function bodies below. If
-- the club isn't IST, change the two 'Asia/Kolkata' literals (and the 14 UTC
-- cron hour on the evening job, which is 19:30 IST) accordingly.
--
-- Also fixes a real gap surfaced while building this: pushes were being sent
-- with a `data.screen` payload, but nothing in the app ever read it when a
-- system push notification was tapped — see the root _layout.tsx change in
-- this same batch of work for the client-side half of this fix.

create extension if not exists pg_cron;
create extension if not exists pg_net;

create table public.lesson_notification_log (
  id uuid primary key default gen_random_uuid(),
  schedule_assignment_id uuid not null references public.schedule_assignments(id) on delete cascade,
  notify_date date not null,
  kind text not null check (kind in ('post_lesson_nudge', 'evening_reminder')),
  created_at timestamptz not null default now(),
  unique (schedule_assignment_id, notify_date, kind)
);

alter table public.lesson_notification_log enable row level security;
-- No policies: this table is bookkeeping for the security-definer functions
-- below only — no client (player, coach, or admin) ever needs to touch it.

-- ── 1. Post-lesson nudge ──────────────────────────────────────────────────

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
  v_title text := '🏸 How was your lesson?';
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

select cron.schedule('post-lesson-nudges', '*/15 * * * *', $cron$select public.send_post_lesson_nudges();$cron$);

-- ── 2. Evening-before reminder ────────────────────────────────────────────

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

    v_title := '🌙 Private lesson tomorrow';
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

-- 14:00 UTC = 19:30 IST daily.
select cron.schedule('evening-lesson-reminders', '0 14 * * *', $cron$select public.send_evening_lesson_reminders();$cron$);
