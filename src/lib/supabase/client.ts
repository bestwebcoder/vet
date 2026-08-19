import { createBrowserClient } from "@supabase/ssr";

import { publicEnv } from "@/lib/env";

/**
 * Supabase client for browser/client components.
 *
 * Uses the anon key, so every query is still subject to row level security.
 */
export function createClient() {
  const env = publicEnv();

  return createBrowserClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}
