-- Optional, soft-enforced capacity + a free-text age-group label. Nullable
-- with no server-side enforcement tying capacity to player_tier_assignments
-- count — group_tiers were deliberately built uncapped (see
-- 20260727100000_phase1_data_model.sql), and this stays true for any club
-- that leaves capacity blank. Set, it's advisory only: the UI warns past it,
-- never blocks enrollment.
alter table public.group_tiers add column if not exists capacity integer check (capacity is null or capacity > 0);
alter table public.group_tiers add column if not exists age_group text;
