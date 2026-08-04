import { createClient } from '@supabase/supabase-js';

/**
 * Service-role client for server-side writes that bypass RLS.
 * Never expose this to the browser.
 *
 * Note: intentionally untyped at the table level to avoid brittle
 * hand-written Database generics breaking insert/select inference.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      'Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY',
    );
  }

  return createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
