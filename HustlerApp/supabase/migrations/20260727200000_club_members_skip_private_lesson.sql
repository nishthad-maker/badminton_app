-- Lessons > Private tab lists every active roster player as a card to
-- schedule a private lesson for. Some players (e.g. group-only batches)
-- never will — this flag lets the club dismiss that card permanently
-- instead of it resurfacing every visit.
alter table public.club_members add column if not exists skip_private_lesson boolean not null default false;
