import { createHash } from "node:crypto";

import { rowsToCsv } from "@/lib/csv";
import { createZip, type ZipEntry } from "@/lib/zip";

import { fetchIn, fetchPaged, identity, type Client, type Row } from "./paged";
import {
  DATA_TABLES,
  EXCLUDED_TABLES,
  keyOf,
  SCHEMA_VERSION,
  tablesForExport,
  type DataTable,
  type TableName,
} from "./tables";

/**
 * Builds a practice's data snapshot.
 *
 * Every read goes through the client passed in — the signed-in administrator's
 * own, under the anon key — so row level security decides what reaches the
 * archive. That is the whole security design of this feature: a snapshot can
 * never contain a row its owner could not already open on screen, and a second
 * practice's records are not merely filtered out, they were never returned.
 *
 * Never call this with a service-role client. src/lib/supabase/service.ts says
 * why at greater length.
 */

/**
 * A ceiling on one archive, because it is built in memory before it is sent.
 * A practice this size needs a database-level dump, not a download button, and
 * being told so beats a request that dies without explanation.
 */
const MAX_ROWS = 500_000;

export class SnapshotTooLargeError extends Error {
  constructor() {
    super("This practice holds more data than a single download can carry.");
    this.name = "SnapshotTooLargeError";
  }
}

export type SnapshotTable = {
  name: TableName;
  label: string;
  rows: number;
  json: string;
  csv?: string;
  sha256: string;
  note?: string;
};

export type SnapshotManifest = {
  format: "tv-care-snapshot/1";
  schemaVersion: string;
  generatedAt: string;
  organization: { id: string; name: string; slug: string };
  exportedBy: { id: string; name: string; email: string };
  includesHistory: boolean;
  totals: { tables: number; rows: number };
  tables: SnapshotTable[];
  excluded: Record<string, string>;
  notes: string[];
};

export type Snapshot = {
  archive: Uint8Array;
  manifest: SnapshotManifest;
  /** sha-256 of manifest.json, which carries a digest for every other file. */
  checksum: string;
  fileName: string;
};

function sha256(data: Uint8Array | string): string {
  return createHash("sha256").update(data).digest("hex");
}

async function readTable(
  client: Client,
  table: DataTable,
  organizationId: string,
  collected: Map<TableName, Row[]>,
): Promise<Row[]> {
  switch (table.scope.kind) {
    case "self":
      return fetchPaged(client, table.name, "*", (query) => query.eq("id", organizationId), keyOf(table));
    case "organization":
      return fetchPaged(client, table.name, "*", (query) => query.eq("organization_id", organizationId), keyOf(table));
    case "reference":
      return fetchPaged(client, table.name, "*", identity, keyOf(table));
    case "parent": {
      const { parent, parentColumn = "id", column } = table.scope;
      const parentRows = collected.get(parent) ?? [];

      const ids = [
        ...new Set(
          parentRows
            .map((row) => row[parentColumn])
            .filter((value): value is string => typeof value === "string"),
        ),
      ];

      return ids.length === 0 ? [] : fetchIn(client, table.name, "*", column, ids, keyOf(table));
    }
  }
}

const NOTES = [
  "Every row here was read as the administrator who exported it, under row level security. Anything they could not see on screen is not in this file either.",
  "Document rows are the record of a file — name, type, size, who uploaded it — not the file itself. Uploaded files live in Supabase Storage and are backed up with it.",
  "Sign-in credentials are not included. They belong to Supabase Auth, which this application cannot read.",
  "Money is stored in paisa, as whole numbers. Divide by 100 for taka.",
  "Verify this archive by hashing manifest.json with sha-256 and comparing it to the checksum recorded against this export in Settings → Data.",
];

export async function buildSnapshot(
  client: Client,
  organization: { id: string; name: string; slug: string },
  exportedBy: { id: string; name: string; email: string },
  options: { includeHistory: boolean },
): Promise<Snapshot> {
  const generatedAt = new Date();
  const selected = tablesForExport(options.includeHistory);
  const collected = new Map<TableName, Row[]>();

  const entries: ZipEntry[] = [];
  const summaries: SnapshotTable[] = [];
  const encoder = new TextEncoder();
  let totalRows = 0;

  for (const table of selected) {
    const rows = await readTable(client, table, organization.id, collected);
    collected.set(table.name, rows);

    totalRows += rows.length;
    if (totalRows > MAX_ROWS) throw new SnapshotTooLargeError();

    const jsonPath = `json/${table.name}.json`;
    const json = encoder.encode(`${JSON.stringify(rows, null, 2)}\n`);
    entries.push({ name: jsonPath, data: json });

    const summary: SnapshotTable = {
      name: table.name,
      label: table.label,
      rows: rows.length,
      json: jsonPath,
      sha256: sha256(json),
    };

    // A CSV of nothing is a blank file with no columns, which reads as a
    // failure rather than as an empty table. The manifest already says zero.
    if (rows.length > 0) {
      const csvPath = `csv/${table.name}.csv`;
      entries.push({ name: csvPath, data: encoder.encode(rowsToCsv(Object.keys(rows[0]), rows)) });
      summary.csv = csvPath;
    }

    if (table.metadataOnly) summary.note = "File records only — the uploaded files are not in this archive.";

    summaries.push(summary);
  }

  const manifest: SnapshotManifest = {
    format: "tv-care-snapshot/1",
    schemaVersion: SCHEMA_VERSION,
    generatedAt: generatedAt.toISOString(),
    organization,
    exportedBy,
    includesHistory: options.includeHistory,
    totals: { tables: summaries.length, rows: totalRows },
    tables: summaries,
    excluded: EXCLUDED_TABLES,
    notes: NOTES,
  };

  const manifestJson = encoder.encode(`${JSON.stringify(manifest, null, 2)}\n`);
  const checksum = sha256(manifestJson);

  // First in the archive so a reader meets the contents before the contents.
  const archive = createZip([{ name: "manifest.json", data: manifestJson }, ...entries], generatedAt);

  return {
    archive,
    manifest,
    checksum,
    fileName: `${organization.slug || "practice"}-backup-${generatedAt.toISOString().slice(0, 10)}.zip`,
  };
}

/** Table count shown before an export runs, so the button is not a mystery. */
export function snapshotTableCount(includeHistory: boolean): number {
  return includeHistory ? DATA_TABLES.length : tablesForExport(false).length;
}
