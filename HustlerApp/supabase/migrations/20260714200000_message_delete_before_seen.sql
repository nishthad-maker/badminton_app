-- Lets a sender delete their own chat message, but only before the other
-- person has seen it (mirrors WhatsApp's "delete for everyone" behavior).
-- Adds a seen_at marker to each chat table, an UPDATE policy so the
-- recipient can stamp it, and a DELETE policy that only allows the sender
-- to remove their own message while seen_at is still null.

alter table public.assignment_messages add column if not exists seen_at timestamptz;
alter table public.opponent_log_messages add column if not exists seen_at timestamptz;
alter table public.journal_entry_messages add column if not exists seen_at timestamptz;

-- ── assignment_messages (coach <-> player on an assigned workout) ──

drop policy if exists "assignment_messages_mark_seen" on public.assignment_messages;
create policy "assignment_messages_mark_seen" on public.assignment_messages
  for update
  using (
    sender_id <> auth.uid()
    and exists (
      select 1 from public.assignments a
      where a.id = assignment_messages.assignment_id
        and (a.coach_id = auth.uid() or a.player_id = auth.uid())
    )
  )
  with check (
    sender_id <> auth.uid()
    and exists (
      select 1 from public.assignments a
      where a.id = assignment_messages.assignment_id
        and (a.coach_id = auth.uid() or a.player_id = auth.uid())
    )
  );

drop policy if exists "assignment_messages_delete_unseen" on public.assignment_messages;
create policy "assignment_messages_delete_unseen" on public.assignment_messages
  for delete
  using (sender_id = auth.uid() and seen_at is null);

-- ── opponent_log_messages (coach <-> player on a shared match report) ──

drop policy if exists "opponent_log_messages_mark_seen" on public.opponent_log_messages;
create policy "opponent_log_messages_mark_seen" on public.opponent_log_messages
  for update
  using (
    sender_id <> auth.uid()
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
  )
  with check (
    sender_id <> auth.uid()
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

drop policy if exists "opponent_log_messages_delete_unseen" on public.opponent_log_messages;
create policy "opponent_log_messages_delete_unseen" on public.opponent_log_messages
  for delete
  using (sender_id = auth.uid() and seen_at is null);

-- ── journal_entry_messages (coach <-> player on a shared journal entry) ──

drop policy if exists "journal_entry_messages_mark_seen" on public.journal_entry_messages;
create policy "journal_entry_messages_mark_seen" on public.journal_entry_messages
  for update
  using (
    sender_id <> auth.uid()
    and exists (
      select 1 from public.journal_entries je
      where je.id = journal_entry_messages.journal_entry_id
        and (
          je.user_id = auth.uid()
          or (
            je.shared_with_coach = true
            and exists (
              select 1 from public.coach_connections cc
              where cc.player_id = je.user_id
                and cc.coach_id = auth.uid()
                and cc.status = 'accepted'
            )
          )
        )
    )
  )
  with check (
    sender_id <> auth.uid()
    and exists (
      select 1 from public.journal_entries je
      where je.id = journal_entry_messages.journal_entry_id
        and (
          je.user_id = auth.uid()
          or (
            je.shared_with_coach = true
            and exists (
              select 1 from public.coach_connections cc
              where cc.player_id = je.user_id
                and cc.coach_id = auth.uid()
                and cc.status = 'accepted'
            )
          )
        )
    )
  );

drop policy if exists "journal_entry_messages_delete_unseen" on public.journal_entry_messages;
create policy "journal_entry_messages_delete_unseen" on public.journal_entry_messages
  for delete
  using (sender_id = auth.uid() and seen_at is null);
