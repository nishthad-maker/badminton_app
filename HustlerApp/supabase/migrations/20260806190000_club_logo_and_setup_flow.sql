-- Optional club logo, added during the onboarding wizard's new "Logo" step
-- (uploaded via Cloudinary, same as every other image in this app — no
-- Supabase Storage bucket exists here). No RLS change needed: clubs UPDATE
-- is already owner-gated (see "club staff manage their club" WITH CHECK
-- is_club_owner), the same path club-settings.tsx's saveDetails uses for
-- name/location.
alter table public.clubs add column if not exists logo_url text;
