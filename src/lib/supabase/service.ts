import { createClient as createSupabaseClient } from "@supabase/supabase-js";

import { publicEnv, serverEnv } from "@/lib/env";

/**
 * Service-role client, for the notification dispatcher only
 * (src/features/notifications/process.ts and its Route Handler).
 *
 * The dispatcher is not acting on behalf of any one signed-in user — it
 * sends every organization's due notifications — so row level security,
 * which is scoped to `auth.uid()`, cannot be the enforcement boundary here.
 * The service role key bypasses it entirely: never import this into a
 * client component, and never use it to serve a single user's own request
 * (use src/lib/supabase/server.ts for that).
 */
export function createServiceClient() {
  const env = { ...publicEnv(), ...serverEnv() };

  return createSupabaseClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
}
