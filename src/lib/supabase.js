import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.warn('[Supabase] Missing env vars. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to .env');
}

// The ONLY client in the browser. It uses the public anon/publishable key;
// what each user can see is enforced by Row Level Security (supabase/security.sql).
//
// ⚠️ Never put the service_role / secret key in a VITE_ variable — anything
// prefixed VITE_ is bundled into the public JavaScript. Admin actions
// (create / reset / revoke logins) go through the `admin-users` Edge Function.
export const supabase = createClient(supabaseUrl || '', supabaseKey || '');
