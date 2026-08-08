-- Lesson-learned journal entries (entry_type = 'lesson') are no longer
-- opt-in for parent visibility — the app now always saves them with
-- shared_with_parent = true (JournalSheet.tsx). Backfill existing rows so
-- past lesson entries show up in a parent's Journal too, not just new ones.
update public.journal_entries
set shared_with_parent = true
where entry_type = 'lesson' and shared_with_parent = false;
