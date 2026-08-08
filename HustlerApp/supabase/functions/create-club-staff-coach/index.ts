// Creates a real, immediately-active coach for the caller's club — used by
// the "Add coaches" step of club-onboarding.tsx so an owner can staff up
// during setup without every coach separately signing up and entering a
// join code. profiles.id is FK'd to auth.users.id with no client-side
// insert policy, so this goes through the service-role key — same pattern
// as create-club-walk-in-player/create-managed-child.
//
// Unlike the walk-in PLAYER flow, email here is optional (name-only is
// enough — this is staff the owner already knows and trusts in person):
// - Email given -> inviteUserByEmail, so the coach gets a real invite to
//   set a password and log in themselves.
// - Email omitted -> a placeholder-email + random-password account (same
//   shape as create-managed-child), a real roster entry with no login of
//   their own yet. There's no "claim this account" flow for coaches today
//   (only managed children have that) — accepted limitation, not solved
//   here.

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

    const { clubId, fullName, email } = await req.json();
    const trimmedName = typeof fullName === 'string' ? fullName.trim() : '';
    const trimmedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
    if (!trimmedName) {
      return new Response(JSON.stringify({ error: 'Name is required' }), {
        status: 400,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }
    if (trimmedEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      return new Response(JSON.stringify({ error: 'That email address doesn\'t look valid' }), {
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

    const { data: created, error: createError } = trimmedEmail
      ? await adminClient.auth.admin.inviteUserByEmail(trimmedEmail, {
          data: { full_name: trimmedName, managed: true },
        })
      : await adminClient.auth.admin.createUser({
          email: `coach-${crypto.randomUUID()}@hustlerapp.internal`,
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
    const coachId = created.user.id;

    const { error: profileError } = await adminClient.from('profiles').insert({
      id: coachId,
      full_name: trimmedName,
      email: trimmedEmail || null,
      role: 'coach',
      is_coach: true,
    });
    if (profileError) {
      await adminClient.auth.admin.deleteUser(coachId);
      return new Response(JSON.stringify({ error: profileError.message }), {
        status: 500,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    const { error: rosterError } = await adminClient.from('club_coaches').insert({
      club_id: clubId,
      coach_id: coachId,
      role: 'staff',
      status: 'active',
      roster_scope: 'full_roster',
      can_edit_other_schedules: false,
      assigned_levels: [],
    });
    if (rosterError) {
      await adminClient.auth.admin.deleteUser(coachId);
      return new Response(JSON.stringify({ error: rosterError.message }), {
        status: 500,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ ok: true, coachId }), {
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
