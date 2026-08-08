-- 20260804210000's backfill set shared_with_parent = true on every
-- entry_type = 'lesson' row without checking is_draft, which also flipped
-- abandoned/never-finished draft rows (JournalSheet autosaves a draft row
-- the moment a player opens a blank lesson entry, before they've written
-- anything) — those started appearing as blank "shared" entries in the
-- parent's Journal. Drafts should never be shared with anyone.
update public.journal_entries
set shared_with_parent = false
where is_draft = true and shared_with_parent = true;
