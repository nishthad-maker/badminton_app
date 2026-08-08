-- Ad-hoc court closures (e.g. resurfacing) — a standalone date/time block on
-- a court, distinct from lesson_time_slot_court_overrides (which only swaps
-- the court for ONE occurrence of an existing lesson slot). Staff-writable
-- like club_settings, not owner-gated like clubs — this is day-to-day
-- operational data, not sensitive club identity/ownership info.
create table public.court_maintenance_blocks (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete cascade,
  court_id uuid not null references public.courts(id) on delete cascade,
  date date not null,
  start_time time not null,
  end_time time not null,
  reason text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  check (end_time > start_time)
);

create index court_maintenance_blocks_court_date_idx on public.court_maintenance_blocks (court_id, date);

alter table public.court_maintenance_blocks enable row level security;

create policy "club staff manage maintenance blocks" on public.court_maintenance_blocks
  for all using (is_club_staff(club_id)) with check (is_club_staff(club_id));
