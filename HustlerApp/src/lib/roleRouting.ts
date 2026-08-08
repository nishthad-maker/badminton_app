import { supabase } from './supabase';
import { getPreferredViewMode, ViewMode } from './viewMode';

export type AppRole = 'coach' | 'club' | 'parent' | 'player';

// Single source of truth for "which role is this account" — same precedence
// root index.tsx's post-login redirect uses (is_coach wins over role, since
// a coach account can also carry role='player'/'parent' from before they
// were made a coach). Every tab-group layout guards itself with this now,
// not just the one-time redirect on app launch — a deep link (push
// notification `screen`, stale bookmark, typed URL on web) can land a
// session directly inside a route without ever passing through index.tsx,
// so relying on that redirect alone left every tab group renderable by any
// role with no check at all.
// Pure — takes an already-fetched profile row (login.tsx already has one
// with `age` on it for the onboarding check, no need to fetch a second time).
// `preferredView` only matters for a dual-role account (a club owner who has
// also flipped on "I also coach lessons here", so both is_coach=true and
// role='club' are set) — everyone else's resolution is unchanged.
export function roleFromProfile(
  profile: { is_coach?: boolean | null; role?: string | null } | null | undefined,
  preferredView?: ViewMode | null,
): AppRole {
  if (profile?.is_coach && profile?.role === 'club') return preferredView ?? 'coach';
  if (profile?.is_coach) return 'coach';
  if (profile?.role === 'club') return 'club';
  if (profile?.role === 'parent') return 'parent';
  return 'player';
}

export async function resolveMyRole(): Promise<AppRole | null> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) return null;
  const { data: profile } = await supabase.from('profiles').select('is_coach, role').eq('id', session.user.id).single();
  if (!profile) return null;
  const preferredView = await getPreferredViewMode();
  return roleFromProfile(profile, preferredView);
}

export const ROLE_HOME_ROUTE: Record<AppRole, string> = {
  coach: '/(coach-tabs)/players',
  club: '/(club-admin)/dashboard',
  parent: '/(parent-tabs)/home',
  player: '/(tabs)',
};
