-- Private lessons only had a start_time — add an end_time so the calendar
-- can show/enforce an actual duration. Existing rows default to a 1-hour
-- lesson (start_time + 1h) since that's the most common length.
alter table public.schedule_assignments add column end_time time;

update public.schedule_assignments
set end_time = (start_time + interval '1 hour')::time
where end_time is null;

alter table public.schedule_assignments alter column end_time set not null;

alter table public.schedule_assignments add constraint schedule_assignments_end_after_start
  check (end_time > start_time);
