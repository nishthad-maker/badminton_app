-- Two gaps found while extending the tournament/match section:
-- 1. Parents could see a child's match log content but never the coach's
--    feedback thread on it (opponent_log_messages had no parent RLS at all).
-- 2. Coach feedback on a match log was text-only — no way to leave a voice
--    note the way a player/parent can attach one to their own match log.

alter table public.opponent_log_messages add column media_url text;
alter table public.opponent_log_messages add column media_type text check (media_type is null or media_type in ('photo', 'video', 'audio'));
alter table public.opponent_log_messages add column media_duration_seconds integer;

-- Parent read/reply access, mirrored from the existing player/coach policies
-- but scoped through is_accepted_parent_of instead of player_id/shared_with_coach_ids.
create policy "parent views childs match feedback" on public.opponent_log_messages
  for select
  using (
    exists (
      select 1 from public.opponent_logs ol
      where ol.id = opponent_log_messages.opponent_log_id
        and public.is_accepted_parent_of(ol.player_id)
    )
  );

create policy "parent sends match feedback reply" on public.opponent_log_messages
  for insert
  with check (
    sender_id = auth.uid()
    and exists (
      select 1 from public.opponent_logs ol
      where ol.id = opponent_log_messages.opponent_log_id
        and public.is_accepted_parent_of(ol.player_id)
    )
  );

create policy "parent marks coach reply as seen" on public.opponent_log_messages
  for update
  using (
    sender_id <> auth.uid()
    and exists (
      select 1 from public.opponent_logs ol
      where ol.id = opponent_log_messages.opponent_log_id
        and public.is_accepted_parent_of(ol.player_id)
    )
  )
  with check (
    sender_id <> auth.uid()
    and exists (
      select 1 from public.opponent_logs ol
      where ol.id = opponent_log_messages.opponent_log_id
        and public.is_accepted_parent_of(ol.player_id)
    )
  );
