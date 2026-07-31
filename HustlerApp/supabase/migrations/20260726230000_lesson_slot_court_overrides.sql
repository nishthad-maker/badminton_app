-- Per-date court override for a recurring group-lesson time slot. The
-- slot's own lesson_time_slot_courts remain the "every week" default (set
-- once, repeats automatically, no admin work) — this table only ever holds
-- the rare exception: "on this one date, this slot actually used these
-- courts instead" (e.g. a one-off rental conflict). Mirrors the existing
-- schedule_exceptions precedent for private lessons (a management action,
-- not a rendered per-date calendar — this app's calendar views are all
-- recurring-weekly-template visualizations, not concrete date grids, and
-- this override follows that same scope).
create table public.lesson_time_slot_court_overrides (
  id uuid primary key default gen_random_uuid(),
  lesson_time_slot_id uuid not null references public.lesson_time_slots(id) on delete cascade,
  date date not null,
  created_at timestamptz not null default now(),
  unique (lesson_time_slot_id, date)
);
create index on public.lesson_time_slot_court_overrides (lesson_time_slot_id);

create table public.lesson_time_slot_court_override_courts (
  id uuid primary key default gen_random_uuid(),
  override_id uuid not null references public.lesson_time_slot_court_overrides(id) on delete cascade,
  court_id uuid not null references public.courts(id) on delete cascade,
  unique (override_id, court_id)
);
create index on public.lesson_time_slot_court_override_courts (override_id);

alter table public.lesson_time_slot_court_overrides enable row level security;
alter table public.lesson_time_slot_court_override_courts enable row level security;

-- Same trust level as every other lesson_time_slots-adjacent table: any
-- active staff member of the club can view/manage, matching the "Group
-- Lessons is a shared dashboard-level resource" decision from the roster
-- rework (not per-coach siloed like private lessons).
create policy "club staff view court overrides" on public.lesson_time_slot_court_overrides
  for select using (
    exists (select 1 from public.lesson_time_slots lts join public.group_tiers gt on gt.id = lts.group_tier_id where lts.id = lesson_time_slot_id and public.is_club_staff(gt.club_id))
  );
create policy "club staff manage court overrides" on public.lesson_time_slot_court_overrides
  for all using (
    exists (select 1 from public.lesson_time_slots lts join public.group_tiers gt on gt.id = lts.group_tier_id where lts.id = lesson_time_slot_id and public.is_club_staff(gt.club_id))
  ) with check (
    exists (select 1 from public.lesson_time_slots lts join public.group_tiers gt on gt.id = lts.group_tier_id where lts.id = lesson_time_slot_id and public.is_club_staff(gt.club_id))
  );

create policy "club staff view court override courts" on public.lesson_time_slot_court_override_courts
  for select using (
    exists (
      select 1 from public.lesson_time_slot_court_overrides o
      join public.lesson_time_slots lts on lts.id = o.lesson_time_slot_id
      join public.group_tiers gt on gt.id = lts.group_tier_id
      where o.id = override_id and public.is_club_staff(gt.club_id)
    )
  );
create policy "club staff manage court override courts" on public.lesson_time_slot_court_override_courts
  for all using (
    exists (
      select 1 from public.lesson_time_slot_court_overrides o
      join public.lesson_time_slots lts on lts.id = o.lesson_time_slot_id
      join public.group_tiers gt on gt.id = lts.group_tier_id
      where o.id = override_id and public.is_club_staff(gt.club_id)
    )
  ) with check (
    exists (
      select 1 from public.lesson_time_slot_court_overrides o
      join public.lesson_time_slots lts on lts.id = o.lesson_time_slot_id
      join public.group_tiers gt on gt.id = lts.group_tier_id
      where o.id = override_id and public.is_club_staff(gt.club_id)
    )
  );
