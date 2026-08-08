-- Second half of the duplicate-credit cleanup started in
-- 20260805160000_atomic_schedule_request_approval.sql. That migration
-- deliberately left this one alone pending a check: makeup_lesson_credits
-- id 85946853 (missed 2026-10-19, tied to the now-closed old schedule
-- assignment f6925ec7) is status 'scheduled' with a real court already
-- booked for 2026-10-07 5:00pm — a genuine makeup a coach/club already
-- arranged, not a phantom. Its 'owed' twin (81fa570c, tied to the
-- replacement assignment 78d514d6) is the actual duplicate: same missed
-- Monday, nothing booked against it, produced by the same dangling-old-
-- assignment bug. Deleting the duplicate, keeping the booked one.
delete from public.makeup_lesson_credits
where id = '81fa570c-6a8f-472e-b702-56d94f680ae1' and status = 'owed';
