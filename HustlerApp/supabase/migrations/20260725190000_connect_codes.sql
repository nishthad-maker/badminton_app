-- A short-lived code a player or coach can generate from their own profile
-- and hand to a club admin, as a precise alternative to searching by name
-- (players) or username (coaches) when connecting to a club. Search stays
-- available everywhere this is used — this is an additional path, not a
-- replacement.
--
-- Unlike parent_link_codes, this is NOT single-use: resolving a code here is
-- just an identity lookup, not the linking action itself (the caller still
-- has to separately insert into club_coaches / player_tier_assignments /
-- schedule_assignments, which can fail — e.g. a duplicate — after the
-- lookup). Burning the code on lookup would strand a legitimate retry.
create table public.connect_codes (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index on public.connect_codes (profile_id);

alter table public.connect_codes enable row level security;

create policy "self manages own connect codes" on public.connect_codes
  for all using (profile_id = auth.uid()) with check (profile_id = auth.uid());

-- Same reasoning as redeem_parent_link_code: a declarative "look up by code"
-- SELECT policy would have to be USING (true), letting any authenticated
-- user enumerate every active code. This resolves server-side instead, and
-- the table needs no public SELECT policy at all. The actual connecting
-- action (club_coaches / player_tier_assignments / schedule_assignments
-- insert) is still gated by those tables' own existing RLS regardless of
-- how the profile_id was found, so this function doesn't need its own
-- role-based authorization beyond a valid, unexpired code.
create function public.resolve_connect_code(input_code text)
returns table (profile_id uuid, full_name text, role text)
language plpgsql
security definer
set search_path = public
as $$
declare
  code_row public.connect_codes;
begin
  select * into code_row from public.connect_codes where code = upper(input_code);
  if code_row.id is null then
    raise exception 'That code wasn''t found. Double-check it and try again.';
  end if;
  if code_row.expires_at < now() then
    raise exception 'That code has expired. Ask for a new one.';
  end if;

  return query
    select p.id, coalesce(p.full_name, 'Member'), p.role
    from public.profiles p
    where p.id = code_row.profile_id;
end;
$$;
