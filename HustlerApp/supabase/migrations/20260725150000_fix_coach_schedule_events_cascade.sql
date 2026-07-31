-- coach_schedule_events had ON DELETE NO ACTION on both coach_id and
-- player_id (pre-existing, unrelated to the Club work). The player-side
-- "Delete Account" flow never cleaned up rows where the player appears as
-- player_id in a coach's schedule events, so deleting a player's account
-- would fail outright with a foreign-key violation the moment any coach had
-- ever logged a private lesson/tournament/note about them. Every other
-- profiles(id) reference in this schema cascades; bring this one in line so
-- account deletion can't be silently blocked by this table again.
alter table public.coach_schedule_events drop constraint coach_schedule_events_coach_id_fkey;
alter table public.coach_schedule_events add constraint coach_schedule_events_coach_id_fkey
  foreign key (coach_id) references public.profiles(id) on delete cascade;

alter table public.coach_schedule_events drop constraint coach_schedule_events_player_id_fkey;
alter table public.coach_schedule_events add constraint coach_schedule_events_player_id_fkey
  foreign key (player_id) references public.profiles(id) on delete cascade;
