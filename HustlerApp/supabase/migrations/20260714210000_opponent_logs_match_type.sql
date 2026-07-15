-- Lets a player mark a logged match as singles or doubles, shown as a tag
-- next to the opponent's name in the Matches list.
alter table public.opponent_logs
  add column if not exists match_type text not null default 'singles';

alter table public.opponent_logs
  drop constraint if exists opponent_logs_match_type_check;
alter table public.opponent_logs
  add constraint opponent_logs_match_type_check check (match_type in ('singles', 'doubles'));
