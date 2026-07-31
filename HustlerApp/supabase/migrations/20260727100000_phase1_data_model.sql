-- Phase 1 spec reconciliation. See project memory "phase1-badminton-spec" for
-- the full mapping of spec requirements to existing schema. This migration
-- adds: skill levels, a roster-scoped (club_members-based) lesson-player
-- search RPC (distinct from the existing coach_connections-based
-- search_club_connected_players, which stays as the club roster onboarding
-- search), a group-lesson-capable waitlist, plain-cancellation makeup
-- credits, a unified Attendance model (default-on toggle, lock-after-cutoff,
-- coach-override-always-wins) covering both group and private lessons, and
-- a generalized notifications system (title/body + per-category
-- per-user preferences) on top of the existing narrow `notifications` table.
--
-- Explicit scope cut: semi-private/sparring lesson types were dropped from
-- Phase 1 per product decision (private lessons stay strictly 1 coach + 1
-- player, schedule_assignments unchanged). Group-lesson waitlist promotion
-- via tournament exclusion was NOT wired automatically — group_tiers are
-- deliberately uncapped (an earlier, deliberate re-scope away from a
-- capacity model), so there's no real "spot" to open; the schema now
-- supports a group-scoped waitlist row for a club to manage manually, but
-- automatic promotion only exists for the already-working private-lesson
-- waitlist.

-- ── Skill levels ------------------------------------------------------------

alter table public.clubs add column if not exists skill_levels text[] not null
  default array['Beginner','Intermediate','Advanced','Junior Elite','High Performance'];

alter table public.club_coaches add column if not exists assigned_levels text[] not null default '{}';

alter table public.club_members add column if not exists level text;

-- ── Club settings: group makeup opt-in ---------------------------------------

alter table public.club_settings add column if not exists allow_group_makeup boolean not null default false;

-- ── Roster-scoped lesson-player search (distinct from roster-onboarding search) --

create function public.search_club_roster_players(input_club_id uuid, query text)
returns table (id uuid, full_name text, email text, level text)
language sql
security definer
stable
set search_path = public
as $$
  select p.id, p.full_name, p.email, cm.level
  from public.club_members cm
  join public.profiles p on p.id = cm.player_id
  where public.is_club_staff(input_club_id)
    and cm.club_id = input_club_id
    and cm.status = 'active'
    and (query = '' or p.full_name ilike '%' || query || '%' or p.email ilike '%' || query || '%')
  order by p.full_name
  limit 25;
$$;

grant execute on function public.search_club_roster_players(uuid, text) to authenticated;

-- ── Waitlist: allow a group-lesson target, not just private/per-coach -------

alter table public.waitlist_entries add column if not exists group_tier_id uuid references public.group_tiers(id) on delete cascade;
alter table public.waitlist_entries alter column coach_id drop not null;
alter table public.waitlist_entries add constraint waitlist_entries_target_check
  check (coach_id is not null or group_tier_id is not null);

drop policy if exists "owner or own coach manages waitlist" on public.waitlist_entries;
create policy "owner, own coach, or club staff for group tier manages waitlist" on public.waitlist_entries
  for all using (
    public.is_club_owner(club_id) or coach_id = auth.uid()
    or (group_tier_id is not null and public.is_club_staff(club_id))
  ) with check (
    public.is_club_owner(club_id) or coach_id = auth.uid()
    or (group_tier_id is not null and public.is_club_staff(club_id))
  );

-- ── Makeup credits for plain (non-tournament) private-lesson cancellations --

create function public.generate_cancellation_makeup_credit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.reason = 'cancelled' then
    insert into public.makeup_lesson_credits (player_id, original_schedule_assignment_id, missed_date)
    select sa.player_id, sa.id, new.date
    from public.schedule_assignments sa
    where sa.id = new.schedule_assignment_id
    on conflict (original_schedule_assignment_id, missed_date) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_generate_cancellation_makeup_credit on public.schedule_exceptions;
create trigger trg_generate_cancellation_makeup_credit
  after insert on public.schedule_exceptions
  for each row execute function public.generate_cancellation_makeup_credit();

-- Group-lesson makeup credits (only ever created when club_settings.allow_group_makeup)
create table public.group_makeup_credits (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.profiles(id) on delete cascade,
  group_tier_id uuid not null references public.group_tiers(id) on delete cascade,
  missed_date date not null,
  status text not null default 'available' check (status in ('available', 'redeemed')),
  redeemed_date date,
  created_at timestamptz not null default now(),
  unique (group_tier_id, player_id, missed_date)
);

alter table public.group_makeup_credits enable row level security;

create policy "player views own group makeup credits" on public.group_makeup_credits
  for select using (player_id = auth.uid());
create policy "parent views childs group makeup credits" on public.group_makeup_credits
  for select using (public.is_accepted_parent_of(player_id));
create policy "club staff manages group makeup credits" on public.group_makeup_credits
  for all using (
    exists (select 1 from public.group_tiers gt where gt.id = group_tier_id and public.is_club_staff(gt.club_id))
  ) with check (
    exists (select 1 from public.group_tiers gt where gt.id = group_tier_id and public.is_club_staff(gt.club_id))
  );

-- ── Unified Attendance model --------------------------------------------------
-- One row per (lesson occurrence, player, date). Absence of a row means the
-- default-on state (attending). Writes only ever go through
-- toggle_attendance() below, never direct insert/update, so the
-- lock-after-cutoff and coach-override-always-wins rules can't be bypassed
-- by a client crafting its own request.

create table public.attendance (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete cascade,
  group_tier_id uuid references public.group_tiers(id) on delete cascade,
  schedule_assignment_id uuid references public.schedule_assignments(id) on delete cascade,
  player_id uuid not null references public.profiles(id) on delete cascade,
  lesson_date date not null,
  attending boolean not null default true,
  toggled_by text not null check (toggled_by in ('player', 'parent', 'coach', 'system')),
  toggled_by_user_id uuid not null references public.profiles(id) on delete cascade,
  toggled_at timestamptz not null default now(),
  coach_override boolean not null default false,
  locked boolean not null default false,
  created_at timestamptz not null default now(),
  constraint attendance_one_target check (
    (group_tier_id is not null and schedule_assignment_id is null) or
    (group_tier_id is null and schedule_assignment_id is not null)
  )
);

create unique index attendance_group_unique on public.attendance (group_tier_id, player_id, lesson_date) where group_tier_id is not null;
create unique index attendance_private_unique on public.attendance (schedule_assignment_id, lesson_date) where schedule_assignment_id is not null;
create index on public.attendance (club_id);
create index on public.attendance (player_id);

alter table public.attendance enable row level security;

create policy "player views own attendance" on public.attendance
  for select using (player_id = auth.uid());
create policy "parent views childs attendance" on public.attendance
  for select using (public.is_accepted_parent_of(player_id));
create policy "club staff views attendance" on public.attendance
  for select using (public.is_club_staff(club_id));

create function public.toggle_attendance(
  p_group_tier_id uuid,
  p_schedule_assignment_id uuid,
  p_player_id uuid,
  p_lesson_date date,
  p_attending boolean,
  p_actor_role text
) returns public.attendance
language plpgsql
security definer
set search_path = public
as $$
declare
  v_club_id uuid;
  v_start_time time;
  v_cutoff_hrs int;
  v_lesson_ts timestamptz;
  v_existing public.attendance;
  v_row public.attendance;
begin
  if p_actor_role not in ('player', 'parent', 'coach') then
    raise exception 'invalid actor role';
  end if;
  if p_actor_role = 'player' and p_player_id <> auth.uid() then
    raise exception 'not authorized';
  end if;
  if p_actor_role = 'parent' and not public.is_accepted_parent_of(p_player_id) then
    raise exception 'not authorized';
  end if;
  if (p_group_tier_id is null) = (p_schedule_assignment_id is null) then
    raise exception 'exactly one of group_tier_id/schedule_assignment_id is required';
  end if;

  if p_group_tier_id is not null then
    select gt.club_id into v_club_id from public.group_tiers gt where gt.id = p_group_tier_id;
    select lts.start_time into v_start_time
      from public.lesson_time_slots lts
      where lts.group_tier_id = p_group_tier_id
        and (
          (lts.is_recurring and lts.day_of_week = extract(dow from p_lesson_date)::smallint)
          or (not lts.is_recurring and lts.one_time_date = p_lesson_date)
        )
      order by lts.start_time
      limit 1;
    select * into v_existing from public.attendance
      where group_tier_id = p_group_tier_id and player_id = p_player_id and lesson_date = p_lesson_date;
  else
    select sa.club_id, sa.start_time into v_club_id, v_start_time
      from public.schedule_assignments sa where sa.id = p_schedule_assignment_id;
    select * into v_existing from public.attendance
      where schedule_assignment_id = p_schedule_assignment_id and lesson_date = p_lesson_date;
  end if;

  if v_club_id is null then
    raise exception 'lesson not found';
  end if;
  if p_actor_role = 'coach' and not public.is_club_staff(v_club_id) then
    raise exception 'not authorized';
  end if;

  if v_existing.id is not null and v_existing.coach_override and p_actor_role <> 'coach' then
    raise exception 'attendance locked by coach override';
  end if;

  select cs.cancellation_notice_hours into v_cutoff_hrs from public.club_settings cs where cs.club_id = v_club_id;
  v_cutoff_hrs := coalesce(v_cutoff_hrs, 24);

  if p_actor_role <> 'coach' and v_start_time is not null then
    v_lesson_ts := (p_lesson_date::text || ' ' || v_start_time::text)::timestamptz;
    if v_lesson_ts - now() < make_interval(hours => v_cutoff_hrs) then
      raise exception 'attendance locked: past the % hour cancellation cutoff', v_cutoff_hrs;
    end if;
  end if;

  if p_group_tier_id is not null then
    insert into public.attendance (
      club_id, group_tier_id, player_id, lesson_date, attending,
      toggled_by, toggled_by_user_id, toggled_at, coach_override, locked
    ) values (
      v_club_id, p_group_tier_id, p_player_id, p_lesson_date, p_attending,
      p_actor_role, auth.uid(), now(), (p_actor_role = 'coach'), false
    )
    on conflict (group_tier_id, player_id, lesson_date) where group_tier_id is not null
    do update set attending = excluded.attending, toggled_by = excluded.toggled_by,
      toggled_by_user_id = excluded.toggled_by_user_id, toggled_at = excluded.toggled_at,
      coach_override = public.attendance.coach_override or excluded.coach_override
    returning * into v_row;

    if not p_attending and exists (
      select 1 from public.club_settings cs where cs.club_id = v_club_id and cs.allow_group_makeup
    ) then
      insert into public.group_makeup_credits (player_id, group_tier_id, missed_date)
      values (p_player_id, p_group_tier_id, p_lesson_date)
      on conflict (group_tier_id, player_id, missed_date) do nothing;
    end if;
  else
    insert into public.attendance (
      club_id, schedule_assignment_id, player_id, lesson_date, attending,
      toggled_by, toggled_by_user_id, toggled_at, coach_override, locked
    ) values (
      v_club_id, p_schedule_assignment_id, p_player_id, p_lesson_date, p_attending,
      p_actor_role, auth.uid(), now(), (p_actor_role = 'coach'), false
    )
    on conflict (schedule_assignment_id, lesson_date) where schedule_assignment_id is not null
    do update set attending = excluded.attending, toggled_by = excluded.toggled_by,
      toggled_by_user_id = excluded.toggled_by_user_id, toggled_at = excluded.toggled_at,
      coach_override = public.attendance.coach_override or excluded.coach_override
    returning * into v_row;

    if not p_attending then
      insert into public.makeup_lesson_credits (player_id, original_schedule_assignment_id, missed_date)
      values (p_player_id, p_schedule_assignment_id, p_lesson_date)
      on conflict (original_schedule_assignment_id, missed_date) do nothing;
    end if;
  end if;

  return v_row;
end;
$$;

grant execute on function public.toggle_attendance(uuid, uuid, uuid, date, boolean, text) to authenticated;

-- Tournament exclusion now also locks group-lesson attendance for the range,
-- in addition to the existing private-lesson schedule_exceptions/makeup path.
create or replace function public.generate_tournament_exceptions()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  assignment record;
  tier record;
  d date;
begin
  for assignment in
    select * from public.schedule_assignments
    where player_id = new.player_id
      and valid_from <= new.end_date
      and (valid_until is null or valid_until >= new.start_date)
  loop
    d := new.start_date;
    while d <= new.end_date loop
      if extract(dow from d)::smallint = assignment.day_of_week then
        insert into public.schedule_exceptions (schedule_assignment_id, date, reason)
        values (assignment.id, d, 'tournament')
        on conflict (schedule_assignment_id, date) do nothing;

        insert into public.makeup_lesson_credits (player_id, original_schedule_assignment_id, missed_date)
        values (new.player_id, assignment.id, d)
        on conflict (original_schedule_assignment_id, missed_date) do nothing;
      end if;
      d := d + 1;
    end loop;
  end loop;

  for tier in
    select distinct gt.id as group_tier_id, gt.club_id, lts.day_of_week, lts.is_recurring, lts.one_time_date
    from public.player_tier_assignments pta
    join public.group_tiers gt on gt.id = pta.group_tier_id
    join public.lesson_time_slots lts on lts.group_tier_id = gt.id
    where pta.player_id = new.player_id
  loop
    d := new.start_date;
    while d <= new.end_date loop
      if (tier.is_recurring and extract(dow from d)::smallint = tier.day_of_week)
         or (not tier.is_recurring and tier.one_time_date = d) then
        insert into public.attendance (
          club_id, group_tier_id, player_id, lesson_date, attending,
          toggled_by, toggled_by_user_id, toggled_at, coach_override, locked
        ) values (
          tier.club_id, tier.group_tier_id, new.player_id, d, false,
          'system', new.player_id, now(), true, true
        )
        on conflict (group_tier_id, player_id, lesson_date) where group_tier_id is not null
        do update set attending = false, coach_override = true, locked = true;
      end if;
      d := d + 1;
    end loop;
  end loop;

  return new;
end;
$$;

-- ── Notifications: generalize for a real in-app bell + per-category prefs --

alter table public.notifications add column if not exists title text;
alter table public.notifications add column if not exists body text;
alter table public.notifications add column if not exists club_id uuid references public.clubs(id) on delete cascade;
alter table public.notifications add column if not exists screen text;
alter table public.notifications add column if not exists category text;

create table public.notification_preferences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  category text not null,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, category)
);

alter table public.notification_preferences enable row level security;

create policy "user manages own notification preferences" on public.notification_preferences
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
