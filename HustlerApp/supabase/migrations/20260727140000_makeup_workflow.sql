-- Makeup credits previously only ever reached 'available' — nothing let a
-- club move one forward, so "owed -> scheduled -> done" from the spec didn't
-- exist as a real workflow. Renames the status values to match the spec's
-- language and adds the fields needed to record what the makeup was
-- rescheduled to. Applies to both makeup_lesson_credits (private lessons)
-- and group_makeup_credits (group lessons, only ever created when a club has
-- allow_group_makeup on).

alter table public.makeup_lesson_credits drop constraint if exists makeup_lesson_credits_status_check;
update public.makeup_lesson_credits set status = 'owed' where status = 'available';
update public.makeup_lesson_credits set status = 'done' where status = 'redeemed';
alter table public.makeup_lesson_credits alter column status set default 'owed';
alter table public.makeup_lesson_credits add constraint makeup_lesson_credits_status_check check (status in ('owed', 'scheduled', 'done'));
alter table public.makeup_lesson_credits add column if not exists scheduled_date date;
alter table public.makeup_lesson_credits add column if not exists scheduled_start_time time;
alter table public.makeup_lesson_credits add column if not exists scheduled_end_time time;
alter table public.makeup_lesson_credits add column if not exists scheduled_court_id uuid references public.courts(id) on delete set null;

alter table public.group_makeup_credits drop constraint if exists group_makeup_credits_status_check;
update public.group_makeup_credits set status = 'owed' where status = 'available';
update public.group_makeup_credits set status = 'done' where status = 'redeemed';
alter table public.group_makeup_credits alter column status set default 'owed';
alter table public.group_makeup_credits add constraint group_makeup_credits_status_check check (status in ('owed', 'scheduled', 'done'));
alter table public.group_makeup_credits add column if not exists scheduled_date date;
alter table public.group_makeup_credits add column if not exists scheduled_start_time time;
alter table public.group_makeup_credits add column if not exists scheduled_end_time time;
alter table public.group_makeup_credits add column if not exists scheduled_court_id uuid references public.courts(id) on delete set null;
