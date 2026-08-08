-- The court-booking modal's third option is a club member booking court
-- time directly (self-serve, no coach) — renamed "Member" in the UI to
-- distinguish it from a walk-in rental, and now requires a real email
-- (not just a phone number) so the club can actually reach them. Table has
-- zero existing rows this session (brand new feature), so this is safe as
-- NOT NULL directly, no backfill needed.
alter table public.court_rentals add column renter_email text not null;
