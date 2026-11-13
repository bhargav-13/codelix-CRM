// ================================================================
// Codelix OMS — admin-users Edge Function
//
// Replaces the service-role key that used to ship inside the browser
// bundle. The admin key now lives ONLY here, on Supabase's servers.
// Only "access admins" (app_users.is_access_admin = true — Bhargav and
// Manas) can call it.
//
// Actions (POST JSON body):
//   { action: 'list' }                         → [{ user_id, email, employee_id, ... }]
//   { action: 'create', employeeId }           → { tempPassword }
//   { action: 'reset',  employeeId }           → { tempPassword }
//   { action: 'revoke', employeeId }           → { ok: true }
//
// Deploy (from the project root):
//   npx supabase login
//   npx supabase link --project-ref <your-project-ref>
//   npx supabase functions deploy admin-users --no-verify-jwt
//   (--no-verify-jwt is safe: the caller's token is verified below.)
//
// Secrets: SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY are
// provided automatically. If you move to the new sb_secret_ keys, set
//   npx supabase secrets set ADMIN_SECRET_KEY=sb_secret_...
// ================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.103.3';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const ANON_KEY     = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const SERVICE_KEY  = Deno.env.get('ADMIN_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

// 14-char random password with upper, lower, digit and symbol
function tempPassword(): string {
  const sets = ['ABCDEFGHJKLMNPQRSTUVWXYZ', 'abcdefghijkmnpqrstuvwxyz', '23456789', '@#$%&*!?'];
  const all = sets.join('');
  const rnd = (n: number) => crypto.getRandomValues(new Uint32Array(1))[0] % n;
  const chars = sets.map(s => s[rnd(s.length)]);
  while (chars.length < 14) chars.push(all[rnd(all.length)]);
  for (let i = chars.length - 1; i > 0; i--) { const j = rnd(i + 1); [chars[i], chars[j]] = [chars[j], chars[i]]; }
  return chars.join('');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  // ── 1. Who is calling? ────────────────────────────────────────────
  const authHeader = req.headers.get('Authorization') ?? '';
  const token = authHeader.replace(/^Bearer\s+/i, '');
  if (!token) return json({ error: 'Not signed in' }, 401);

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: { user }, error: userErr } = await createClient(SUPABASE_URL, ANON_KEY).auth.getUser(token);
  if (userErr || !user) return json({ error: 'Not signed in' }, 401);

  const { data: caller } = await admin.from('app_users')
    .select('role, is_access_admin').eq('user_id', user.id).maybeSingle();
  if (!caller || caller.role !== 'partner' || !caller.is_access_admin) {
    return json({ error: 'Only Bhargav or Manas can manage user access.' }, 403);
  }

  // ── 2. Do the action ──────────────────────────────────────────────
  let body: { action?: string; employeeId?: string } = {};
  try { body = await req.json(); } catch { /* empty body */ }

  try {
    if (body.action === 'list') {
      const { data, error } = await admin.from('app_users')
        .select('user_id, email, role, display_name, employee_id, is_access_admin, permissions, must_change_password, created_at')
        .order('created_at');
      if (error) throw error;
      return json({ users: data });
    }

    if (!body.employeeId) return json({ error: 'employeeId is required' }, 400);

    const { data: emp } = await admin.from('employees').select('id, name, email').eq('id', body.employeeId).maybeSingle();
    if (!emp) return json({ error: 'Employee not found' }, 404);
    const { data: existing } = await admin.from('app_users').select('user_id').eq('employee_id', emp.id).maybeSingle();

    if (body.action === 'create') {
      if (!emp.email) return json({ error: 'Add an email to this employee first' }, 400);
      if (existing) return json({ error: 'This employee already has a login' }, 409);
      const password = tempPassword();
      const { data: created, error } = await admin.auth.admin.createUser({
        email: emp.email.toLowerCase(), password, email_confirm: true,
      });
      if (error || !created.user) throw error ?? new Error('Could not create login');
      const { error: insErr } = await admin.from('app_users').insert({
        user_id: created.user.id,
        email: emp.email.toLowerCase(),
        role: 'employee',
        display_name: emp.name,
        employee_id: emp.id,
        permissions: {},              // NO access by default
        must_change_password: true,
      });
      if (insErr) { await admin.auth.admin.deleteUser(created.user.id); throw insErr; }
      return json({ tempPassword: password });
    }

    if (body.action === 'reset') {
      if (!existing) return json({ error: 'This employee has no login yet' }, 404);
      const password = tempPassword();
      const { error } = await admin.auth.admin.updateUserById(existing.user_id, { password });
      if (error) throw error;
      await admin.from('app_users').update({ must_change_password: true }).eq('user_id', existing.user_id);
      return json({ tempPassword: password });
    }

    if (body.action === 'revoke') {
      if (!existing) return json({ ok: true });
      const { error } = await admin.auth.admin.deleteUser(existing.user_id); // cascades app_users
      if (error) throw error;
      return json({ ok: true });
    }

    return json({ error: 'Unknown action' }, 400);
  } catch (e) {
    return json({ error: (e as Error)?.message ?? 'Server error' }, 500);
  }
});
