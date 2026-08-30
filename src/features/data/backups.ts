import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Where a practice's backup archives are kept.
 *
 * The archive used to exist only for as long as the download took. Keeping it
 * means an administrator can fetch a backup again from the screen that lists
 * it, instead of hoping the file is still in someone's Downloads folder — and
 * can delete it deliberately when it has served its purpose.
 *
 * The stored file is a copy. The record of the snapshot lives in data_exports,
 * which is append-only and outlives any deletion here.
 */

export const BACKUP_BUCKET = "practice-backups";

/**
 * One object per export row, under the practice that owns it. The storage
 * policies read the practice out of that first segment, so the path is the
 * access decision — it is never taken from a request.
 */
export function backupObjectPath(organizationId: string, exportId: string): string {
  return `${organizationId}/${exportId}.zip`;
}

/**
 * The name the browser saves it as. Rebuilt from the practice and the day it
 * was taken rather than stored, so a re-download of an old backup is named for
 * when it was made, not for today.
 */
export function backupFileName(slug: string | null, takenAt: string): string {
  return `${slug || "practice"}-backup-${takenAt.slice(0, 10)}.zip`;
}

/**
 * Keeps the archive alongside the history row.
 *
 * Returns whether it was stored. A failure here is not allowed to fail the
 * download that is already built and on its way — the administrator asked for
 * a backup, and getting one matters more than keeping a second copy.
 */
export async function storeBackup(
  supabase: SupabaseClient,
  organizationId: string,
  exportId: string,
  archive: Uint8Array,
): Promise<boolean> {
  const { error } = await supabase.storage
    .from(BACKUP_BUCKET)
    .upload(backupObjectPath(organizationId, exportId), archive, {
      contentType: "application/zip",
      upsert: true,
    });

  if (error) {
    console.error("[data-export] archive not stored", error);
    return false;
  }

  return true;
}

/**
 * The export ids whose archive is still on disk.
 *
 * Asked of storage rather than tracked in a column: data_exports cannot be
 * updated by anyone, and a flag that could not be cleared when the file goes
 * would be a promise the screen could not keep. Listing is also the truth if a
 * file is ever removed from outside the application.
 */
export async function listStoredBackupIds(
  supabase: SupabaseClient,
  organizationId: string,
): Promise<Set<string>> {
  const { data, error } = await supabase.storage
    .from(BACKUP_BUCKET)
    .list(organizationId, { limit: 1000 });

  if (error) {
    console.error("[data-export] listing archives failed", error);
    return new Set();
  }

  return new Set(
    (data ?? [])
      .filter((object) => object.name.endsWith(".zip"))
      .map((object) => object.name.slice(0, -".zip".length)),
  );
}

/** Reads one stored archive back, or null when it is no longer there. */
export async function readBackup(
  supabase: SupabaseClient,
  organizationId: string,
  exportId: string,
): Promise<Uint8Array | null> {
  const { data, error } = await supabase.storage
    .from(BACKUP_BUCKET)
    .download(backupObjectPath(organizationId, exportId));

  if (error || !data) {
    console.error("[data-export] archive not readable", error);
    return null;
  }

  return new Uint8Array(await data.arrayBuffer());
}

/** Deletes one stored archive. The history row it belongs to is untouched. */
export async function removeBackup(
  supabase: SupabaseClient,
  organizationId: string,
  exportId: string,
): Promise<boolean> {
  const { error } = await supabase.storage
    .from(BACKUP_BUCKET)
    .remove([backupObjectPath(organizationId, exportId)]);

  if (error) {
    console.error("[data-export] archive not deleted", error);
    return false;
  }

  return true;
}
