-- Lets a player attach a weekly schedule (days + one shared time) to a
-- routine, so it can surface in the Home screen's "For You" section on the
-- right day and drive a real local reminder notification at that time.
alter table public.routines
  add column if not exists scheduled_days jsonb not null default '[]'::jsonb;

alter table public.routines
  add column if not exists scheduled_time text;

-- Local notification identifiers returned by expo-notifications when the
-- reminders are scheduled, kept so they can be cancelled/rescheduled
-- whenever the routine's schedule changes or the routine is deleted.
alter table public.routines
  add column if not exists notification_ids jsonb not null default '[]'::jsonb;
