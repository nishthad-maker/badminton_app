-- Denormalize opponent name onto opponent_logs so a coach viewing a shared
-- log doesn't depend on RLS access to the player's private `opponents` table
-- row (that embedded-join was silently returning null for coaches).
alter table public.opponent_logs
  add column if not exists opponent_name text,
  add column if not exists video_url text;

-- Backfill existing rows from the opponents table where possible.
update public.opponent_logs ol
set opponent_name = o.name
from public.opponents o
where ol.opponent_id = o.id
  and ol.opponent_name is null;
