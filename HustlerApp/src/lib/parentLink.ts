import { supabase } from './supabase';
import { notifyParentLinkRequest, notifyParentLinkAccepted } from './notifications';

const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no 0/O/1/I/L
const CODE_LENGTH = 6;

export type LinkedPerson = { linkId: string; profileId: string; fullName: string; managedByParentId: string | null };
export type PendingRequest = { linkId: string; parentId: string; parentName: string; requestedAt: string };

function generateCode(): string {
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return code;
}

// One persistent code per player (player_share_codes) — unlike a club's
// join code, this never expires or gets consumed; a parent can redeem it
// any time, which just creates a pending link request (see redeemCode).
export async function getOrCreatePlayerShareCode(playerId: string): Promise<string | null> {
  const { data: existing } = await supabase.from('player_share_codes').select('code').eq('player_id', playerId).maybeSingle();
  if (existing) return existing.code;

  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateCode();
    const { error } = await supabase.from('player_share_codes').insert({ player_id: playerId, code });
    if (!error) return code;
    if (!error.message.includes('duplicate')) return null;
  }
  return null;
}

// Swaps in a new code — the old one stops working immediately.
export async function regeneratePlayerShareCode(playerId: string): Promise<string | null> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateCode();
    const { error } = await supabase.from('player_share_codes').update({ code }).eq('player_id', playerId);
    if (!error) return code;
    if (!error.message.includes('duplicate')) return null;
  }
  return null;
}

// Looks up display names for a set of profile ids as a plain, separate
// query rather than a nested embed — an embed like
// `profiles!parent_children_parent_id_fkey(full_name)` depends on both the
// exact auto-generated FK constraint name AND on the caller having RLS
// visibility into the embedded profiles row; getting either wrong silently
// drops or nulls the embed instead of erroring loudly. A plain follow-up
// query degrades to the 'Parent'/'Player' fallback instead of risking the
// whole row.
async function namesById(ids: string[]): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const { data, error } = await supabase.from('profiles').select('id, full_name').in('id', ids);
  if (error) console.log('parentLink namesById error', error);
  return new Map((data ?? []).map((p: any) => [p.id, p.full_name as string]));
}

// Active (accepted, not unlinked) parents linked to a player.
export async function getLinkedParents(playerId: string): Promise<LinkedPerson[]> {
  const { data, error } = await supabase
    .from('parent_children')
    .select('id, parent_id')
    .eq('player_id', playerId)
    .eq('status', 'accepted')
    .is('unlinked_at', null);
  if (error) { console.log('getLinkedParents error', error); return []; }
  const names = await namesById((data ?? []).map((r: any) => r.parent_id));
  return (data ?? []).map((r: any) => ({ linkId: r.id, profileId: r.parent_id, fullName: names.get(r.parent_id) ?? 'Parent', managedByParentId: null }));
}

// Requests still awaiting this player's accept/decline.
export async function getPendingParentRequests(playerId: string): Promise<PendingRequest[]> {
  const { data, error } = await supabase
    .from('parent_children')
    .select('id, parent_id, requested_at')
    .eq('player_id', playerId)
    .eq('status', 'pending')
    .is('unlinked_at', null);
  if (error) { console.log('getPendingParentRequests error', error); return []; }
  const names = await namesById((data ?? []).map((r: any) => r.parent_id));
  return (data ?? []).map((r: any) => ({ linkId: r.id, parentId: r.parent_id, parentName: names.get(r.parent_id) ?? 'Parent', requestedAt: r.requested_at }));
}

// Active (accepted, not unlinked) children linked to a parent. Plain
// follow-up query rather than a nested embed for the same reason namesById
// avoids one (see its comment) — also picks up managed_by_parent_id so the
// UI can show a "Managed" badge for a parent-created, no-login profile.
export async function getLinkedChildren(parentId: string): Promise<LinkedPerson[]> {
  const { data, error } = await supabase
    .from('parent_children')
    .select('id, player_id')
    .eq('parent_id', parentId)
    .eq('status', 'accepted')
    .is('unlinked_at', null);
  if (error) { console.log('getLinkedChildren error', error); return []; }
  const playerIds = (data ?? []).map((r: any) => r.player_id);
  if (playerIds.length === 0) return [];
  const { data: profiles, error: profilesError } = await supabase
    .from('profiles').select('id, full_name, managed_by_parent_id').in('id', playerIds);
  if (profilesError) console.log('getLinkedChildren profiles error', profilesError);
  const byId = new Map((profiles ?? []).map((p: any) => [p.id, p]));
  return (data ?? []).map((r: any) => {
    const p = byId.get(r.player_id);
    return { linkId: r.id, profileId: r.player_id, fullName: p?.full_name ?? 'Player', managedByParentId: p?.managed_by_parent_id ?? null };
  });
}

// Child accepts a pending request — the link only becomes active now.
export async function acceptLink(request: PendingRequest, childName: string): Promise<boolean> {
  const { error } = await supabase
    .from('parent_children')
    .update({ status: 'accepted', accepted_at: new Date().toISOString() })
    .eq('id', request.linkId);
  if (error) return false;
  await notifyParentLinkAccepted(request.parentId, childName);
  return true;
}

// Child declines a pending request — never becomes active.
export async function declineLink(linkId: string): Promise<boolean> {
  const { error } = await supabase.from('parent_children').update({ unlinked_at: new Date().toISOString() }).eq('id', linkId);
  return !error;
}

// Either party (or the child's club owner) unlinks an active connection.
export async function unlink(linkId: string): Promise<boolean> {
  const { error } = await supabase.from('parent_children').update({ unlinked_at: new Date().toISOString() }).eq('id', linkId);
  return !error;
}

export async function redeemCode(code: string): Promise<{ ok: true; playerName: string } | { ok: false; message: string }> {
  const { data, error } = await supabase.rpc('redeem_parent_link_code', { input_code: code.trim().toUpperCase() });
  if (error) return { ok: false, message: error.message };
  const row = Array.isArray(data) ? data[0] : data;
  const playerId = row?.linked_player_id;
  const playerName = row?.linked_player_name ?? 'Player';

  if (playerId) {
    const { data: { session } } = await supabase.auth.getSession();
    const { data: me } = session?.user
      ? await supabase.from('profiles').select('full_name').eq('id', session.user.id).single()
      : { data: null };
    await notifyParentLinkRequest(playerId, me?.full_name ?? 'A parent');
  }

  return { ok: true, playerName };
}
