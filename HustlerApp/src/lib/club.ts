import { supabase, getFunctionErrorMessage } from './supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ensureGroupLessonsForBatchTypes } from './lessons';

export type MyClub = {
  clubId: string;
  clubName: string;
  role: 'owner' | 'staff';
  rosterScope: 'own_only' | 'full_roster';
  canEditOtherSchedules: boolean;
  assignedLevels: string[];
  onboardingCompleted: boolean;
};

export type PendingClubRequest = {
  clubName: string;
};

export type PlayerClubMembership = {
  id: string;
  clubId: string;
  clubName: string;
  status: 'pending' | 'active';
};

const JOIN_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no 0/O/1/I/L

const ACTIVE_CLUB_KEY = 'hustler.activeCoachClubId';

// A coach can be an active member of several clubs at once (each join is
// independent — see requestJoinClubAsCoach). Which one is "in view" is a
// local, per-device preference (Instagram-style switcher), not server
// state — no other role in this codebase persists this kind of pick, so
// AsyncStorage is used directly rather than inventing a global store.
export async function getActiveClubId(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(ACTIVE_CLUB_KEY);
  } catch {
    return null;
  }
}

export async function setActiveClubId(clubId: string): Promise<void> {
  try {
    await AsyncStorage.setItem(ACTIVE_CLUB_KEY, clubId);
  } catch {
    // best-effort — a failed write just means the switcher default resets next load
  }
}

// Every active club_coaches row for the signed-in coach — a club owner will
// only ever have one (an owner account only ever creates one club), but a
// staff coach can have many via independent join-by-code flows.
export async function getMyClubs(): Promise<MyClub[]> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) return [];

  const { data: rows } = await supabase
    .from('club_coaches')
    .select('club_id, role, roster_scope, can_edit_other_schedules, assigned_levels, clubs(name, club_settings(onboarding_completed))')
    .eq('coach_id', session.user.id)
    .eq('status', 'active');

  return (rows ?? []).map((row: any) => ({
    clubId: row.club_id,
    clubName: row.clubs?.name ?? 'Your Club',
    role: row.role,
    rosterScope: row.roster_scope,
    canEditOtherSchedules: row.can_edit_other_schedules,
    assignedLevels: row.assigned_levels ?? [],
    onboardingCompleted: row.clubs?.club_settings?.onboarding_completed ?? false,
  }));
}

// Every Club admin screen needs to know which ONE club is currently "in
// view" — resolves to the AsyncStorage-persisted active club if the coach
// belongs to more than one, defaulting to (and persisting) the first
// otherwise. Returns null if they aren't an ACTIVE club_coaches row yet
// (still pending approval on a legacy row, or never joined/created a club).
export async function getMyClub(): Promise<MyClub | null> {
  const clubs = await getMyClubs();
  if (clubs.length === 0) return null;

  const activeId = await getActiveClubId();
  const active = activeId ? clubs.find((c) => c.clubId === activeId) : undefined;
  if (active) return active;

  await setActiveClubId(clubs[0].clubId);
  return clubs[0];
}

// The club's own operating hours (set during onboarding or from Club
// Settings) — the fallback bound for the parent/player "Book a Lesson"
// hour grid whenever a coach hasn't defined their own working hours. Either
// side null (or the whole row missing) means the club hasn't set this yet.
// Goes through an RPC rather than selecting club_settings directly — that
// table's own RLS is staff-only (it also holds the coach/player join
// codes), and a parent/player calling this has neither role.
export async function getClubHours(clubId: string): Promise<{ openTime: string | null; closeTime: string | null }> {
  const { data } = await supabase.rpc('get_club_hours', { p_club_id: clubId }).maybeSingle();
  return { openTime: (data as any)?.open_time ?? null, closeTime: (data as any)?.close_time ?? null };
}

// A coach's own view of a club_coaches request they made that's still
// awaiting the owner's approval — shown as "pending" rather than linking
// into the club-admin section (which getMyClub() won't resolve for yet).
export async function getPendingCoachRequest(coachId: string): Promise<PendingClubRequest | null> {
  const { data } = await supabase
    .from('club_coaches')
    .select('clubs(name)')
    .eq('coach_id', coachId)
    .eq('status', 'pending')
    .maybeSingle();
  if (!data) return null;
  return { clubName: (data as any).clubs?.name ?? 'a club' };
}

// A player's own ACTIVE club membership (either added directly by a coach's
// search-to-add, or approved from a club_join_requests request — either way
// this only ever reflects the final active state; see
// getPendingClubJoinRequest for a request still awaiting the club's review).
export async function getPlayerClubMembership(playerId: string): Promise<PlayerClubMembership | null> {
  const { data } = await supabase
    .from('club_members')
    .select('id, club_id, status, clubs(name)')
    .eq('player_id', playerId)
    .eq('status', 'active')
    .maybeSingle();
  if (!data) return null;
  return { id: data.id, clubId: data.club_id, clubName: (data as any).clubs?.name ?? 'a club', status: data.status };
}

export type PendingClubJoinRequest = { id: string; clubName: string };

// A player's own pending code-based join request, if any — separate from
// club_members, which never gets a row until the club approves.
export async function getPendingClubJoinRequest(playerId: string): Promise<PendingClubJoinRequest | null> {
  const { data } = await supabase
    .from('club_join_requests')
    .select('id, clubs(name)')
    .eq('player_id', playerId)
    .eq('status', 'pending')
    .maybeSingle();
  if (!data) return null;
  return { id: data.id, clubName: (data as any).clubs?.name ?? 'a club' };
}

export function generateCoachJoinCode(): string {
  let code = 'C';
  for (let i = 0; i < 5; i++) {
    code += JOIN_CODE_ALPHABET[Math.floor(Math.random() * JOIN_CODE_ALPHABET.length)];
  }
  return code;
}

export function generatePlayerJoinCode(): string {
  let code = 'P';
  for (let i = 0; i < 5; i++) {
    code += JOIN_CODE_ALPHABET[Math.floor(Math.random() * JOIN_CODE_ALPHABET.length)];
  }
  return code;
}

// Instant, multi-club: a valid coach code joins immediately (no approval
// step), and calling this again for a different club's code just adds
// another independent membership — see the migration comment on
// request_join_club_as_coach for why this changed from pending-approval.
export async function requestJoinClubAsCoach(code: string): Promise<{ ok: true; clubId: string; clubName: string } | { ok: false; message: string }> {
  const { data, error } = await supabase.rpc('request_join_club_as_coach', { input_code: code.trim().toUpperCase() });
  if (error) return { ok: false, message: error.message };
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return { ok: false, message: 'That code could not be resolved.' };
  return { ok: true, clubId: row.joined_club_id, clubName: row.joined_club_name };
}

// Owner-only: set how much of the club roster a staff coach sees, and
// whether they can edit other coaches' private-lesson schedules. Enforced
// server-side too — club_coaches' "club staff manage roster" policy only
// allows an UPDATE to go through when its WITH CHECK (is_club_owner) passes.
export async function updateCoachPermissions(
  clubCoachId: string,
  patch: { rosterScope?: 'own_only' | 'full_roster'; canEditOtherSchedules?: boolean; assignedLevels?: string[] }
): Promise<{ ok: boolean }> {
  const update: Record<string, any> = {};
  if (patch.rosterScope) update.roster_scope = patch.rosterScope;
  if (patch.canEditOtherSchedules !== undefined) update.can_edit_other_schedules = patch.canEditOtherSchedules;
  if (patch.assignedLevels !== undefined) update.assigned_levels = patch.assignedLevels;
  const { error } = await supabase.from('club_coaches').update(update).eq('id', clubCoachId);
  return { ok: !error };
}

// Soft-removal for a coach who leaves — unlike a hard delete, this preserves
// their lesson_coaches/schedule history while immediately revoking access
// (is_club_staff/is_club_owner both require status = 'active' exactly).
export async function deactivateCoach(clubCoachId: string): Promise<{ ok: boolean }> {
  const { error } = await supabase.from('club_coaches').update({ status: 'inactive' }).eq('id', clubCoachId);
  return { ok: !error };
}

export async function reactivateCoach(clubCoachId: string): Promise<{ ok: boolean }> {
  const { error } = await supabase.from('club_coaches').update({ status: 'active' }).eq('id', clubCoachId);
  return { ok: !error };
}

// Co-admin promotion — a second (or third...) club_coaches row with
// role='owner' for the same club. Nothing in the schema/RLS assumes one
// owner per club (verified live: no unique constraint beyond
// (club_id, coach_id), no triggers), and every owner-only UI gate in the
// app already keys off club_coaches.role === 'owner', not clubs.owner_id —
// so this alone grants full admin access. The one place that still needs
// clubs.owner_id specifically is the Danger Zone's "Delete Club & Account"
// (see club-settings.tsx), since that cascades from the TRUE owner's
// profile row, not any 'owner'-role row.
export async function promoteCoachToOwner(clubCoachId: string): Promise<{ ok: boolean }> {
  const { error } = await supabase.from('club_coaches').update({ role: 'owner' }).eq('id', clubCoachId);
  return { ok: !error };
}

export async function demoteCoachToStaff(clubCoachId: string): Promise<{ ok: boolean }> {
  const { error } = await supabase.from('club_coaches').update({ role: 'staff' }).eq('id', clubCoachId);
  return { ok: !error };
}

// Staff-initiated coach add (onboarding's "Add coaches" step) — creates a
// real, immediately-active club_coaches row, bypassing the join-code/
// pending flow entirely since the owner is adding them in person. Email is
// optional here (unlike the player walk-in flow) — see
// supabase/functions/create-club-staff-coach/index.ts for why: a coach the
// owner already knows and trusts in person doesn't need mandatory contact
// info, just a name.
export async function createSetupCoach(
  clubId: string, fullName: string, email: string
): Promise<{ ok: boolean; coachId?: string; message?: string }> {
  const { data, error } = await supabase.functions.invoke('create-club-staff-coach', {
    body: { clubId, fullName, email },
  });
  if (error) return { ok: false, message: await getFunctionErrorMessage(error, 'Could not add that coach. Please try again.') };
  if (data?.error) return { ok: false, message: data.error };
  return { ok: true, coachId: data?.coachId };
}

// Same soft-removal pattern for a player who leaves — distinct from the
// player-initiated leaveClub() (a hard delete), this is the club-admin side
// "this student left" action, and stays reversible.
export async function deactivateClubMember(clubMemberId: string): Promise<{ ok: boolean }> {
  const { error } = await supabase.from('club_members').update({ status: 'inactive' }).eq('id', clubMemberId);
  return { ok: !error };
}

export async function reactivateClubMember(clubMemberId: string): Promise<{ ok: boolean }> {
  const { error } = await supabase.from('club_members').update({ status: 'active' }).eq('id', clubMemberId);
  return { ok: !error };
}

// Goes through a SECURITY DEFINER RPC rather than a direct profiles update —
// profiles' own UPDATE policy is auth.uid() = id only, so a staffer editing
// a different player's phone has to go through update_roster_player_phone,
// which checks is_club_staff on the target club_member's club itself.
export async function updateRosterPlayerPhone(clubMemberId: string, phone: string): Promise<{ ok: boolean }> {
  const { error } = await supabase.rpc('update_roster_player_phone', { p_club_member_id: clubMemberId, p_phone: phone.trim() || null });
  return { ok: !error };
}

export const DEFAULT_SKILL_LEVELS = ['Beginner', 'Intermediate', 'Advanced', 'Junior Elite', 'High Performance'];

export async function getClubSkillLevels(clubId: string): Promise<string[]> {
  const { data } = await supabase.from('clubs').select('skill_levels').eq('id', clubId).maybeSingle();
  return data?.skill_levels ?? DEFAULT_SKILL_LEVELS;
}

export async function updateClubSkillLevels(clubId: string, levels: string[]): Promise<{ ok: boolean }> {
  const { error } = await supabase.from('clubs').update({ skill_levels: levels }).eq('id', clubId);
  if (error) return { ok: false };
  await ensureGroupLessonsForBatchTypes(clubId, levels);
  return { ok: true };
}

// Club/staff sets a roster player's skill level (club_members.level) —
// separate from the coach's own assigned_levels (which levels they teach).
export async function updatePlayerLevel(clubMemberId: string, level: string | null): Promise<{ ok: boolean }> {
  const { error } = await supabase.from('club_members').update({ level }).eq('id', clubMemberId);
  return { ok: !error };
}

export type ClubRosterBatch = { level: string; players: { id: string; fullName: string }[] };

// A club-joined coach's own view of the roster, grouped by batch (skill
// level) — visually the same grouping the club owner sees on their
// dashboard, but which ROWS come back is entirely decided server-side by
// "coaches view roster per admin-set scope" on club_members (own_only vs
// full_roster, further narrowed by assigned_levels). No scope filtering
// happens here on purpose — RLS already returns exactly what this coach is
// allowed to see, so re-filtering client-side would just be redundant and a
// second place for that logic to drift out of sync.
export async function getClubRosterForCoach(clubId: string): Promise<ClubRosterBatch[]> {
  const [levels, { data: memberRows }] = await Promise.all([
    getClubSkillLevels(clubId),
    supabase
      .from('club_members')
      .select('id, player_id, level, profiles!club_members_player_id_fkey(full_name)')
      .eq('club_id', clubId)
      .eq('status', 'active'),
  ]);

  const rows = (memberRows ?? []).map((m: any) => ({
    id: m.player_id, fullName: m.profiles?.full_name ?? 'Player', level: m.level as string | null,
  }));

  const groups: ClubRosterBatch[] = [...levels, 'Unassigned']
    .map((level) => ({
      level,
      players: rows.filter((r) => (level === 'Unassigned' ? !r.level : r.level === level)),
    }))
    .filter((g) => g.players.length > 0);

  return groups;
}

// Permanently hides a player's card from the Lessons > Private tab (e.g. a
// group-only batch kid who'll never get a private lesson) — doesn't touch
// their roster membership or group-lesson enrollment, just this one flag.
export async function skipPrivateLessonCard(clubMemberId: string): Promise<{ ok: boolean }> {
  const { error } = await supabase.from('club_members').update({ skip_private_lesson: true }).eq('id', clubMemberId);
  return { ok: !error };
}

// The player's designated priority coach (spec: Player.priority_coach_id) —
// other coaches the player can see (via private/group lessons) are shown
// greyed-out/view-only on the player side rather than hidden.
export async function updatePlayerPriorityCoach(clubMemberId: string, coachId: string | null): Promise<{ ok: boolean }> {
  const { error } = await supabase.from('club_members').update({ priority_coach_id: coachId }).eq('id', clubMemberId);
  return { ok: !error };
}

// Code-based player join — creates a PENDING club_join_requests row, not an
// instant club_members row. Distinct from search-to-add (which a coach/club
// does from their side and is instant) — this is the player-initiated path,
// which always needs the club's approval.
export async function requestJoinClubAsPlayer(code: string): Promise<{ ok: true; clubName: string } | { ok: false; message: string }> {
  const { data, error } = await supabase.rpc('request_join_club_as_player', { input_code: code.trim().toUpperCase() });
  if (error) return { ok: false, message: error.message };
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return { ok: false, message: 'That code could not be resolved.' };
  return { ok: true, clubName: row.club_name };
}

// Player leaves a club at any time — removes their roster row, which hides
// the Club section in Train again.
export async function leaveClub(membershipId: string): Promise<boolean> {
  const { error } = await supabase.from('club_members').delete().eq('id', membershipId);
  return !error;
}

export type ClubJoinRequest = { id: string; playerId: string; playerName: string; signupSkillLevel: string | null };

export async function getPendingClubJoinRequests(clubId: string): Promise<ClubJoinRequest[]> {
  const { data: rows } = await supabase
    .from('club_join_requests')
    .select('id, player_id')
    .eq('club_id', clubId)
    .eq('status', 'pending');
  if (!rows || rows.length === 0) return [];
  const { data: requesters } = await supabase.from('profiles').select('id, full_name, skill_level').in('id', rows.map((r) => r.player_id));
  const byId = new Map((requesters ?? []).map((p: any) => [p.id, p]));
  return rows.map((r) => ({
    id: r.id, playerId: r.player_id,
    playerName: byId.get(r.player_id)?.full_name ?? 'Player',
    signupSkillLevel: byId.get(r.player_id)?.skill_level ?? null,
  }));
}

// Atomic: rosters the player, tags their level for this club, AND marks the
// request approved — all in one SECURITY DEFINER transaction (see
// 20260727160000_approval_level_assignment_and_roster_cleanup.sql). Never do
// this as separate client-side writes, a dropped connection between them
// could leave the roster/level/request-status disagreeing with each other.
export async function approveClubJoinRequest(requestId: string, level: string | null): Promise<{ ok: boolean; message?: string }> {
  const { error } = await supabase.rpc('approve_club_join_request', { request_id: requestId, p_level: level });
  if (error) return { ok: false, message: error.message };
  return { ok: true };
}

export async function rejectClubJoinRequest(requestId: string): Promise<{ ok: boolean }> {
  const { data: { session } } = await supabase.auth.getSession();
  const { error } = await supabase.from('club_join_requests')
    .update({ status: 'rejected', reviewed_at: new Date().toISOString(), reviewed_by: session?.user.id })
    .eq('id', requestId);
  return { ok: !error };
}

export type PlayerSearchResult = { id: string; full_name: string; email: string | null; phone: string | null };

// Adding a player to a LESSON (group tier roster, private lesson) is scoped
// to players who are already active club_members — the only way onto the
// roster at all is code -> request -> approve (see approveClubJoinRequest),
// there is no direct/instant-add search path.
export async function searchClubRosterPlayers(query: string, clubId: string): Promise<PlayerSearchResult[]> {
  const { data, error } = await supabase.rpc('search_club_roster_players', { input_club_id: clubId, query: query.trim() });
  if (error) { console.log('searchClubRosterPlayers error', error); return []; }
  return data ?? [];
}

// Defensive upsert used only when assigning a lesson to a player who came
// from searchClubRosterPlayers (already an active club_members row by
// definition) — a harmless no-op in practice, not a way to add someone new.
// Not exposed as a standalone "add to roster" UI action anywhere.
export async function addPlayerToRoster(clubId: string, playerId: string): Promise<{ ok: boolean; message?: string }> {
  const { error } = await supabase
    .from('club_members')
    .upsert({ club_id: clubId, player_id: playerId, status: 'active' }, { onConflict: 'club_id,player_id', ignoreDuplicates: true });
  if (error) return { ok: false, message: 'Could not add that player to the roster.' };
  return { ok: true };
}
