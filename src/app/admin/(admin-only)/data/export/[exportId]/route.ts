import { requireRole } from "@/features/auth/session";
import { backupFileName, readBackup } from "@/features/data/backups";
import { createClient } from "@/lib/supabase/server";

/**
 * Downloads a backup that was taken earlier.
 *
 * The sibling route builds a new snapshot; this one hands back a stored
 * archive byte for byte, so the checksum shown against it on the Data screen
 * still describes the file that arrives. Re-running the export instead would
 * quietly hand over today's data under an older date.
 *
 * Streamed through the application rather than served by a signed URL: the
 * access decision then happens in one place, and no link to a practice's
 * entire clinical record exists outside this request.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ exportId: string }> },
) {
  const user = await requireRole("admin", "super_admin");
  const organizationId = user.organizationIds[0];

  if (!organizationId) return new Response("Not found", { status: 404 });

  const { exportId } = await params;
  const supabase = await createClient();

  // Read the row first. Policies return nothing for another practice's export,
  // so a backup this administrator may not have is indistinguishable from one
  // that does not exist — which is the right answer to give.
  const { data: record, error } = await supabase
    .from("data_exports")
    .select("id, created_at, organization_id")
    .eq("id", exportId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (error || !record) {
    return new Response("Not found", { status: 404 });
  }

  const archive = await readBackup(supabase, record.organization_id, record.id);

  if (!archive) {
    return new Response(
      "This backup's file is no longer stored. Take a new backup to download one.",
      { status: 410, headers: { "Content-Type": "text/plain; charset=utf-8" } },
    );
  }

  const { data: organization } = await supabase
    .from("organizations")
    .select("slug")
    .eq("id", record.organization_id)
    .maybeSingle();

  return new Response(archive as BodyInit, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Length": String(archive.byteLength),
      "Content-Disposition": `attachment; filename="${backupFileName(organization?.slug ?? null, record.created_at)}"`,
      // As with a fresh snapshot: this is the whole clinical record, and
      // nothing between here and the browser should keep a copy.
      "Cache-Control": "no-store, max-age=0",
    },
  });
}
