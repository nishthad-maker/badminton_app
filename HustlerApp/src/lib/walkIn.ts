import { supabase, getFunctionErrorMessage } from './supabase';

// Front-desk registration for a walk-in who doesn't have the app yet — see
// supabase/functions/create-club-walk-in-player/index.ts for why this has
// to be a server-side call (profiles.id is FK'd to auth.users.id, and
// there's no client-side insert policy on profiles). Unlike the normal
// join-code flow, this rosters the player as 'active' immediately since a
// staff member is registering them in person. Email is required and real
// (not a placeholder) — it's used to send them an actual invite to set a
// password and log in later; phone stays optional contact info.
export async function createWalkInPlayer(
  clubId: string, fullName: string, email: string, phone: string, level: string | null
): Promise<{ ok: boolean; playerId?: string; message?: string }> {
  const { data, error } = await supabase.functions.invoke('create-club-walk-in-player', {
    body: { clubId, fullName, email, phone, level },
  });
  if (error) return { ok: false, message: await getFunctionErrorMessage(error, 'Could not register that player. Please try again.') };
  if (data?.error) return { ok: false, message: data.error };
  return { ok: true, playerId: data?.playerId };
}
