-- Backfill: clubs that set their batch types (clubs.skill_levels) before
-- ensureGroupLessonsForBatchTypes existed never got their lesson-card shells
-- created — only clubs that add/remove a batch type going forward trigger
-- that path. One-time catch-up for every existing club.
insert into public.group_tiers (club_id, name)
select c.id, lvl
from public.clubs c, unnest(c.skill_levels) as lvl
where c.skill_levels is not null
  and not exists (
    select 1 from public.group_tiers gt where gt.club_id = c.id and gt.name = lvl
  );
