import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: Platform.OS === 'web' ? undefined : AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

// supabase.functions.invoke() puts ANY non-2xx response into `error`, not
// `data` — even when the edge function returned a well-formed
// `{ error: "..." }` JSON body. `error` is a FunctionsHttpError whose
// `.context` is the raw Response; the actual message has to be read back
// out of it explicitly, or every edge-function error call site silently
// collapses to a generic fallback string, discarding the real reason
// (validation failure, RLS/auth rejection, DB constraint, etc.) — that
// bug is exactly what happened here before this helper existed.
export async function getFunctionErrorMessage(error: any, fallback: string): Promise<string> {
  try {
    if (error?.context?.json) {
      const body = await error.context.json();
      if (body?.error) return String(body.error);
    }
  } catch {
    // context wasn't JSON (network error, relay error, etc.) — fall through
  }
  return fallback;
}