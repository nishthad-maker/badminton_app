-- Extends the "Tournament" calendar event type with the extra fields it
-- needs (multi-day date range, registration deadline/link) plus a slot to
-- persist the scheduled local reminder notification id so it can be
-- cancelled/rescheduled on edit or delete, same pattern as
-- routines.notification_ids.
alter table public.calendar_events
  add column if not exists event_end_date date;

alter table public.calendar_events
  add column if not exists registration_deadline date;

alter table public.calendar_events
  add column if not exists registration_link text;

alter table public.calendar_events
  add column if not exists reminder_notification_id text;
