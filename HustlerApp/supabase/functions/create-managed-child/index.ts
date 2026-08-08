// Creates a "managed" player account for a parent's kid who doesn't have
// their own email yet. profiles.id is FK'd to auth.users.id with no
// client-side insert policy, so this has to go through the service-role
// key: a real auth.users row is created with a placeholder email + random
// password the parent never sees (all access happens through the PARENT's
// own session, via the normal parent_children/is_accepted_parent_of
// mechanism — this function never hands back the child's credentials).
// The caller is always the parent identified by their own JWT, never a
// request body parameter — mirrors delete-account/index.ts's structure.

import { createClient } from 'npm:@supabase/supabase-js@2';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization' }), {
        status: 401,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    const { fullName, age } = await req.json();
    const trimmedName = typeof fullName === 'string' ? fullName.trim() : '';
    if (!trimmedName) {
      return new Response(JSON.stringify({ error: 'Name is required' }), {
        status: 400,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // Scoped to the caller's own JWT — used only to find out who they are.
    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user: parent }, error: userError } = await callerClient.auth.getUser();
    if (userError || !parent) {
      return new Response(JSON.stringify({ error: 'Invalid session' }), {
        status: 401,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const { data: created, error: createError } = await adminClient.auth.admin.createUser({
      email: `managed-${crypto.randomUUID()}@hustlerapp.internal`,
      email_confirm: true,
      password: crypto.randomUUID() + crypto.randomUUID(),
      user_metadata: { full_name: trimmedName, managed: true },
    });
    if (createError || !created.user) {
      return new Response(JSON.stringify({ error: createError?.message ?? 'Could not create the account' }), {
        status: 500,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }
    const childId = created.user.id;

    const { error: profileError } = await adminClient.from('profiles').insert({
      id: childId,
      full_name: trimmedName,
      age: typeof age === 'number' ? age : null,
      role: 'player',
      is_coach: false,
      managed_by_parent_id: parent.id,
    });
    if (profileError) {
      await adminClient.auth.admin.deleteUser(childId);
      return new Response(JSON.stringify({ error: profileError.message }), {
        status: 500,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    const { error: linkError } = await adminClient.from('parent_children').insert({
      parent_id: parent.id,
      player_id: childId,
      status: 'accepted',
      accepted_at: new Date().toISOString(),
    });
    if (linkError) {
      await adminClient.auth.admin.deleteUser(childId);
      return new Response(JSON.stringify({ error: linkError.message }), {
        status: 500,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ ok: true, childId }), {
      status: 200,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }
});
