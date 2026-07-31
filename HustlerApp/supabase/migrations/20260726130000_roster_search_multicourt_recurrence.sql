-- Player Roster + Group Lessons rework, bundled:
--   1. Search-to-add replaces code-based player-club linking.
--   2. Group lessons become their own folder: multiple time slots (each
--      with its own day/time/courts/recurrence) + main/assistant coaches,
--      instead of one fixed day-array/start_time/single-coach/single-court.
--   3. Private lessons get an explicit is_recurring toggle (they already
--      had valid_from/valid_until, which is_recurring just makes explicit).

-- ── 1. Search-to-add ---------------------------------------------------

-- profiles has never stored email (it lives on auth.users, which client
-- code can't query under RLS) — add a denormalized copy so "search by name
-- or email" is a plain ilike on a table the client can already read.
-- Existing rows get backfilled from auth.users once, here; going forward
-- signup.tsx sets it directly on the initial profile upsert.
alter table public.profiles add column email text;
update public.profiles p set email = u.email from auth.users u where u.id = p.id and p.email is null;

-- The connect-code flow (a player/coach hands a short code to a club admin
-- as an alternative to searching by name) is fully superseded by
-- search-to-add — nothing else references this table.
drop function if exists public.resolve_connect_code(text);
drop table if exists public.connect_codes;

-- Player-initiated "join this club" by entering the club's player code is
-- replaced by the club/coach searching for and adding the player directly
-- (see club_members policy changes below). Coach-initiated club join by
-- code is unrelated and stays as-is.
drop function if exists public.request_join_club_as_player(text);
alter table public.club_settings drop column if exists player_join_code;
alter table public.club_members alter column status set default 'active';

-- Previously only the club owner could touch club_members at all (the
-- player got themselves a pending row via the code, and only the owner
-- could approve/reject/remove). Now that a coach/owner adds a player
-- directly, any active staff member needs to be able to search for and
-- insert players — but removing someone from the club roster entirely
-- stays an owner-level action, same tier as removing a coach.
drop policy if exists "owner manages club members" on public.club_members;
create policy "club staff view roster" on public.club_members
  for select using (public.is_club_staff(club_id));
create policy "club staff add players" on public.club_members
  for insert with check (public.is_club_staff(club_id));
create policy "owner updates club members" on public.club_members
  for update using (public.is_club_owner(club_id)) with check (public.is_club_owner(club_id));
create policy "owner removes club members" on public.club_members
  for delete using (public.is_club_owner(club_id));

-- Search itself needs a new SELECT policy: a coach/owner has to be able to
-- find an existing player profile that isn't connected to them in any way
-- yet (that's the entire point of search-to-add — existing accounts only,
-- never a guest/placeholder). Scoped to role='player' rows only, and only
-- visible to someone who is an active staff member of *some* club — same
-- trust level as the old connect-code lookup, just without the code.
create policy "club staff search player profiles" on public.profiles
  for select using (
    role = 'player' and exists (
      select 1 from public.club_coaches cc where cc.coach_id = auth.uid() and cc.status = 'active'
    )
  );

-- ── 2. Group lessons: folders with multiple time slots + multi-coach ----

-- Old policies reference group_tiers.coach_id directly, which this
-- migration drops — remove them before the column goes, replace after.
drop policy if exists "owner or teaching coach views tiers" on public.group_tiers;
drop policy if exists "owner or teaching coach views tier rosters" on public.player_tier_assignments;
drop policy if exists "owner or teaching coach views attendance" on public.group_attendance_exceptions;
drop policy if exists "owner creates tiers" on public.group_tiers;
drop policy if exists "owner updates tiers" on public.group_tiers;
drop policy if exists "owner deletes tiers" on public.group_tiers;
drop policy if exists "owner manages tier rosters" on public.player_tier_assignments;
drop policy if exists "owner deletes tier rosters" on public.player_tier_assignments;
drop policy if exists "owner manages attendance" on public.group_attendance_exceptions;

create table public.lesson_time_slots (
  id uuid primary key default gen_random_uuid(),
  group_tier_id uuid not null references public.group_tiers(id) on delete cascade,
  day_of_week smallint not null check (day_of_week between 0 and 6),
  start_time time not null,
  end_time time not null,
  is_recurring boolean not null default true,
  one_time_date date,
  created_at timestamptz not null default now(),
  check (end_time > start_time),
  check ((is_recurring and one_time_date is null) or (not is_recurring and one_time_date is not null))
);
create index on public.lesson_time_slots (group_tier_id);

create table public.lesson_time_slot_courts (
  id uuid primary key default gen_random_uuid(),
  lesson_time_slot_id uuid not null references public.lesson_time_slots(id) on delete cascade,
  court_id uuid not null references public.courts(id) on delete cascade,
  unique (lesson_time_slot_id, court_id)
);
create index on public.lesson_time_slot_courts (lesson_time_slot_id);

create table public.lesson_coaches (
  id uuid primary key default gen_random_uuid(),
  group_tier_id uuid not null references public.group_tiers(id) on delete cascade,
  coach_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'assistant' check (role in ('main', 'assistant')),
  created_at timestamptz not null default now(),
  unique (group_tier_id, coach_id)
);
create index on public.lesson_coaches (group_tier_id);
create index on public.lesson_coaches (coach_id);
-- Exactly one main coach per lesson.
create unique index one_main_coach_per_lesson on public.lesson_coaches (group_tier_id) where role = 'main';

-- Carry forward every existing tier's day-array + single start_time into
-- one slot row per day (end_time = start + 60min, the same assumed
-- duration already used app-side for tiers before they had a real
-- end_time), its single coach_id into a 'main' lesson_coaches row, and its
-- single court_id onto each of its new slot rows.
with slot_source as (
  select gt.id as group_tier_id, gt.court_id, d as day_of_week, gt.start_time,
         (gt.start_time + interval '60 minutes')::time as end_time
  from public.group_tiers gt, unnest(gt.day_of_week) as d
),
inserted_slots as (
  insert into public.lesson_time_slots (group_tier_id, day_of_week, start_time, end_time, is_recurring, one_time_date)
  select group_tier_id, day_of_week, start_time, end_time, true, null from slot_source
  returning id, group_tier_id, day_of_week, start_time
)
insert into public.lesson_time_slot_courts (lesson_time_slot_id, court_id)
select isl.id, ss.court_id
from inserted_slots isl
join slot_source ss on ss.group_tier_id = isl.group_tier_id and ss.day_of_week = isl.day_of_week and ss.start_time = isl.start_time
where ss.court_id is not null;

insert into public.lesson_coaches (group_tier_id, coach_id, role)
select id, coach_id, 'main' from public.group_tiers where coach_id is not null;

alter table public.group_tiers drop column day_of_week;
alter table public.group_tiers drop column start_time;
alter table public.group_tiers drop column coach_id;
alter table public.group_tiers drop column court_id;

alter table public.lesson_time_slots enable row level security;
alter table public.lesson_time_slot_courts enable row level security;
alter table public.lesson_coaches enable row level security;

-- Group Lessons is now a shared, dashboard-level resource rather than a
-- per-coach silo (unlike private lessons, which stay "owner or own coach"
-- only) — any active staff member of the club can view/create/edit/delete
-- any lesson, its slots, its courts, and its coach assignments. This also
-- sidesteps a chicken-and-egg problem: the very first lesson_coaches row
-- for a brand-new lesson can't be gated behind "is already an assigned
-- coach of this lesson".
create policy "club staff view tiers" on public.group_tiers
  for select using (public.is_club_staff(club_id));
create policy "club staff create tiers" on public.group_tiers
  for insert with check (public.is_club_staff(club_id));
create policy "club staff update tiers" on public.group_tiers
  for update using (public.is_club_staff(club_id)) with check (public.is_club_staff(club_id));
create policy "club staff delete tiers" on public.group_tiers
  for delete using (public.is_club_staff(club_id));

create policy "club staff view tier rosters" on public.player_tier_assignments
  for select using (exists (select 1 from public.group_tiers gt where gt.id = group_tier_id and public.is_club_staff(gt.club_id)));
create policy "club staff manage tier rosters" on public.player_tier_assignments
  for all using (exists (select 1 from public.group_tiers gt where gt.id = group_tier_id and public.is_club_staff(gt.club_id)))
  with check (exists (select 1 from public.group_tiers gt where gt.id = group_tier_id and public.is_club_staff(gt.club_id)));

create policy "club staff manage attendance" on public.group_attendance_exceptions
  for all using (
    exists (
      select 1 from public.player_tier_assignments pta join public.group_tiers gt on gt.id = pta.group_tier_id
      where pta.id = player_tier_assignment_id and public.is_club_staff(gt.club_id)
    )
  ) with check (
    exists (
      select 1 from public.player_tier_assignments pta join public.group_tiers gt on gt.id = pta.group_tier_id
      where pta.id = player_tier_assignment_id and public.is_club_staff(gt.club_id)
    )
  );

create policy "club staff view time slots" on public.lesson_time_slots
  for select using (exists (select 1 from public.group_tiers gt where gt.id = group_tier_id and public.is_club_staff(gt.club_id)));
create policy "club staff manage time slots" on public.lesson_time_slots
  for all using (exists (select 1 from public.group_tiers gt where gt.id = group_tier_id and public.is_club_staff(gt.club_id)))
  with check (exists (select 1 from public.group_tiers gt where gt.id = group_tier_id and public.is_club_staff(gt.club_id)));

create policy "club staff view slot courts" on public.lesson_time_slot_courts
  for select using (
    exists (select 1 from public.lesson_time_slots lts join public.group_tiers gt on gt.id = lts.group_tier_id where lts.id = lesson_time_slot_id and public.is_club_staff(gt.club_id))
  );
create policy "club staff manage slot courts" on public.lesson_time_slot_courts
  for all using (
    exists (select 1 from public.lesson_time_slots lts join public.group_tiers gt on gt.id = lts.group_tier_id where lts.id = lesson_time_slot_id and public.is_club_staff(gt.club_id))
  ) with check (
    exists (select 1 from public.lesson_time_slots lts join public.group_tiers gt on gt.id = lts.group_tier_id where lts.id = lesson_time_slot_id and public.is_club_staff(gt.club_id))
  );

create policy "club staff view lesson coaches" on public.lesson_coaches
  for select using (exists (select 1 from public.group_tiers gt where gt.id = group_tier_id and public.is_club_staff(gt.club_id)));
create policy "club staff manage lesson coaches" on public.lesson_coaches
  for all using (exists (select 1 from public.group_tiers gt where gt.id = group_tier_id and public.is_club_staff(gt.club_id)))
  with check (exists (select 1 from public.group_tiers gt where gt.id = group_tier_id and public.is_club_staff(gt.club_id)));

-- ── 3. Private lessons: explicit recurring toggle -------------------------

-- schedule_assignments already has valid_from/valid_until modeling exactly
-- "recurring forever unless an end date is set" — is_recurring is just a
-- friendlier on/off for that same mechanism (toggling off sets
-- valid_until = valid_from from the app side, so it becomes a single date).
alter table public.schedule_assignments add column is_recurring boolean not null default true;
