import type { NextRequest } from "next/server";

import { processScheduledNotifications } from "@/features/notifications/process";
import { serverEnv } from "@/lib/env";

/**
 * Dispatch endpoint for the Phase 6 reminder engine's scheduled sends
 * (§9.3). This app has no standing background process — a production
 * deployment is expected to hit this route every 1–5 minutes from an
 * external scheduler (Vercel Cron, Supabase `pg_cron` via `pg_net`, or a
 * plain system cron), authenticating with the shared secret below. Locally
 * it can be called directly (curl, or the admin "Process now" control) for
 * manual verification.
 */
export async function POST(request: NextRequest) {
  const env = serverEnv();
  const secret = request.headers.get("x-notification-cron-secret");

  if (!env.NOTIFICATION_CRON_SECRET || secret !== env.NOTIFICATION_CRON_SECRET) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const summary = await processScheduledNotifications();
  return Response.json(summary);
}
