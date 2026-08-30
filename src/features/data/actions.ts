"use server";

import { revalidatePath } from "next/cache";

import { requireRole } from "@/features/auth/session";
import { removeBackup } from "@/features/data/backups";
import { CsvParseError } from "@/lib/csv";
import { failure, text, type FormState } from "@/lib/forms";
import { createClient } from "@/lib/supabase/server";

import {
  analyzeImport,
  insertReadyRows,
  isImporterKey,
  IMPORTERS,
  type ImporterKey,
  type RowOutcome,
} from "./importers";
import type { ImportState, PreviewRow } from "./import-state";
import { archivableTables } from "./tables";

/**
 * Writes for the Data screen.
 *
 * The export is not here — it is a download, so it lives in the route handler
 * at /admin/data/export. What is here brings rows in, puts a deleted row back,
 * or deletes a stored backup file. None of it removes or overwrites a record:
 * an archive is a copy of the practice's data, and the row saying it was taken
 * survives its deletion (CLAUDE.md §9.16, §9.18).
 */

/**
 * A CSV bigger than this is not an onboarding file, it is a database, and
 * belongs in a migration rather than an upload. Well under the 21 MB Server
 * Action body limit in next.config.ts, and small enough to parse in a request.
 */
const MAX_CSV_BYTES = 5 * 1024 * 1024;

/**
 * How many lines of each kind travel back to the browser. A preview exists to
 * be read; a person is not going to scroll ten thousand rows, and the counts
 * above the list already say how many there are.
 */
const PREVIEW_LIMIT = 100;

function toPreviewRow(outcome: RowOutcome): PreviewRow {
  switch (outcome.status) {
    case "ready":
      return { status: "ready", line: outcome.line, label: outcome.label };
    case "duplicate":
      return { status: "duplicate", line: outcome.line, label: outcome.label, reason: outcome.reason };
    case "invalid":
      return { status: "invalid", line: outcome.line, label: outcome.label, errors: outcome.errors };
  }
}

/** Keeps a readable sample: problems first, because those are what need a decision. */
function sampleRows(outcomes: RowOutcome[]): { rows: PreviewRow[]; truncated: boolean } {
  const ordered = [
    ...outcomes.filter((outcome) => outcome.status === "invalid"),
    ...outcomes.filter((outcome) => outcome.status === "duplicate"),
    ...outcomes.filter((outcome) => outcome.status === "ready"),
  ];

  return {
    rows: ordered.slice(0, PREVIEW_LIMIT).map(toPreviewRow),
    truncated: ordered.length > PREVIEW_LIMIT,
  };
}

/** Reads the uploaded file, or explains in a sentence why it cannot be used. */
async function readUpload(formData: FormData): Promise<{ name: string; csv: string } | { message: string }> {
  const file = formData.get("file");

  if (!(file instanceof File) || file.size === 0) {
    return { message: "Choose a CSV file to import." };
  }

  if (file.size > MAX_CSV_BYTES) {
    return { message: "That file is larger than 5 MB. Split it into smaller files and import them one at a time." };
  }

  return { name: file.name, csv: await file.text() };
}

function importerFrom(formData: FormData): ImporterKey | null {
  const value = text(formData, "importer") ?? "";
  return isImporterKey(value) ? value : null;
}

async function organizationFor() {
  const user = await requireRole("admin", "super_admin");
  return { user, organizationId: user.organizationIds[0] ?? null };
}

/**
 * Says what an import would do, and writes nothing.
 *
 * The result is advisory. Committing does not trust any of it — it re-reads
 * the file and re-runs the same analysis — so a browser that tampers with what
 * it was shown changes nothing about what is inserted.
 */
async function previewImport(formData: FormData): Promise<ImportState> {
  const { organizationId } = await organizationFor();
  if (!organizationId) return { status: "error", message: "Your account is not linked to a practice yet." };

  const importer = importerFrom(formData);
  if (!importer) return { status: "error", message: "We could not tell which records this file holds." };

  const upload = await readUpload(formData);
  if ("message" in upload) return { status: "error", message: upload.message };

  const supabase = await createClient();

  try {
    const analysis = await analyzeImport(supabase, organizationId, importer, upload.csv);
    const { rows, truncated } = sampleRows(analysis.outcomes);

    return {
      status: "preview",
      preview: {
        importer,
        fileName: upload.name,
        total: analysis.total,
        ready: analysis.ready,
        duplicates: analysis.duplicates,
        invalid: analysis.invalid,
        unknownColumns: analysis.unknownColumns,
        missingColumns: analysis.missingColumns,
        rows,
        truncated,
      },
    };
  } catch (error) {
    if (error instanceof CsvParseError) return { status: "error", message: error.message };

    console.error("[data-import] preview failed", error);
    return { status: "error", message: "We could not read that file just now. Please try again." };
  }
}

/**
 * Imports the rows that pass, and reports on the rest.
 *
 * Deliberately re-analyses rather than acting on the preview: the preview is
 * minutes old by the time somebody clicks, and in between a colleague may have
 * created the very client this file was about to add.
 */
async function commitImport(formData: FormData): Promise<ImportState> {
  const { user, organizationId } = await organizationFor();
  if (!organizationId) return { status: "error", message: "Your account is not linked to a practice yet." };

  const importer = importerFrom(formData);
  if (!importer) return { status: "error", message: "We could not tell which records this file holds." };

  const upload = await readUpload(formData);
  if ("message" in upload) return { status: "error", message: upload.message };

  const supabase = await createClient();

  try {
    const analysis = await analyzeImport(supabase, organizationId, importer, upload.csv);

    if (analysis.missingColumns.length > 0) {
      return {
        status: "error",
        message: `That file is missing the ${analysis.missingColumns.join(", ")} column. Nothing was imported.`,
      };
    }

    const { imported, failed } = await insertReadyRows(supabase, importer, analysis.outcomes);

    const { error } = await supabase.from("data_imports").insert({
      organization_id: organizationId,
      actor_user_id: user.id,
      target: IMPORTERS[importer].table,
      file_name: upload.name,
      rows_total: analysis.total,
      rows_imported: imported,
      rows_skipped: analysis.duplicates,
      rows_failed: analysis.invalid + failed.length,
    });

    // The rows are in; failing to write the history line is worth a log, not a
    // false report that the import did not happen.
    if (error) console.error("[data-import] history not recorded", error);

    revalidatePath("/admin/data");
    revalidatePath(`/admin/${importer === "pets" ? "patients" : importer}`);

    return {
      status: "imported",
      message:
        imported === 0
          ? "Nothing was imported — every row was already here or could not be read."
          : `Imported ${imported} of ${analysis.total} ${imported === 1 ? "row" : "rows"}.`,
      outcome: {
        importer,
        imported,
        skipped: analysis.duplicates,
        failed: [
          ...analysis.outcomes
            .filter((outcome): outcome is Extract<RowOutcome, { status: "invalid" }> => outcome.status === "invalid")
            .map((outcome) => ({ line: outcome.line, label: outcome.label, message: outcome.errors.join("; ") })),
          ...failed,
        ].slice(0, PREVIEW_LIMIT),
      },
    };
  } catch (error) {
    if (error instanceof CsvParseError) return { status: "error", message: error.message };

    console.error("[data-import] failed", error);
    return { status: "error", message: "We could not import that file just now. Nothing was changed." };
  }
}

/**
 * Puts a soft-deleted record back.
 *
 * The unique indexes on these tables are partial — `where deleted_at is null` —
 * so a phone number or service name freed up by the deletion may since have
 * been taken. That comes back as a collision, and is worth a sentence rather
 * than a retry.
 */
export async function restoreRecordAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const { organizationId } = await organizationFor();
  if (!organizationId) return { status: "error", message: "Your account is not linked to a practice yet." };

  const tableName = text(formData, "table") ?? "";
  const recordId = text(formData, "recordId");

  const table = archivableTables().find((candidate) => candidate.name === tableName);
  if (!table) return { status: "error", message: "That kind of record cannot be restored from here." };
  if (!recordId) return { status: "error", message: "We could not tell which record to restore." };

  const supabase = await createClient();

  const { error } = await supabase
    .from(table.name)
    .update({ deleted_at: null })
    .eq("id", recordId)
    .eq("organization_id", organizationId)
    .not("deleted_at", "is", null);

  if (error) {
    if (error.code === "23505") {
      return {
        status: "error",
        message:
          "Something created since the deletion now uses the same name or number, so this record cannot be restored under it. Rename the newer record first.",
      };
    }

    return failure("data-restore", error, "We could not restore that record just now. Please try again.");
  }

  revalidatePath("/admin/data");
  return { status: "success", message: `${table.label.replace(/s$/, "")} restored.` };
}

/**
 * Deletes one stored backup archive.
 *
 * The file only. `data_exports` is append-only — a trigger refuses UPDATE and
 * DELETE for every role, service_role included — so the line recording that a
 * snapshot was taken, by whom, of how many rows and with what checksum stays
 * on the screen afterwards, marked as no longer kept. A practice can reclaim
 * the space without editing its own history.
 */
export async function deleteBackupFileAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const { organizationId } = await organizationFor();
  if (!organizationId) return { status: "error", message: "Your account is not linked to a practice yet." };

  const exportId = text(formData, "exportId");
  if (!exportId) return { status: "error", message: "We could not tell which backup to delete." };

  const supabase = await createClient();

  // The export is looked up before the object is touched, so the path deleted
  // is built from a row this administrator can actually see rather than from
  // the id that arrived in the request.
  const { data: record, error } = await supabase
    .from("data_exports")
    .select("id")
    .eq("id", exportId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (error) {
    return failure("data-backup", error, "We could not delete that backup just now. Please try again.");
  }

  if (!record) return { status: "error", message: "That backup could not be found." };

  const removed = await removeBackup(supabase, organizationId, record.id);

  if (!removed) {
    return { status: "error", message: "We could not delete that backup file just now. Please try again." };
  }

  revalidatePath("/admin/data");
  return { status: "success", message: "Backup file deleted. The record of it stays in the history." };
}

/**
 * The one action the import form posts to, checking or importing according to
 * which button was pressed.
 *
 * One action and one form, because both steps need the same uploaded file and
 * a file input cannot be shared between two forms. The alternative — stashing
 * the parsed file somewhere between the two — would mean importing something
 * other than what is on screen.
 */
export async function importDataAction(_previous: ImportState, formData: FormData): Promise<ImportState> {
  return formData.get("intent") === "import" ? commitImport(formData) : previewImport(formData);
}

/**
 * Permanently deletes everything in one section of the archive.
 *
 * The one thing in this application that destroys a record. Everywhere else a
 * delete sets `deleted_at` and the row stays; here the rows are gone, and no
 * restore brings them back — only a backup does.
 *
 * Two things keep it inside CLAUDE.md §6 rather than outside it. The deletion
 * is not silent: 20261003000100 taught the audit triggers to fire on DELETE,
 * so every destroyed row leaves an entry naming who removed it and holding a
 * copy of what it contained. And it is not indiscriminate: the ON DELETE
 * RESTRICT foreign keys are left in place, so a patient with a SOAP record, an
 * appointment or an invoice refuses to go, and this reports which tables are
 * holding it rather than cascading through a paid invoice on its way out.
 *
 * Rows are removed one at a time on purpose. A single `in` delete is one
 * statement, so one blocked row would abort the whole thing and clear nothing;
 * per row, the ones that can go, go — and the ones that cannot are named.
 */
export async function emptyArchiveSectionAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const { organizationId } = await organizationFor();
  if (!organizationId) return { status: "error", message: "Your account is not linked to a practice yet." };

  const tableName = text(formData, "table") ?? "";
  const table = archivableTables().find((candidate) => candidate.name === tableName);
  if (!table) return { status: "error", message: "That kind of record cannot be emptied from here." };

  // Typed by hand in the dialog. A bulk irreversible delete is worth more than
  // a button that can be hit by accident on the way to Restore.
  if (text(formData, "confirmation") !== "DELETE") {
    return {
      status: "error",
      message: "Type DELETE to confirm.",
      fieldErrors: { confirmation: ["Type DELETE exactly, in capitals."] },
    };
  }

  const supabase = await createClient();

  const { data: rows, error: readError } = await supabase
    .from(table.name)
    .select("id")
    .eq("organization_id", organizationId)
    .not("deleted_at", "is", null)
    .returns<{ id: string }[]>();

  if (readError) {
    return failure("data-empty-archive", readError, "We could not read the archive just now. Please try again.");
  }

  if (!rows || rows.length === 0) {
    return { status: "success", message: `No deleted ${table.label.toLowerCase()} to remove.` };
  }

  let removed = 0;
  const blockedBy = new Set<string>();

  for (const row of rows) {
    const { error } = await supabase
      .from(table.name)
      .delete()
      .eq("id", row.id)
      .eq("organization_id", organizationId)
      .not("deleted_at", "is", null);

    if (!error) {
      removed += 1;
      continue;
    }

    // 23503 is a foreign key violation: something that is not itself deleted
    // still points at this row. Postgres names the table in `details`, which
    // is the one part of a database error worth showing somebody — the first
    // one that blocked it, not necessarily the only one, so clearing that
    // table and trying again can surface the next.
    if (error.code === "23503") {
      const referencing = /referenced from table "([^"]+)"/.exec(error.details ?? "")?.[1];
      blockedBy.add(referencing ? referencing.replace(/_/g, " ") : "other records");
      continue;
    }

    return failure("data-empty-archive", error, "We could not empty that section just now. Please try again.");
  }

  revalidatePath("/admin/data");
  revalidatePath("/admin/data/archive");
  revalidatePath("/admin/data/audit");

  const kept = rows.length - removed;
  if (kept === 0) {
    return {
      status: "success",
      message: `${removed} ${removed === 1 ? "record" : "records"} permanently deleted.`,
    };
  }

  // A partial sweep comes back as a warning, not a plain success: the screen
  // keeps the dialog open for one, so what was kept and why is read rather
  // than flashing past as the dialog closes.
  const holders = [...blockedBy].sort().join(", ");
  return {
    status: "success",
    message: `${removed} permanently deleted.`,
    warning:
      `${kept} ${kept === 1 ? "record was" : "records were"} kept — still referenced by ${holders}. ` +
      `Delete those first if you want these gone too.`,
  };
}
