-- Journal entries used to be capped at one row per (user_id, entry_date), which
-- forced a lesson-learned entry and a journal entry on the same day to overwrite
-- each other, and made it impossible to add a second entry of the same type later
-- that day. Drop that constraint (and any backing unique index) so a player can
-- keep multiple separate entries per day; the app now creates a new row per entry
-- instead of upserting on (user_id, entry_date).
do $$
declare
  r record;
begin
  for r in
    select c.conname
    from pg_constraint c
    where c.conrelid = 'public.journal_entries'::regclass
      and c.contype = 'u'
      and (
        select array_agg(a.attname order by a.attname)
        from unnest(c.conkey) as k(attnum)
        join pg_attribute a on a.attnum = k.attnum and a.attrelid = c.conrelid
      ) = array['entry_date', 'user_id']::name[]
  loop
    execute format('alter table public.journal_entries drop constraint %I', r.conname);
  end loop;

  for r in
    select i.indexname
    from pg_indexes i
    where i.schemaname = 'public'
      and i.tablename = 'journal_entries'
      and i.indexdef ilike '%unique%'
      and i.indexdef ilike '%entry_date%'
      and i.indexdef ilike '%user_id%'
  loop
    execute format('drop index if exists public.%I', r.indexname);
  end loop;
end $$;

-- Keep lookups by day fast now that (user_id, entry_date) is no longer unique.
create index if not exists journal_entries_user_id_entry_date_idx
  on public.journal_entries (user_id, entry_date);
