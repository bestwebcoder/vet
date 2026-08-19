import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

import { publicEnv } from "@/lib/env";

/**
 * Supabase client for server components, server actions and route handlers.
 *
 * A new client is created per request — never share one across requests.
 * Queries run as the signed-in user under the anon key, so row level security
 * remains the enforcement boundary.
 */
export async function createClient() {
  const env = publicEnv();
  const cookieStore = await cookies();

  return createServerClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Server components cannot set cookies. The proxy refreshes the
            // session on every request, so this is safe to ignore here.
          }
        },
      },
    },
  );
}
