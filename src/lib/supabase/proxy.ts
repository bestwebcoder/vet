import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

import { publicEnv } from "@/lib/env";

/**
 * Refreshes the Supabase session cookie on every request.
 *
 * This is the only place cookies can reliably be written back, because server
 * components cannot set them. It performs no authorization: route protection
 * lives in server layouts (Phase 1 §1.4) and the real boundary is row level
 * security in Postgres. Next's own guidance is that proxy checks are
 * optimistic only.
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const env = publicEnv();

  const supabase = createServerClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }

          response = NextResponse.next({ request });

          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }

          // Responses that set auth cookies must never be cached by a CDN or
          // reverse proxy, or one user's session can be served to another.
          for (const [key, headerValue] of Object.entries(headers)) {
            response.headers.set(key, headerValue);
          }
        },
      },
    },
  );

  // Must run before the response is generated, otherwise a refresh that
  // completes late cannot be written back and the session is lost.
  await supabase.auth.getClaims();

  return response;
}
