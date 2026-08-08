-- Security audit (2026-08-06). Two real, exploitable RLS gaps found and
-- fixed here — both let an authenticated user reach data/actions well
-- outside their own relationships via a direct REST call, regardless of
-- what the app's own UI does.

-- 1. "club staff search player profiles" let ANY active coach (at any club,
-- anywhere) read the full profiles row — including email — of ANY player in
-- the entire app, not just players connected to them in any way. This was a
-- known issue: 20260726220000_search_club_connected_players.sql's own
-- comment says exactly this ("any club could discover and add total
-- strangers") and added a properly-scoped SECURITY DEFINER RPC to replace
-- it, but never revoked the original broad policy — the fix only ever
-- reached the RPC layer, not the underlying table grant. The one remaining
-- caller of the broad path, (club-admin)/payments.tsx's player search for
-- attaching a manual payment record, has been switched to the already-
-- correct search_club_roster_players RPC (same pattern club-calendar.tsx's
-- private-lesson booking already uses), so nothing depends on this policy
-- anymore — dropped outright rather than merely narrowed.
drop policy if exists "club staff search player profiles" on public.profiles;

-- 2. notifications' INSERT policy had `with check (true)` — completely
-- unrestricted. Any authenticated user could insert a notification row for
-- ANY other user_id, with an arbitrary title/body/type/screen (the screen
-- value is used as an in-app deep link), i.e. impersonate anyone — a coach,
-- the club, a parent — to any other user. Tightened to require the sender
-- can only ever claim to be themselves (or leave it null for system-
-- generated notifications); this doesn't rate-limit legitimate accounts
-- sending too many notifications to others (the app's whole notification
-- system relies on direct client inserts, not a trusted server function),
-- but it closes the anonymous/spoofed-sender impersonation vector, which is
-- the actual exploitable harm here.
drop policy if exists "Users can insert notifications" on public.notifications;
create policy "Users can insert notifications" on public.notifications
  for insert with check (from_user_id is null or from_user_id = auth.uid());
