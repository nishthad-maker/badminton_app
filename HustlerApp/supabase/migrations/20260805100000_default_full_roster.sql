-- Coaches should see the full club roster by default — the owner had to
-- explicitly flip a toggle in Club Settings to grant this, which isn't
-- something a club should have to remember to do. The toggle itself stays
-- (a club that genuinely wants to restrict a coach to just their own
-- players can still switch it to 'own_only'), just the default flips.
alter table public.club_coaches alter column roster_scope set default 'full_roster';

update public.club_coaches set roster_scope = 'full_roster' where roster_scope = 'own_only';
