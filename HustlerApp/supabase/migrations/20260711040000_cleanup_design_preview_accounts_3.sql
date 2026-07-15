-- Third cleanup pass: final throwaway design-preview account created
-- while verifying the completed editorial redesign across all screens.
-- Deletes usernames row first since it has a FK to auth.users.
delete from public.usernames where user_id in (
  select id from auth.users where email like 'design-preview-%@example.com'
);
delete from public.profiles where id in (
  select id from auth.users where email like 'design-preview-%@example.com'
);
delete from auth.users where email like 'design-preview-%@example.com';
