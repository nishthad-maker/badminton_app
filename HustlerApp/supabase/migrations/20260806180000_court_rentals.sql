-- Walk-in court rental — a lightweight guest booking captured by name+phone
-- at the front desk, deliberately NOT tied to profiles/club_members. A
-- rental isn't a lesson and doesn't need an account; conflating it with the
-- player roster would drag in join-code/approval machinery that has no
-- purpose here.
create table public.court_rentals (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete cascade,
  court_id uuid not null references public.courts(id) on delete cascade,
  date date not null,
  start_time time not null,
  end_time time not null,
  renter_name text not null,
  renter_phone text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  check (end_time > start_time)
);

create index court_rentals_court_date_idx on public.court_rentals (court_id, date);

alter table public.court_rentals enable row level security;

create policy "club staff manage rentals" on public.court_rentals
  for all using (is_club_staff(club_id)) with check (is_club_staff(club_id));
