import { createClient } from "@/lib/supabase/server";

import { listStoredBackupIds } from "./backups";
import { fetchPaged } from "./paged";
import {
  archivableTables,
  DATA_TABLES,
  keyOf,
  SCHEMA_VERSION,
  TABLES_BY_NAME,
  type ArchivableTable,
  type DataTable,
  type TableGroup,
  type TableName,
} from "./tables";

/**
 * Reads for the Data screen.
 *
 * All of them go through the signed-in administrator's client, so a count on
 * this page is a count of what that person may actually see. Two administrators
 * of different practices reading the same screen get different numbers, and
 * that is the point.
 */

export type Result<T> = { status: "ok"; data: T } | { status: "error" };

// ---------------------------------------------------------------------------
// Health
// ---------------------------------------------------------------------------

export type TableHealth = {
  name: TableName;
  label: string;
  group: TableGroup;
  rows: number;
  /** Soft-deleted rows sitting in the archive. Undefined where there is no `deleted_at`. */
  archived?: number;
};

export type DatabaseHealth = {
  schemaVersion: string;
  tables: TableHealth[];
  totalRows: number;
  archivedRows: number;
  documents: { count: number; bytes: number };
};

/**
 * A PostgREST embed that reaches this table's `organization_id` through the
 * parents the catalogue already declares.
 *
 * Counting a child table without one means counting the whole table and
 * letting row level security judge every row — which, on `users`, means
 * evaluating can_view_user() once per account in the database and hitting the
 * statement timeout. An inner-joined embed narrows the rows first.
 *
 * Each hop names the foreign key column it travels, always, not only where
 * PostgREST would complain: user_roles points at users twice (`user_id` and
 * `granted_by`), so an unqualified embed is ambiguous, and a table that grows
 * a second link later would break a query that had been relying on there
 * being one.
 *
 *   users                     -> user_roles!user_id(organization_id)
 *   notification_preferences  -> users!user_id(user_roles!user_id(organization_id))
 */
function organizationEmbed(table: DataTable): { embed: string; column: string } | null {
  const hops: { name: string; via: string }[] = [];
  let current: DataTable = table;

  while (current.scope.kind === "parent") {
    const parent = TABLES_BY_NAME.get(current.scope.parent);
    if (!parent) return null;

    // The foreign key is on whichever side is not its own primary key.
    const { column, parentColumn = "id" } = current.scope;
    hops.push({ name: parent.name, via: column === keyOf(current) ? parentColumn : column });

    current = parent;
  }

  if (current.scope.kind !== "organization" || hops.length === 0) return null;

  // Built inside out: the innermost hop selects the column, each outer hop
  // wraps it.
  const embed = hops.reduceRight((inner, hop) => `${hop.name}!${hop.via}!inner(${inner})`, "organization_id");

  return { embed, column: `${hops.map((hop) => hop.name).join(".")}.organization_id` };
}

async function countRows(
  supabase: Awaited<ReturnType<typeof createClient>>,
  table: DataTable,
  organizationId: string,
  archivedOnly = false,
): Promise<number> {
  // A table whose own count is too expensive to ask for directly.
  if (table.countVia && !archivedOnly) {
    const rows = await fetchPaged(supabase, table.countVia.table, table.countVia.column, (query) =>
      query.eq("organization_id", organizationId),
    );

    return new Set(rows.map((row) => row[table.countVia!.column])).size;
  }

  const embed = organizationEmbed(table);
  const columns = embed ? `${keyOf(table)}, ${embed.embed}` : keyOf(table);

  let query = supabase.from(table.name).select(columns, { count: "exact", head: true });

  if (table.scope.kind === "organization") query = query.eq("organization_id", organizationId);
  if (table.scope.kind === "self") query = query.eq("id", organizationId);
  if (embed) query = query.eq(embed.column, organizationId);

  // Reference data — species, breeds, medications, roles — belongs to no
  // practice, so it is counted whole. Row level security still decides what
  // this administrator may see of it.

  query = archivedOnly ? query.not("deleted_at", "is", null) : query;

  const { count, error } = await query;
  if (error) throw new Error(`${table.name}: ${error.message || "count failed"}`);

  return count ?? 0;
}

export async function getDatabaseHealth(organizationId: string): Promise<Result<DatabaseHealth>> {
  const supabase = await createClient();
  const archived = new Map(archivableTables().map((table) => [table.name, table] as const));

  try {
    const tables = await Promise.all(
      DATA_TABLES.map(async (table): Promise<TableHealth> => {
        const [rows, archivedRows] = await Promise.all([
          countRows(supabase, table, organizationId),
          archived.has(table.name) ? countRows(supabase, table, organizationId, true) : Promise.resolve(undefined),
        ]);

        return { name: table.name, label: table.label, group: table.group, rows, archived: archivedRows };
      }),
    );

    // Summed here rather than in Postgres: there is no aggregate over PostgREST
    // without an RPC, and a practice's document count is in the thousands, not
    // the millions.
    const documents = await fetchPaged(supabase, "documents", "size_bytes", (query) =>
      query.eq("organization_id", organizationId).is("deleted_at", null),
    );

    return {
      status: "ok",
      data: {
        schemaVersion: SCHEMA_VERSION,
        tables,
        totalRows: tables.reduce((total, table) => total + table.rows, 0),
        archivedRows: tables.reduce((total, table) => total + (table.archived ?? 0), 0),
        documents: {
          count: documents.length,
          bytes: documents.reduce((total, row) => total + (Number(row.size_bytes) || 0), 0),
        },
      },
    };
  } catch (error) {
    console.error("[data] health failed", error);
    return { status: "error" };
  }
}

// ---------------------------------------------------------------------------
// History
// ---------------------------------------------------------------------------

export type ExportRecord = {
  id: string;
  createdAt: string;
  actorName: string;
  tableCount: number;
  rowCount: number;
  byteSize: number;
  checksum: string;
  includedAudit: boolean;
  /**
   * Whether the archive itself is still kept and can be downloaded again.
   * False for the backups taken before archives were stored, and for any whose
   * file an administrator has since deleted.
   */
  isStored: boolean;
};

export type ImportRecord = {
  id: string;
  createdAt: string;
  actorName: string;
  target: string;
  fileName: string;
  rowsTotal: number;
  rowsImported: number;
  rowsSkipped: number;
  rowsFailed: number;
};

export type DataHistory = {
  exports: ExportRecord[];
  imports: ImportRecord[];
  /**
   * Days since the last snapshot, or null if there has never been one. Drives
   * the reminder — a backup nobody takes is not a backup.
   */
  daysSinceExport: number | null;
};

/** After this long without a snapshot, the screen starts asking for one. */
export const EXPORT_REMINDER_DAYS = 30;

function actorNameOf(row: Record<string, unknown>): string {
  const user = row.users as { full_name?: string } | null | undefined;
  return user?.full_name ?? "A removed account";
}

export async function getDataHistory(organizationId: string, limit = 20): Promise<Result<DataHistory>> {
  const supabase = await createClient();

  const [exports, imports, storedIds] = await Promise.all([
    supabase
      .from("data_exports")
      .select("id, created_at, tables, row_count, byte_size, checksum, included_audit, users:actor_user_id (full_name)")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false })
      .limit(limit),
    supabase
      .from("data_imports")
      .select(
        "id, created_at, target, file_name, rows_total, rows_imported, rows_skipped, rows_failed, users:actor_user_id (full_name)",
      )
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false })
      .limit(limit),
    listStoredBackupIds(supabase, organizationId),
  ]);

  if (exports.error || imports.error) {
    console.error("[data] history failed", exports.error ?? imports.error);
    return { status: "error" };
  }

  const exportRecords: ExportRecord[] = (exports.data ?? []).map((row) => ({
    id: row.id,
    createdAt: row.created_at,
    actorName: actorNameOf(row),
    tableCount: Array.isArray(row.tables) ? row.tables.length : 0,
    rowCount: row.row_count,
    byteSize: Number(row.byte_size),
    checksum: row.checksum,
    includedAudit: row.included_audit,
    isStored: storedIds.has(row.id),
  }));

  const latest = exportRecords[0];
  const daysSinceExport = latest
    ? Math.floor((Date.now() - new Date(latest.createdAt).getTime()) / 86_400_000)
    : null;

  return {
    status: "ok",
    data: {
      exports: exportRecords,
      imports: (imports.data ?? []).map((row) => ({
        id: row.id,
        createdAt: row.created_at,
        actorName: actorNameOf(row),
        target: TABLES_BY_NAME.get(row.target as TableName)?.label ?? row.target,
        fileName: row.file_name,
        rowsTotal: row.rows_total,
        rowsImported: row.rows_imported,
        rowsSkipped: row.rows_skipped,
        rowsFailed: row.rows_failed,
      })),
      daysSinceExport,
    },
  };
}

// ---------------------------------------------------------------------------
// Audit log
// ---------------------------------------------------------------------------

export type AuditEntry = {
  id: string;
  createdAt: string;
  actorName: string | null;
  action: string;
  entityTable: string | null;
  entityId: string | null;
  /** Changed fields, for an update. Empty for an insert. */
  changes: { field: string; from: string; to: string }[];
};

export type AuditFilters = {
  entityTable?: string;
  actorUserId?: string;
  from?: string;
  to?: string;
  page?: number;
};

export const AUDIT_PAGE_SIZE = 50;

function summarize(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "string") return value.length > 80 ? `${value.slice(0, 79)}…` : value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value).slice(0, 80);
}

export async function getAuditLog(
  organizationId: string,
  filters: AuditFilters = {},
): Promise<Result<{ entries: AuditEntry[]; total: number; page: number; pageSize: number }>> {
  const supabase = await createClient();
  const page = Math.max(1, filters.page ?? 1);
  const from = (page - 1) * AUDIT_PAGE_SIZE;

  let query = supabase
    .from("audit_logs")
    .select("id, created_at, action, entity_table, entity_id, metadata, users:actor_user_id (full_name)", {
      count: "exact",
    })
    .eq("organization_id", organizationId);

  if (filters.entityTable) query = query.eq("entity_table", filters.entityTable);
  if (filters.actorUserId) query = query.eq("actor_user_id", filters.actorUserId);
  if (filters.from) query = query.gte("created_at", `${filters.from}T00:00:00Z`);
  // Inclusive of the whole closing day, which is what a person picking a date
  // on a filter means by it.
  if (filters.to) query = query.lte("created_at", `${filters.to}T23:59:59.999Z`);

  const { data, error, count } = await query
    .order("created_at", { ascending: false })
    .range(from, from + AUDIT_PAGE_SIZE - 1);

  if (error) {
    console.error("[data] audit log failed", error);
    return { status: "error" };
  }

  return {
    status: "ok",
    data: {
      total: count ?? 0,
      page,
      pageSize: AUDIT_PAGE_SIZE,
      entries: (data ?? []).map((row) => {
        const metadata = (row.metadata ?? {}) as Record<string, { from?: unknown; to?: unknown }>;

        return {
          id: row.id,
          createdAt: row.created_at,
          actorName: (row.users as { full_name?: string } | null)?.full_name ?? null,
          action: row.action,
          entityTable: row.entity_table,
          entityId: row.entity_id,
          changes: Object.entries(metadata)
            .filter(([, change]) => change && typeof change === "object" && "to" in change)
            .map(([field, change]) => ({
              field,
              from: summarize(change.from),
              to: summarize(change.to),
            })),
        };
      }),
    },
  };
}

/** People who have ever appeared as an actor here, for the filter. */
export async function getAuditActors(organizationId: string): Promise<Result<{ id: string; name: string }[]>> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("users")
    .select("id, full_name, user_roles!inner (organization_id)")
    .eq("user_roles.organization_id", organizationId)
    .is("deleted_at", null)
    .order("full_name");

  if (error) {
    console.error("[data] audit actors failed", error);
    return { status: "error" };
  }

  const seen = new Set<string>();
  const actors: { id: string; name: string }[] = [];

  for (const row of data ?? []) {
    if (seen.has(row.id)) continue;
    seen.add(row.id);
    actors.push({ id: row.id, name: row.full_name });
  }

  return { status: "ok", data: actors };
}

// ---------------------------------------------------------------------------
// Archive
// ---------------------------------------------------------------------------

export type ArchivedRecord = {
  id: string;
  label: string;
  deletedAt: string;
};

export type ArchiveSection = {
  table: TableName;
  label: string;
  records: ArchivedRecord[];
};

/**
 * Everything soft-deleted that an administrator can put back.
 *
 * Capped per table: the archive is a place to recover a mistake made this
 * week, not a second copy of the database to browse. Anything older than the
 * cap is still in the snapshot, which is where a real recovery starts.
 */
export const ARCHIVE_LIMIT = 100;

export async function getArchive(organizationId: string): Promise<Result<ArchiveSection[]>> {
  const supabase = await createClient();

  try {
    const sections = await Promise.all(
      archivableTables().map(async (table: ArchivableTable): Promise<ArchiveSection> => {
        // Typed as string rather than a template literal so supabase-js does
        // not try to parse a column list it cannot know until runtime.
        const columns: string = `id, deleted_at, ${table.archive.column}`;

        const { data, error } = await supabase
          .from(table.name)
          .select(columns)
          .eq("organization_id", organizationId)
          .not("deleted_at", "is", null)
          .order("deleted_at", { ascending: false })
          .limit(ARCHIVE_LIMIT)
          // A runtime column list gives supabase-js nothing to infer a row
          // shape from, so it is named here instead.
          .returns<Record<string, unknown>[]>();

        if (error) throw new Error(`${table.name}: ${error.message}`);

        return {
          table: table.name,
          label: table.label,
          records: (data ?? []).map((row) => ({
            id: String(row.id),
            label: String(row[table.archive.column] ?? "(unnamed)"),
            deletedAt: String(row.deleted_at),
          })),
        };
      }),
    );

    return { status: "ok", data: sections };
  } catch (error) {
    console.error("[data] archive failed", error);
    return { status: "error" };
  }
}
