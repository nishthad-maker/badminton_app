-- Coach-authored notes about a player that the player can also see, as a
-- flat running list of individually-dated entries — distinct from
-- coach_player_notes, which is a single freeform blob only the coach ever
-- sees. There's no share toggle here: every row in this table is visible to
-- the player the moment it's created, so "shared" is implicit rather than a
-- per-note flag to manage.
--
-- Coach access mirrors coach_player_notes' own design (coach_id = auth.uid(),
-- no coach_connections dependency — see 20260729140000's note on why that
-- table was left connection-free) so club-only coaches can use this too.

create table if not exists public.coach_shared_notes (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references public.profiles(id) on delete cascade,
  player_id uuid not null references public.profiles(id) on delete cascade,
  note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists coach_shared_notes_player_idx on public.coach_shared_notes(player_id, created_at desc);
create index if not exists coach_shared_notes_coach_player_idx on public.coach_shared_notes(coach_id, player_id, created_at desc);

alter table public.coach_shared_notes enable row level security;

drop policy if exists "coach manages own shared notes" on public.coach_shared_notes;
create policy "coach manages own shared notes" on public.coach_shared_notes
  for all using (coach_id = auth.uid()) with check (coach_id = auth.uid());

drop policy if exists "player views notes shared with them" on public.coach_shared_notes;
create policy "player views notes shared with them" on public.coach_shared_notes
  for select using (player_id = auth.uid());
