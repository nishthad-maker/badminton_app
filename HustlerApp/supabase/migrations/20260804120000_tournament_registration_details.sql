-- Optional registration deadline + signup link on a tournament block — same
-- two fields a player can already set on their own personal calendar
-- 'tournament' events (see EVENT_TYPES in (tabs)/calendar.tsx), now
-- available when a parent/player marks a tournament from the parent
-- dashboard's Calendar tab too. Nullable — most tournament blocks won't set
-- these, only ones marked before registration closes.
alter table public.tournament_blocks add column if not exists registration_deadline date;
alter table public.tournament_blocks add column if not exists registration_link text;
