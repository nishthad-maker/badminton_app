-- Supabase Auth deliberately returns the same "Invalid login credentials"
-- error whether the email has no account at all or the password is wrong,
-- to prevent trivial account enumeration. The login screen wants to tell
-- these apart (to point a no-account user at Sign Up instead of just
-- "wrong password"), which needs a SECURITY DEFINER check against
-- auth.users — the client can never query that schema directly.
create function public.email_has_account(input_email text)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (select 1 from auth.users where lower(email) = lower(input_email));
$$;

grant execute on function public.email_has_account(text) to anon, authenticated;
