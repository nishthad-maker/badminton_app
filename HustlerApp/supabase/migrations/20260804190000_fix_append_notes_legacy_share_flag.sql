-- append_parent_match_notes only updated shared_with_coach_ids, but every
-- other write path (logChildMatch, log-match.tsx, opponent-detail.tsx,
-- JournalSheet.tsx) keeps the legacy `shared_with_coach` boolean in sync
-- alongside it — and coach-player.tsx's own queries still filter on that
-- legacy boolean, not the array. Leaving it out meant a parent's newly-
-- shared appended notes could stay invisible to the coach despite being in
-- shared_with_coach_ids. Full body copied verbatim from
-- 20260804180000_parent_append_match_notes.sql with the boolean now kept
-- in sync with the merged id array.
create or replace function public.append_parent_match_notes(
  p_log_id uuid,
  p_strengths_text text,
  p_weaknesses_text text,
  p_share_with_coach_ids uuid[]
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_player_id uuid;
  v_current_ids uuid[];
  v_merged_ids uuid[];
begin
  select player_id, shared_with_coach_ids into v_player_id, v_current_ids
  from public.opponent_logs where id = p_log_id;

  if v_player_id is null then
    raise exception 'Match log not found';
  end if;
  if not public.is_accepted_parent_of(v_player_id) then
    raise exception 'Not authorized';
  end if;

  select coalesce(array_agg(distinct x), '{}') into v_merged_ids
  from unnest(coalesce(v_current_ids, '{}') || coalesce(p_share_with_coach_ids, '{}')) as x;

  update public.opponent_logs set
    parent_strengths_text = nullif(trim(coalesce(p_strengths_text, '')), ''),
    parent_weaknesses_text = nullif(trim(coalesce(p_weaknesses_text, '')), ''),
    shared_with_coach_ids = v_merged_ids,
    shared_with_coach = (cardinality(v_merged_ids) > 0)
  where id = p_log_id;
end;
$$;

grant execute on function public.append_parent_match_notes(uuid, text, text, uuid[]) to authenticated;
