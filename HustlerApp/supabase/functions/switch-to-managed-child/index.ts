// Mints a fresh one-time password for a managed child's real (but
// otherwise unusable) auth account, so the parent's device can sign into it
// for real and get the actual, unmodified player app — see
// create-managed-child/index.ts for why the account has a real login at all.
//
// Deliberately restricted to accounts the CALLING parent themselves
// created (profiles.managed_by_parent_id = caller.id), not just any linked
// child — a normally-linked (non-managed) child has their own real
// credentials of their own choosing, and this must never be a way to sign
// into an independent kid's account without their knowledge.

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

    const { childId } = await req.json();
    if (typeof childId !== 'string' || !childId) {
      return new Response(JSON.stringify({ error: 'childId is required' }), {
        status: 400,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

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

    const { data: childProfile } = await adminClient
      .from('profiles').select('managed_by_parent_id').eq('id', childId).maybeSingle();
    if (!childProfile || childProfile.managed_by_parent_id !== parent.id) {
      return new Response(JSON.stringify({ error: 'Not authorized to switch into this account' }), {
        status: 403,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    const { data: link } = await adminClient
      .from('parent_children').select('id')
      .eq('parent_id', parent.id).eq('player_id', childId).eq('status', 'accepted').is('unlinked_at', null)
      .maybeSingle();
    if (!link) {
      return new Response(JSON.stringify({ error: 'Not authorized to switch into this account' }), {
        status: 403,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    const { data: childUser, error: getUserError } = await adminClient.auth.admin.getUserById(childId);
    if (getUserError || !childUser.user?.email) {
      return new Response(JSON.stringify({ error: 'Could not look up that profile' }), {
        status: 500,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    const tempPassword = crypto.randomUUID() + crypto.randomUUID();
    const { error: updateError } = await adminClient.auth.admin.updateUserById(childId, { password: tempPassword });
    if (updateError) {
      return new Response(JSON.stringify({ error: updateError.message }), {
        status: 500,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ ok: true, email: childUser.user.email, password: tempPassword }), {
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
