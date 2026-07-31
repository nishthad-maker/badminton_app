-- Court tracking: a club can name its physical courts and assign group
-- tiers / private lessons to one, so double-booking the same court can be
-- flagged (checked client-side, not enforced here — see lib/courts.ts).

create table public.courts (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

create index on public.courts (club_id);

alter table public.group_tiers add column if not exists court_id uuid references public.courts(id) on delete set null;
alter table public.schedule_assignments add column if not exists court_id uuid references public.courts(id) on delete set null;

alter table public.courts enable row level security;

-- Any active coach (owner or staff) needs to see the club's courts to pick
-- one when creating a tier or lesson; only the owner manages the list itself.
create policy "club staff view courts" on public.courts
  for select using (public.is_club_staff(club_id));
create policy "owner creates courts" on public.courts
  for insert with check (public.is_club_owner(club_id));
create policy "owner updates courts" on public.courts
  for update using (public.is_club_owner(club_id)) with check (public.is_club_owner(club_id));
create policy "owner deletes courts" on public.courts
  for delete using (public.is_club_owner(club_id));
