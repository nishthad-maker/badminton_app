-- A second, distinct class of the same account-deletion bug fixed in
-- 20260725150000: several tables reference auth.users(id) DIRECTLY (not
-- through public.profiles) with the default NO ACTION delete rule, and none
-- of them were ever cleaned up by any of the app's delete-account flows.
-- This blocks deleting the underlying auth user outright (via the app's
-- delete-account edge function OR a manual dashboard delete) with a
-- foreign-key violation the moment the account has ever made a community
-- post/reply/like/report, set a username, or customized exercise settings.
alter table public.community_posts drop constraint community_posts_user_id_fkey;
alter table public.community_posts add constraint community_posts_user_id_fkey
  foreign key (user_id) references auth.users(id) on delete cascade;

alter table public.post_replies drop constraint post_replies_user_id_fkey;
alter table public.post_replies add constraint post_replies_user_id_fkey
  foreign key (user_id) references auth.users(id) on delete cascade;

alter table public.post_likes drop constraint post_likes_user_id_fkey;
alter table public.post_likes add constraint post_likes_user_id_fkey
  foreign key (user_id) references auth.users(id) on delete cascade;

alter table public.post_reports drop constraint post_reports_reported_by_fkey;
alter table public.post_reports add constraint post_reports_reported_by_fkey
  foreign key (reported_by) references auth.users(id) on delete cascade;

alter table public.exercise_settings drop constraint exercise_settings_user_id_fkey;
alter table public.exercise_settings add constraint exercise_settings_user_id_fkey
  foreign key (user_id) references auth.users(id) on delete cascade;

alter table public.usernames drop constraint usernames_user_id_fkey;
alter table public.usernames add constraint usernames_user_id_fkey
  foreign key (user_id) references auth.users(id) on delete cascade;

alter table public.custom_exercises drop constraint custom_exercises_user_id_fkey;
alter table public.custom_exercises add constraint custom_exercises_user_id_fkey
  foreign key (user_id) references auth.users(id) on delete cascade;

alter table public.opponent_log_messages drop constraint opponent_log_messages_sender_id_fkey;
alter table public.opponent_log_messages add constraint opponent_log_messages_sender_id_fkey
  foreign key (sender_id) references auth.users(id) on delete cascade;
