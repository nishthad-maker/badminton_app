-- Reminder time now varies per day instead of one shared time for every
-- scheduled day (e.g. Mon 5:00 AM but Tue 6:30 AM on the same routine).
-- scheduled_days stays as the quick "which days" list used for the Home
-- screen's "For You" filter; scheduled_times is the per-day source of truth
-- for what time each of those days fires at.
alter table public.routines
  add column if not exists scheduled_times jsonb not null default '{}'::jsonb;

alter table public.routines
  drop column if exists scheduled_time;
