-- Two asks: users can now clear notifications from the bell screen (single
-- row or all-at-once), and old notifications age out on their own instead of
-- piling up forever.

-- ── 1. Let a user delete their own notification rows ────────────────────
-- `notifications` predates the migrations folder (like `assignments` —
-- see project_parent_calendar_and_assignments memory) so its existing
-- SELECT/UPDATE policies aren't in this repo's history. DELETE is a
-- separate RLS command from SELECT/UPDATE, so adding this policy can't
-- clash with whatever those already are.
drop policy if exists "user deletes own notifications" on public.notifications;
create policy "user deletes own notifications" on public.notifications
  for delete using (user_id = auth.uid());

-- ── 2. Daily housekeeping: drop anything older than 14 days ─────────────
-- Same pg_cron/security-definer pattern as send_post_lesson_nudges /
-- send_evening_lesson_reminders (20260731100000) — runs server-side so it
-- doesn't depend on anyone having the app open.
create or replace function public.cleanup_old_notifications()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.notifications where created_at < now() - interval '14 days';
end;
$$;

select cron.schedule('cleanup-old-notifications', '0 3 * * *', $cron$select public.cleanup_old_notifications();$cron$);
