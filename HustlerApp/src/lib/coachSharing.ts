import { supabase } from './supabase';
import { getPlayerClubMembership } from './club';
import { getClubCoachesForPlayer } from './playerClub';

export type ShareableCoach = { id: string; full_name: string };

// Every coach a player can pick from when sharing a journal entry or match
// log — their independently-connected coach(es) (the old coach_username ->
// coach_connections path) union their club coaches (private-lesson coach +
// any group-lesson coaches), deduped by id. Used to populate the "share
// with..." picker; the actual read access is enforced server-side by
// shared_with_coach_ids on journal_entries/opponent_logs (see migration
// 20260729140000_club_coach_data_access_and_targeted_sharing.sql).
export async function getShareableCoaches(playerId: string): Promise<ShareableCoach[]> {
  const byId: Record<string, string> = {};

  // coach_connections has two FKs to profiles (coach_id + player_id), which
  // makes an embedded `profiles(...)` select ambiguous and silently errors —
  // a plain id lookup avoids that (see project_pending_request_bugs_and_debug_technique).
  const { data: conns } = await supabase
    .from('coach_connections')
    .select('coach_id')
    .eq('player_id', playerId)
    .eq('status', 'accepted');
  const connCoachIds = (conns ?? []).map((c: any) => c.coach_id);
  if (connCoachIds.length) {
    const { data: coachProfiles } = await supabase.from('profiles').select('id, full_name').in('id', connCoachIds);
    (coachProfiles ?? []).forEach((p: any) => { byId[p.id] = p.full_name ?? 'Coach'; });
  }

  const membership = await getPlayerClubMembership(playerId);
  if (membership) {
    const clubCoaches = await getClubCoachesForPlayer(playerId, membership.clubId);
    clubCoaches.forEach((c) => { byId[c.id] = c.full_name; });
  }

  return Object.entries(byId).map(([id, full_name]) => ({ id, full_name }));
}
