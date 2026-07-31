-- Full removal of the Club system feature (tables, functions, triggers) --
-- the feature is being dropped, not iterated on.
drop trigger if exists trg_enforce_class_group_capacity on public.schedule_assignments;
drop function if exists public.enforce_class_group_capacity();
drop function if exists public.count_class_group_enrollment(uuid);
drop function if exists public.get_coach_schedule(uuid);
drop function if exists public.is_club_staff(uuid) cascade;
drop function if exists public.is_club_owner(uuid) cascade;

drop table if exists public.player_memberships cascade;
drop table if exists public.membership_plans cascade;
drop table if exists public.waitlist_entries cascade;
drop table if exists public.private_lesson_reschedules cascade;
drop table if exists public.tournament_blocks cascade;
drop table if exists public.schedule_exceptions cascade;
drop table if exists public.schedule_assignments cascade;
drop table if exists public.class_groups cascade;
drop table if exists public.club_coaches cascade;
drop table if exists public.club_settings cascade;
drop table if exists public.clubs cascade;
