-- A plain staff coach's Club Schedule view is otherwise read-only (see
-- club-calendar.tsx's canFullyManage/isOwnDay split) — this is the one
-- self-service exception: flagging that they can't make a specific date of
-- their own lesson, which still needs the club's approval before the date
-- actually gets cancelled (approval performs the exact same
-- schedule_exceptions insert club-calendar.tsx's own direct "Cancel One
-- Date" action does, so the existing makeup-credit trigger fires either way).

create table public.lesson_cancellation_requests (
  id uuid primary key default gen_random_uuid(),
  schedule_assignment_id uuid not null references public.schedule_assignments(id) on delete cascade,
  coach_id uuid not null references public.profiles(id) on delete cascade,
  club_id uuid not null references public.clubs(id) on delete cascade,
  cancel_date date not null,
  note text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'declined')),
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

create index on public.lesson_cancellation_requests (club_id);
create index on public.lesson_cancellation_requests (coach_id);
create index on public.lesson_cancellation_requests (schedule_assignment_id);

alter table public.lesson_cancellation_requests enable row level security;

create policy "coach creates own cancellation request" on public.lesson_cancellation_requests
  for insert with check (
    coach_id = auth.uid()
    and exists (
      select 1 from public.schedule_assignments sa
      where sa.id = schedule_assignment_id and sa.coach_id = auth.uid() and sa.club_id = club_id
    )
  );

create policy "coach or owner views cancellation requests" on public.lesson_cancellation_requests
  for select using (coach_id = auth.uid() or public.is_club_owner(club_id));

create policy "owner reviews cancellation requests" on public.lesson_cancellation_requests
  for update using (public.is_club_owner(club_id)) with check (public.is_club_owner(club_id));

create policy "coach withdraws own pending request" on public.lesson_cancellation_requests
  for delete using (coach_id = auth.uid() and status = 'pending');
