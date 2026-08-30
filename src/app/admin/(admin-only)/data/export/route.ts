import type { NextRequest } from "next/server";

import { requireRole } from "@/features/auth/session";
import { storeBackup } from "@/features/data/backups";
import { buildSnapshot, SnapshotTooLargeError } from "@/features/data/export";
import { createClient } from "@/lib/supabase/server";

/**
 * Downloads a practice's data snapshot.
 *
 * A route handler rather than a Server Action because the result is a file:
 * an action returns a value to React, and streaming several megabytes back
 * through the page's render is the wrong shape for a download.
 *
 * The archive is assembled in memory, so this needs the Node runtime — it uses
 * node:zlib to compress and node:crypto to hash — and it will not run on the
 * edge.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const user = await requireRole("admin", "super_admin");
  const organizationId = user.organizationIds[0];

  if (!organizationId) return new Response("Not found", { status: 404 });

  const includeHistory = new URL(request.url).searchParams.get("history") === "1";
  const supabase = await createClient();

  const { data: organization, error } = await supabase
    .from("organizations")
    .select("id, name, slug")
    .eq("id", organizationId)
    .maybeSingle();

  if (error || !organization) {
    console.error("[data-export] organization not readable", error);
    return new Response("Not found", { status: 404 });
  }

  try {
    const snapshot = await buildSnapshot(
      supabase,
      { id: organization.id, name: organization.name, slug: organization.slug },
      { id: user.id, name: user.fullName, email: user.email },
      { includeHistory },
    );

    // Recorded after the archive is built and before it is sent, so the
    // checksum on file always refers to a file that was actually produced.
    const recorded = await supabase
      .from("data_exports")
      .insert({
        organization_id: organizationId,
        actor_user_id: user.id,
        tables: snapshot.manifest.tables.map((table) => table.name),
        row_count: snapshot.manifest.totals.rows,
        byte_size: snapshot.archive.byteLength,
        checksum: snapshot.checksum,
        included_audit: includeHistory,
      })
      .select("id")
      .single();

    // A history line that failed to write is worth a log, not withholding the
    // backup an administrator asked for.
    if (recorded.error) console.error("[data-export] history not recorded", recorded.error);

    // The same archive is kept so it can be downloaded again later. The object
    // is named for the history row, which is why this waits for the insert.
    // Both are best-effort: the response below is the backup that was asked
    // for, and it goes out whether or not the second copy landed.
    if (recorded.data) {
      await storeBackup(supabase, organizationId, recorded.data.id, snapshot.archive);
    }

    return new Response(snapshot.archive as BodyInit, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Length": String(snapshot.archive.byteLength),
        "Content-Disposition": `attachment; filename="${snapshot.fileName}"`,
        // A snapshot is a point in time and carries the whole clinical record.
        // Nothing between here and the browser should keep a copy.
        "Cache-Control": "no-store, max-age=0",
      },
    });
  } catch (cause) {
    if (cause instanceof SnapshotTooLargeError) {
      return new Response(cause.message, { status: 413, headers: { "Content-Type": "text/plain; charset=utf-8" } });
    }

    console.error("[data-export] failed", cause);
    return new Response("We could not build that backup just now. Please try again.", {
      status: 500,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }
}
