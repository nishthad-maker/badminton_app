-- Lets the player's notifications feed track whether a weekly plan has been
-- viewed yet, mirroring the existing `seen` flag on assignments.
alter table public.weekly_plans add column if not exists seen boolean not null default false;
