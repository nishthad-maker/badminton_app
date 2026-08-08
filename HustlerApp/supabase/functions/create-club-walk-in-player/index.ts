// Creates a real player profile for a front-desk walk-in who doesn't have
// the app yet, then rosters them onto the caller's club immediately —
// skipping the normal join-code/request/approval flow entirely, since a
// staff member is registering them in person and no untrusted party is
// vouching for themselves. profiles.id is FK'd to auth.users.id with no
// client-side insert policy, so this has to go through the service-role
// key — same reason create-managed-child does. Deliberately a separate
// function rather than an overload of create-managed-child: the auth model
// differs (proving is_club_staff for a target club_id, vs. a parent acting
// on their own JWT with no club concept) and so does the side effect (a
// club_members row, not a parent_children link).
//
// Email is mandatory and real (not a placeholder) — inviteUserByEmail both
// creates the auth.users row AND sends Supabase's standard invite email, so
// the player can actually set a password and log in later. Phone stays
// optional (contact info, not identity). Coaches are the exception to this
// policy — see create-club-staff-coach, where email is optional.

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

    const { clubId, fullName, email, phone, level } = await req.json();
    const trimmedName = typeof fullName === 'string' ? fullName.trim() : '';
    const trimmedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
    if (!trimmedName) {
      return new Response(JSON.stringify({ error: 'Name is required' }), {
        status: 400,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }
    if (!trimmedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      return new Response(JSON.stringify({ error: 'A valid email is required' }), {
        status: 400,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }
    if (typeof clubId !== 'string' || !clubId) {
      return new Response(JSON.stringify({ error: 'Missing club' }), {
        status: 400,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // Scoped to the caller's own JWT — used to find out who they are AND to
    // check is_club_staff (a SECURITY DEFINER function, so this call works
    // regardless of what this client can otherwise see via RLS).
    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user: staffer }, error: userError } = await callerClient.auth.getUser();
    if (userError || !staffer) {
      return new Response(JSON.stringify({ error: 'Invalid session' }), {
        status: 401,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    const { data: isStaff, error: staffCheckError } = await callerClient.rpc('is_club_staff', { target_club_id: clubId });
    if (staffCheckError || !isStaff) {
      return new Response(JSON.stringify({ error: 'Not authorized for this club' }), {
        status: 403,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const { data: created, error: createError } = await adminClient.auth.admin.inviteUserByEmail(trimmedEmail, {
      data: { full_name: trimmedName, managed: true },
    });
    if (createError || !created.user) {
      return new Response(JSON.stringify({ error: createError?.message ?? 'Could not create the account' }), {
        status: 500,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }
    const playerId = created.user.id;

    const { error: profileError } = await adminClient.from('profiles').insert({
      id: playerId,
      full_name: trimmedName,
      email: trimmedEmail,
      phone: typeof phone === 'string' && phone.trim() ? phone.trim() : null,
      role: 'player',
      is_coach: false,
    });
    if (profileError) {
      await adminClient.auth.admin.deleteUser(playerId);
      return new Response(JSON.stringify({ error: profileError.message }), {
        status: 500,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    const { error: rosterError } = await adminClient.from('club_members').insert({
      club_id: clubId,
      player_id: playerId,
      status: 'active',
      level: typeof level === 'string' && level.trim() ? level.trim() : null,
    });
    if (rosterError) {
      await adminClient.auth.admin.deleteUser(playerId);
      return new Response(JSON.stringify({ error: rosterError.message }), {
        status: 500,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ ok: true, playerId }), {
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
