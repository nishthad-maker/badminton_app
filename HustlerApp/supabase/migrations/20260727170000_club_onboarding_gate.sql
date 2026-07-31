-- Gated post-signup onboarding: a brand-new club must complete a 5-step
-- wizard (skill levels, cancellation cutoff, group makeup toggle,
-- notification defaults, confirm join code) before the real dashboard/nav
-- tabs unlock. Existing clubs are grandfathered in as already-complete —
-- forcing already-running clubs through a brand-new mandatory wizard would
-- lock real, in-use data behind a screen they never agreed to.
alter table public.club_settings add column if not exists onboarding_completed boolean not null default false;
update public.club_settings set onboarding_completed = true where onboarding_completed = false;
