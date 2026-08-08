-- One-off "just this week" private bookings have no private_lesson_plans
-- row (no session budget to track — see private_lesson_plans.sql), so they
-- were entirely excluded from private_lesson_sessions history. They're
-- logged directly at booking time now (client-side, in
-- createPrivateLessonPlan/createPrivateLessonSlots) rather than by the cron,
-- so plan_id has to allow null for those rows.
alter table public.private_lesson_sessions alter column plan_id drop not null;
