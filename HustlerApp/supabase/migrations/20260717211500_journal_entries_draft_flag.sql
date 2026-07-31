-- Journal entries are now autosaved as the player types, before they hit the
-- final "Save" button on the done step. is_draft marks those in-progress rows
-- so Journal History (and coach views) only ever show entries the player
-- actually finished and saved. Existing rows predate autosave and were only
-- ever written on final save, so they're all finalized.
alter table public.journal_entries
  add column if not exists is_draft boolean not null default false;
