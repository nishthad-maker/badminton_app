import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase, getFunctionErrorMessage } from './supabase';

// Creates a full player profile for a kid who doesn't have their own email
// yet, fully controlled by the calling parent — see
// supabase/functions/create-managed-child/index.ts for why this has to be
// a server-side call (profiles.id is FK'd to auth.users.id, and there's no
// client-side insert policy on profiles).
export async function createManagedChild(fullName: string, age?: number): Promise<{ ok: boolean; childId?: string; message?: string }> {
  const { data, error } = await supabase.functions.invoke('create-managed-child', {
    body: { fullName, age },
  });
  if (error) return { ok: false, message: await getFunctionErrorMessage(error, 'Could not create the profile. Please try again.') };
  if (data?.error) return { ok: false, message: data.error };
  return { ok: true, childId: data?.childId };
}

// A managed child has no independent login the kid could use to open the
// real player app — this signs the DEVICE into their real (but otherwise
// unusable) account for real, so (tabs)/* works completely unmodified. The
// parent's own session is cached first so "Back to my account" can restore
// it without asking for a password again — see restoreParentSession.
const SAVED_PARENT_SESSION_KEY = 'hustler.savedParentSession';

export async function switchIntoManagedChild(childId: string): Promise<{ ok: boolean; message?: string }> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return { ok: false, message: 'You need to be signed in.' };

  const { data, error } = await supabase.functions.invoke('switch-to-managed-child', { body: { childId } });
  if (error) return { ok: false, message: 'Could not switch into that profile. Please try again.' };
  if (data?.error) return { ok: false, message: data.error };

  await AsyncStorage.setItem(SAVED_PARENT_SESSION_KEY, JSON.stringify({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
  }));

  const { error: signInError } = await supabase.auth.signInWithPassword({ email: data.email, password: data.password });
  if (signInError) {
    await AsyncStorage.removeItem(SAVED_PARENT_SESSION_KEY);
    return { ok: false, message: 'Could not switch into that profile. Please try again.' };
  }
  return { ok: true };
}

export async function hasSavedParentSession(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(SAVED_PARENT_SESSION_KEY)) !== null;
  } catch {
    return false;
  }
}

export async function restoreParentSession(): Promise<boolean> {
  try {
    const raw = await AsyncStorage.getItem(SAVED_PARENT_SESSION_KEY);
    if (!raw) return false;
    const { access_token, refresh_token } = JSON.parse(raw);
    const { error } = await supabase.auth.setSession({ access_token, refresh_token });
    await AsyncStorage.removeItem(SAVED_PARENT_SESSION_KEY);
    return !error;
  } catch {
    return false;
  }
}
