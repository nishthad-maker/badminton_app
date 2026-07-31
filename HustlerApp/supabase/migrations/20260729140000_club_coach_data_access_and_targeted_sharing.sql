-- Two problems found while reconciling the pre-club coach features (assign
-- workouts, logged-session view, journal/match sharing) with club-based
-- coaching, where a coach never goes through the old coach_username ->
-- coach_connections handshake at all:
--
-- 1. `assignments` INSERT and `session_logs` coach-SELECT still hard-require
--    an accepted `coach_connections` row. A club-joined coach has no such
--    row for their club's roster players, so assign-workout.tsx already
--    lists club players as assignable but the insert was silently rejected
--    by RLS, and the "Logged" tab on coach-player.tsx would always be empty
--    for a pure club player. `coach_player_notes` and `weekly_plans` were
--    already coach_id-only (no connection dependency) — fine as-is.
--
-- 2. journal/match "share with coach" only ever meant "share with whichever
--    coach(es) currently have an accepted coach_connections row" — there was
--    no way to target a *specific* coach, and no path at all for a
--    club-only player (see [[project_coach_club_features]]/[[project_club_admin_rebuild]]
--    in app memory). Moving to an explicit target list here so the player
--    can pick from their real coaches (private-lesson/group-lesson coaches
--    at their club, or an independently-connected coach) via
--    `shared_with_coach_ids`.

-- ── 1. Club-roster coach access, mirrored from club_members' own
--       "coaches view roster per admin-set scope" policy so the two never
--       drift apart — a coach who can already see this player on their
--       roster should also be able to assign to / read logs for them. ──
create function public.is_coach_for_player(target_player_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.club_members cm
    where cm.player_id = target_player_id
      and cm.status = 'active'
      and (
        public.is_club_owner(cm.club_id)
        or (
          public.is_club_staff(cm.club_id)
          and (
            public.coach_roster_scope(cm.club_id) = 'full_roster'
            or exists (
              select 1 from public.schedule_assignments sa
              where sa.club_id = cm.club_id and sa.player_id = cm.player_id and sa.coach_id = auth.uid()
            )
            or exists (
              select 1
              from public.player_tier_assignments pta
              join public.group_tiers gt on gt.id = pta.group_tier_id
              join public.lesson_coaches lc on lc.group_tier_id = gt.id
              where gt.club_id = cm.club_id and pta.player_id = cm.player_id and lc.coach_id = auth.uid()
            )
          )
          and (cardinality(public.coach_assigned_levels(cm.club_id)) = 0 or cm.level = any(public.coach_assigned_levels(cm.club_id)))
        )
      )
  );
$$;

grant execute on function public.is_coach_for_player(uuid) to authenticated;

drop policy "coach creates assignment" on public.assignments;
create policy "coach creates assignment" on public.assignments
  for insert
  with check (
    auth.uid() = coach_id
    and (
      exists (
        select 1 from public.coach_connections c
        where c.coach_id = auth.uid() and c.player_id = assignments.player_id and c.status = 'accepted'
      )
      or public.is_coach_for_player(assignments.player_id)
    )
  );

drop policy "accepted coach sees player sessions" on public.session_logs;
create policy "accepted coach sees player sessions" on public.session_logs
  for select
  using (
    exists (
      select 1 from public.coach_connections c
      where c.player_id = session_logs.user_id and c.coach_id = auth.uid() and c.status = 'accepted'
    )
    or public.is_coach_for_player(session_logs.user_id)
  );

-- ── 2. Targeted sharing: journal entries and match logs now record exactly
--       which coach(es) they're shared with, instead of implicitly meaning
--       "every currently-connected coach". ──
alter table public.journal_entries add column shared_with_coach_ids uuid[] not null default '{}';
alter table public.opponent_logs add column shared_with_coach_ids uuid[] not null default '{}';

-- Backfill: before this migration the only possible sharing target was an
-- accepted coach_connections coach, so that's the correct reconstruction for
-- every row already marked shared.
update public.journal_entries je set shared_with_coach_ids = (
  select coalesce(array_agg(cc.coach_id), '{}')
  from public.coach_connections cc
  where cc.player_id = je.user_id and cc.status = 'accepted'
) where je.shared_with_coach = true;

update public.opponent_logs ol set shared_with_coach_ids = (
  select coalesce(array_agg(cc.coach_id), '{}')
  from public.coach_connections cc
  where cc.player_id = ol.player_id and cc.status = 'accepted'
) where ol.shared_with_coach = true;

drop policy "coaches view shared journal entries" on public.journal_entries;
create policy "coaches view shared journal entries" on public.journal_entries
  for select
  using (auth.uid() = any(shared_with_coach_ids));

drop policy "coaches view shared opponent_logs" on public.opponent_logs;
create policy "coaches view shared opponent_logs" on public.opponent_logs
  for select
  using (auth.uid() = any(shared_with_coach_ids));

drop policy "owner or sharing coach can view messages" on public.journal_entry_messages;
create policy "owner or sharing coach can view messages" on public.journal_entry_messages
  for select
  using (
    exists (
      select 1 from public.journal_entries je
      where je.id = journal_entry_messages.journal_entry_id
        and (je.user_id = auth.uid() or auth.uid() = any(je.shared_with_coach_ids))
    )
  );

drop policy "owner or sharing coach can send messages" on public.journal_entry_messages;
create policy "owner or sharing coach can send messages" on public.journal_entry_messages
  for insert
  with check (
    sender_id = auth.uid()
    and exists (
      select 1 from public.journal_entries je
      where je.id = journal_entry_messages.journal_entry_id
        and (je.user_id = auth.uid() or auth.uid() = any(je.shared_with_coach_ids))
    )
  );

drop policy "journal_entry_messages_mark_seen" on public.journal_entry_messages;
create policy "journal_entry_messages_mark_seen" on public.journal_entry_messages
  for update
  using (
    sender_id <> auth.uid()
    and exists (
      select 1 from public.journal_entries je
      where je.id = journal_entry_messages.journal_entry_id
        and (je.user_id = auth.uid() or auth.uid() = any(je.shared_with_coach_ids))
    )
  )
  with check (
    sender_id <> auth.uid()
    and exists (
      select 1 from public.journal_entries je
      where je.id = journal_entry_messages.journal_entry_id
        and (je.user_id = auth.uid() or auth.uid() = any(je.shared_with_coach_ids))
    )
  );

drop policy "opponent_log_messages_select" on public.opponent_log_messages;
create policy "opponent_log_messages_select" on public.opponent_log_messages
  for select
  using (
    exists (
      select 1 from public.opponent_logs ol
      where ol.id = opponent_log_messages.opponent_log_id
        and (ol.player_id = auth.uid() or auth.uid() = any(ol.shared_with_coach_ids))
    )
  );

drop policy "opponent_log_messages_insert" on public.opponent_log_messages;
create policy "opponent_log_messages_insert" on public.opponent_log_messages
  for insert
  with check (
    sender_id = auth.uid()
    and exists (
      select 1 from public.opponent_logs ol
      where ol.id = opponent_log_messages.opponent_log_id
        and (ol.player_id = auth.uid() or auth.uid() = any(ol.shared_with_coach_ids))
    )
  );

drop policy "opponent_log_messages_mark_seen" on public.opponent_log_messages;
create policy "opponent_log_messages_mark_seen" on public.opponent_log_messages
  for update
  using (
    sender_id <> auth.uid()
    and exists (
      select 1 from public.opponent_logs ol
      where ol.id = opponent_log_messages.opponent_log_id
        and (ol.player_id = auth.uid() or auth.uid() = any(ol.shared_with_coach_ids))
    )
  )
  with check (
    sender_id <> auth.uid()
    and exists (
      select 1 from public.opponent_logs ol
      where ol.id = opponent_log_messages.opponent_log_id
        and (ol.player_id = auth.uid() or auth.uid() = any(ol.shared_with_coach_ids))
    )
  );
