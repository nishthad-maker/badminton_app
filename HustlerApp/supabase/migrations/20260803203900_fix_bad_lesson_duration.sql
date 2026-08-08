-- One private lesson (John Brown / Anupam, Sunday) was stored as
-- 08:00–19:00 (11hr), which the new makeup-suggestion duration logic
-- correctly mirrored — surfacing that the underlying data was wrong. The
-- club confirms it was actually a normal 1hr slot, 8:00–9:00.
update public.schedule_assignments
set end_time = '09:00:00'
where id = '60361b57-74c0-493f-a322-feb37232de01' and start_time = '08:00:00' and end_time = '19:00:00';
