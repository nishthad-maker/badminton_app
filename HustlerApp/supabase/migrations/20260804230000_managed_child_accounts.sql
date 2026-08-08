-- Lets a parent create a full player profile for a kid who doesn't have
-- their own email yet — the profile still has a real auth.users row (a
-- placeholder email + random password, created server-side via the
-- create-managed-child edge function with the service-role key, since
-- profiles.id is FK'd to auth.users.id and there's no client-side insert
-- policy on profiles), but the parent never needs those credentials: all
-- access flows through the parent's own session + the existing
-- is_accepted_parent_of()/parent_children mechanism, unchanged.
--
-- managed_by_parent_id marks which parent created it (and thus owns the
-- login credentials, for a future "claim this account" flow — not built
-- yet). claimed_at stays null until the kid sets up their own real
-- email/password on that same row; both null together just means "a normal,
-- always-independent account" as today.
alter table public.profiles add column managed_by_parent_id uuid references public.profiles(id);
alter table public.profiles add column claimed_at timestamptz;
