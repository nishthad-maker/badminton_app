-- Lets a coach and player exchange feedback messages on a shared match log,
-- mirroring the existing assignment_messages / journal_entry_messages chat pattern.
create table if not exists public.opponent_log_messages (
  id uuid primary key default gen_random_uuid(),
  opponent_log_id uuid not null references public.opponent_logs(id) on delete cascade,
  sender_id uuid not null references auth.users(id),
  message text not null,
  created_at timestamptz not null default now()
);

create index if not exists opponent_log_messages_log_id_idx on public.opponent_log_messages (opponent_log_id);

alter table public.opponent_log_messages enable row level security;

drop policy if exists "opponent_log_messages_select" on public.opponent_log_messages;
create policy "opponent_log_messages_select" on public.opponent_log_messages
  for select
  using (
    exists (
      select 1 from public.opponent_logs ol
      where ol.id = opponent_log_messages.opponent_log_id
        and (
          ol.player_id = auth.uid()
          or (
            ol.shared_with_coach = true
            and exists (
              select 1 from public.coach_connections cc
              where cc.player_id = ol.player_id
                and cc.coach_id = auth.uid()
                and cc.status = 'accepted'
            )
          )
        )
    )
  );

drop policy if exists "opponent_log_messages_insert" on public.opponent_log_messages;
create policy "opponent_log_messages_insert" on public.opponent_log_messages
  for insert
  with check (
    sender_id = auth.uid()
    and exists (
      select 1 from public.opponent_logs ol
      where ol.id = opponent_log_messages.opponent_log_id
        and (
          ol.player_id = auth.uid()
          or (
            ol.shared_with_coach = true
            and exists (
              select 1 from public.coach_connections cc
              where cc.player_id = ol.player_id
                and cc.coach_id = auth.uid()
                and cc.status = 'accepted'
            )
          )
        )
    )
  );

do $$
begin
  execute 'alter publication supabase_realtime add table public.opponent_log_messages';
exception when others then null;
end $$;
