-- Splits journal entries into two kinds: a "lesson" entry for technical
-- training notes (shareable with a coach for feedback) and a "personal"
-- entry for mental-health/anything-else reflection (always private).
alter table public.journal_entries
  add column if not exists entry_type text not null default 'personal';

alter table public.journal_entries
  drop constraint if exists journal_entries_entry_type_check;
alter table public.journal_entries
  add constraint journal_entries_entry_type_check check (entry_type in ('lesson', 'personal'));

-- Personal entries are never shared with a coach — only lesson entries can be.
update public.journal_entries set shared_with_coach = false where entry_type = 'personal';
