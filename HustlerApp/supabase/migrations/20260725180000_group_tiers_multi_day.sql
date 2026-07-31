-- Group tiers can now meet on more than one day per week (e.g. Mon/Wed/Fri
-- at the same time), same as most real club schedules. Converts the single
-- day_of_week scalar into an array; existing rows are preserved as a
-- one-element array via the USING clause.
alter table public.group_tiers drop constraint group_tiers_day_of_week_check;

alter table public.group_tiers
  alter column day_of_week type smallint[] using array[day_of_week];

alter table public.group_tiers add constraint group_tiers_day_of_week_check
  check (array_length(day_of_week, 1) > 0 and day_of_week <@ array[0,1,2,3,4,5,6]::smallint[]);
