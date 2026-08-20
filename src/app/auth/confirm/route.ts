import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";

/**
 * Handles both email confirmation and password recovery links.
 *
 * Verification happens here, server-side, from a token hash in the URL — not
 * from a session established at signup — so a link opened on a different
 * device than the one that registered still works.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const requestedNext = searchParams.get("next") ?? "/";

  // Only same-site relative paths, so a crafted link cannot bounce a freshly
  // authenticated user off to another host.
  const next =
    requestedNext.startsWith("/") && !requestedNext.startsWith("//") ? requestedNext : "/";

  if (!tokenHash || !type) {
    redirect("/auth/link-invalid");
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });

  if (error) {
    console.error("[auth] otp verification failed", error);
    redirect("/auth/link-invalid");
  }

  redirect(next);
}
