-- The waitlist is coach-wide ("get in line for whenever this coach has an
-- opening") with no day/time captured at all — a club working through a
-- long queue had no idea what a given entry actually wanted. An optional
-- free-text note (e.g. "Monday afternoons") instead of a rigid day/time
-- picker: cheap to add, and a club reads it the same way they'd read a
-- text message asking for a slot.
alter table public.waitlist_entries add column if not exists preferred_note text;
