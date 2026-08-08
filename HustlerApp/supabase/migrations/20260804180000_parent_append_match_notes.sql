-- A coach was getting two separate opponent_logs rows for the same real
-- match — one from the player, one from a parent watching courtside —
-- reading as two different matches. Rather than suppress one side's
-- account (losing real information) or leave the coach to untangle
-- duplicates, log-match-parent.tsx now detects when the child already has
-- a recent log against the same opponent and offers to append the
-- parent's notes onto THAT row instead of creating a second one. Two new
-- nullable columns hold the parent's contribution separately from the
-- player's own strengths_text/weaknesses_text — kept distinct (not
-- concatenated into the same field) so both perspectives stay clearly
-- attributed wherever the log is displayed.
alter table public.opponent_logs add column if not exists parent_strengths_text text;
alter table public.opponent_logs add column if not exists parent_weaknesses_text text;

-- SECURITY DEFINER rather than a client-side UPDATE + RLS policy: a parent
-- should only ever be able to touch the two parent_* note columns and union
-- shared_with_coach_ids on a child-authored log — never the player's own
-- result/score/tags/text. A row-level RLS policy can't restrict which
-- columns get written, so this function is the enforcement boundary
-- instead, matching toggle_attendance()'s pattern elsewhere in this app.
create function public.append_parent_match_notes(
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
begin
  select player_id into v_player_id from public.opponent_logs where id = p_log_id;
  if v_player_id is null then
    raise exception 'Match log not found';
  end if;
  if not public.is_accepted_parent_of(v_player_id) then
    raise exception 'Not authorized';
  end if;

  update public.opponent_logs set
    parent_strengths_text = nullif(trim(coalesce(p_strengths_text, '')), ''),
    parent_weaknesses_text = nullif(trim(coalesce(p_weaknesses_text, '')), ''),
    shared_with_coach_ids = (
      select coalesce(array_agg(distinct x), '{}')
      from unnest(shared_with_coach_ids || coalesce(p_share_with_coach_ids, '{}')) as x
    )
  where id = p_log_id;
end;
$$;

grant execute on function public.append_parent_match_notes(uuid, text, text, uuid[]) to authenticated;
