-- "General Notes" on the exercise screen were only saved to AsyncStorage
-- (device-local, keyed just by exercise name — not tied to the account at
-- all), so they never synced to the server and could bleed between accounts
-- signed in on the same device. Move them into the DB, scoped per user.
create table if not exists public.exercise_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  exercise_name text not null,
  note text,
  updated_at timestamptz not null default now(),
  unique (user_id, exercise_name)
);

alter table public.exercise_notes enable row level security;

drop policy if exists "exercise_notes_select" on public.exercise_notes;
create policy "exercise_notes_select" on public.exercise_notes
  for select
  using (user_id = auth.uid());

drop policy if exists "exercise_notes_insert" on public.exercise_notes;
create policy "exercise_notes_insert" on public.exercise_notes
  for insert
  with check (user_id = auth.uid());

drop policy if exists "exercise_notes_update" on public.exercise_notes;
create policy "exercise_notes_update" on public.exercise_notes
  for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "exercise_notes_delete" on public.exercise_notes;
create policy "exercise_notes_delete" on public.exercise_notes
  for delete
  using (user_id = auth.uid());
