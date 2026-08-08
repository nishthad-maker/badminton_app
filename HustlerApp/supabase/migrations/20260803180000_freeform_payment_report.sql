-- Parent "Report a Payment" no longer requires picking a matched private
-- lesson/group tier from a list — just a free-text description of what it's
-- for. `related_to` gets a third allowed value ('other') for this case, with
-- both schedule_assignment_id and player_tier_assignment_id left null and
-- the description stored in the new `note` column instead.
alter table public.lesson_payments add column if not exists note text;

alter table public.lesson_payments drop constraint if exists lesson_payments_related_to_check;
alter table public.lesson_payments add constraint lesson_payments_related_to_check
  check (related_to in ('private_lesson', 'group_tier', 'other'));
