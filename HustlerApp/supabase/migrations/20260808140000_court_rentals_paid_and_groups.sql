-- Two additions for the new Rental screen's booking flow:
-- - is_paid: a simple editable payment-status flag (previously the rental
--   form only recorded who/when, not whether they'd paid).
-- - rental_group_id: ties together every row created by one booking action
--   (every court in a multi-court booking, and every week's occurrence in a
--   recurring "bulk" booking) so the whole thing can be managed as a unit
--   (paid toggle, "End Series"). Bulk bookings are stored as ordinary
--   discrete dated rows generated up front (one row per court per
--   occurrence date) rather than a day-of-week recurring pattern, so
--   getRentalsForDate and every other existing consumer needs no changes.
alter table public.court_rentals
  add column is_paid boolean not null default false,
  add column rental_group_id uuid;

create index court_rentals_group_idx on public.court_rentals (rental_group_id) where rental_group_id is not null;
