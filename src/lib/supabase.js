import { createClient } from '@supabase/supabase-js';

const supabaseUrl     = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey     = import.meta.env.VITE_SUPABASE_ANON_KEY;
const serviceRoleKey  = import.meta.env.VITE_SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.warn('[Supabase] Missing env vars. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to .env');
}

// Main client — persists session in localStorage for the logged-in user
export const supabase = createClient(supabaseUrl || '', supabaseKey || '');

// Admin client — uses the service role key so we can call
// auth.admin.createUser() which creates accounts with no confirmation email.
// persistSession:false means this client never touches the current user session.
export const supabaseAdmin = createClient(
  supabaseUrl || '',
  serviceRoleKey || supabaseKey || '',   // falls back to anon key if not set
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  }
);

// Whether the service role key is available (determines which API we use)
export const hasServiceRole = !!serviceRoleKey;
