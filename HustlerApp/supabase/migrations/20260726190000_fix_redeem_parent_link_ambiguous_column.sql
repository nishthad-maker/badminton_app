-- redeem_parent_link_code declared an OUT parameter named player_id, which
-- shadowed parent_children.player_id inside the function's own
-- "where parent_id = auth.uid() and player_id = code_row.player_id" lookup,
-- raising "column reference player_id is ambiguous" on every real call —
-- the exact same bug class already fixed once for
-- request_join_club_as_coach/player in 20260726110000. Renaming the OUT
-- parameters fixes it.
drop function if exists public.redeem_parent_link_code(text);

create function public.redeem_parent_link_code(input_code text)
returns table (linked_player_id uuid, linked_player_name text)
language plpgsql
security definer
set search_path = public
as $$
declare
  code_row public.player_share_codes;
  caller_role text;
  found_player_name text;
  existing public.parent_children;
begin
  select role into caller_role from public.profiles where id = auth.uid();
  if caller_role is distinct from 'parent' then
    raise exception 'Only a Parent account can redeem a link code.';
  end if;

  select * into code_row from public.player_share_codes where code = upper(input_code);
  if code_row.id is null then
    raise exception 'That code wasn''t found. Double-check it and try again.';
  end if;

  select * into existing from public.parent_children where parent_id = auth.uid() and player_id = code_row.player_id;

  if existing.id is not null and existing.status = 'accepted' and existing.unlinked_at is null then
    raise exception 'You''re already linked to this child.';
  elsif existing.id is not null then
    update public.parent_children
    set status = 'pending', requested_at = now(), accepted_at = null, unlinked_at = null
    where id = existing.id;
  else
    insert into public.parent_children (parent_id, player_id, status, requested_at)
    values (auth.uid(), code_row.player_id, 'pending', now());
  end if;

  select full_name into found_player_name from public.profiles where id = code_row.player_id;
  return query select code_row.player_id, coalesce(found_player_name, 'Player');
end;
$$;
