/**
 * What a practice's data actually is, table by table.
 *
 * One catalogue, used by the snapshot, the health panel and the archive, so
 * "which rows belong to this practice" is answered in exactly one place. A
 * table missing from here is a table missing from every backup, which is why
 * tables.test.ts fails the build when a migration adds one that is neither
 * listed below nor deliberately excluded.
 *
 * Nothing here is a security boundary. Every read still goes through the
 * signed-in admin's client, so row level security decides what comes back —
 * this only decides what is *asked for*, and in what order.
 */

/** How a table's rows are tied back to one organization. */
export type TableScope =
  /** The organizations row itself, matched on `id`. */
  | { kind: "self" }
  /** Carries `organization_id` directly. */
  | { kind: "organization" }
  /**
   * Reached through a parent already in the archive: `parentColumn` is
   * collected as the parent is exported, and these rows are the ones whose
   * `column` matches. The parent must appear earlier in {@link DATA_TABLES}.
   */
  | { kind: "parent"; parent: TableName; column: string; parentColumn?: string }
  /**
   * Shared lookup data with no owner — species, breeds, medications. Exported
   * whole so an archive can be read without the database that produced it.
   */
  | { kind: "reference" };

export type TableGroup = "practice" | "people" | "clinical" | "financial" | "website" | "operations" | "reference";

export type DataTable = {
  name: TableName;
  /** Shown to an administrator. Sentence case, plural, no jargon. */
  label: string;
  group: TableGroup;
  scope: TableScope;
  /**
   * The primary key, used to order pages so a paged read is stable and to
   * count rows cheaply. Almost always "id" — appointment_statuses is keyed by
   * its slug, and assuming otherwise silently breaks every backup.
   */
  key?: string;
  /**
   * Count this table by counting distinct `column` in another table instead.
   *
   * An escape hatch for one case, and it should stay that way: `users` is
   * guarded by can_view_user(), a per-row SECURITY DEFINER predicate that
   * 20260919000100_rls_org_scope_cache.sql's InitPlan rewrite never reached.
   * An exact count evaluates it once per account in the database and exceeds
   * the statement timeout, however the query is narrowed first. Counting the
   * role grants instead answers the same question — how many people this
   * practice has accounts for — off a table that is cheap to read.
   */
  countVia?: { table: TableName; column: string };
  /**
   * Only written when the administrator asks for the activity history. These
   * are the tables that grow without bound and mean nothing on their own — an
   * ordinary snapshot is the practice's records, not its logs.
   */
  history?: true;
  /**
   * Appears on the Archive screen, where a soft-deleted row can be put back.
   * `column` is what identifies a record to a person reading the list.
   *
   * Deliberately narrower than "has a deleted_at": these are the records an
   * administrator removes by hand from a screen and might regret. Clinical
   * events are soft-deleted too, but they are removed as part of correcting a
   * visit, and reviving one in isolation would leave the visit inconsistent —
   * that belongs with the visit, not on a bulk restore screen.
   */
  archive?: { column: string };
  /**
   * Rows only. The file itself lives in Supabase Storage and is not in the
   * archive — said plainly in the UI rather than discovered at restore time.
   */
  metadataOnly?: true;
};

export type TableName =
  | "organizations"
  | "branches"
  | "roles"
  | "permissions"
  | "role_permissions"
  | "users"
  | "user_roles"
  | "staff"
  | "doctors"
  | "doctor_availability"
  | "clients"
  | "species"
  | "breeds"
  | "pets"
  | "service_categories"
  | "services"
  | "appointment_statuses"
  | "appointments"
  | "soap_records"
  | "diagnoses"
  | "diagnostics"
  | "documents"
  | "medications"
  | "prescriptions"
  | "prescription_items"
  | "vaccination_schedules"
  | "vaccinations"
  | "deworming_records"
  | "invoices"
  | "invoice_items"
  | "payments"
  | "refunds"
  | "notification_templates"
  | "notification_preferences"
  | "notifications"
  | "notification_logs"
  | "contact_messages"
  | "site_content"
  | "site_pages"
  | "site_page_blocks"
  | "nav_menu_items"
  | "page_section_items"
  | "organization_hero_images"
  | "audit_logs"
  | "data_exports"
  | "data_imports";

/**
 * Export order. Parents before children throughout, so an archive can be read
 * top to bottom and every foreign key it contains already points at something
 * the reader has seen.
 */
export const DATA_TABLES: DataTable[] = [
  // -- The practice ---------------------------------------------------------
  { name: "organizations", label: "Practice", group: "practice", scope: { kind: "self" } },
  { name: "branches", label: "Branches", group: "practice", scope: { kind: "organization" }, archive: { column: "name" } },

  // -- People --------------------------------------------------------------
  // Roles are no longer purely reference data — a practice defines its own —
  // but the scope stays "reference" because the table still holds the seven
  // system rows alongside them, and a snapshot read as the administrator
  // returns exactly the roles that administrator can see.
  { name: "roles", label: "Roles", group: "reference", scope: { kind: "reference" } },
  // Keyed by `key`, like every other catalogue in this application that names
  // its own rows rather than numbering them.
  { name: "permissions", label: "Permissions", group: "reference", scope: { kind: "reference" }, key: "key" },
  {
    name: "role_permissions",
    label: "Role permissions",
    group: "reference",
    // What a practice's own roles may do is practice data: restoring the roles
    // without it would restore their names and nothing they can do.
    scope: { kind: "parent", parent: "roles", parentColumn: "id", column: "role_id" },
    key: "role_id",
  },
  { name: "user_roles", label: "Role grants", group: "people", scope: { kind: "organization" } },
  {
    name: "users",
    label: "User accounts",
    group: "people",
    // Profiles carry no organization of their own; they belong to a practice
    // through the roles granted in it. Sign-in credentials live in auth.users
    // and are not readable here — an archive restores records, never logins.
    scope: { kind: "parent", parent: "user_roles", parentColumn: "user_id", column: "id" },
    countVia: { table: "user_roles", column: "user_id" },
  },
  { name: "staff", label: "Staff", group: "people", scope: { kind: "organization" } },
  { name: "doctors", label: "Doctors", group: "people", scope: { kind: "organization" } },
  { name: "doctor_availability", label: "Doctor availability", group: "people", scope: { kind: "organization" } },
  { name: "clients", label: "Clients", group: "people", scope: { kind: "organization" }, archive: { column: "full_name" } },

  // -- Patients ------------------------------------------------------------
  { name: "species", label: "Species", group: "reference", scope: { kind: "reference" } },
  { name: "breeds", label: "Breeds", group: "reference", scope: { kind: "reference" } },
  { name: "pets", label: "Patients", group: "clinical", scope: { kind: "organization" }, archive: { column: "name" } },

  // -- What the practice offers --------------------------------------------
  { name: "service_categories", label: "Service categories", group: "practice", scope: { kind: "organization" }, archive: { column: "name" } },
  { name: "services", label: "Services", group: "practice", scope: { kind: "organization" }, archive: { column: "name" } },

  // -- Visits --------------------------------------------------------------
  { name: "appointment_statuses", label: "Appointment statuses", group: "reference", scope: { kind: "reference" }, key: "slug" },
  { name: "appointments", label: "Appointments", group: "clinical", scope: { kind: "organization" } },
  { name: "soap_records", label: "SOAP records", group: "clinical", scope: { kind: "organization" } },
  { name: "diagnoses", label: "Diagnoses", group: "clinical", scope: { kind: "organization" } },
  { name: "diagnostics", label: "Diagnostics", group: "clinical", scope: { kind: "organization" } },
  {
    name: "documents",
    label: "Documents",
    group: "clinical",
    scope: { kind: "organization" },
    archive: { column: "file_name" },
    metadataOnly: true,
  },

  // -- Medicine ------------------------------------------------------------
  { name: "medications", label: "Medications", group: "reference", scope: { kind: "reference" } },
  { name: "prescriptions", label: "Prescriptions", group: "clinical", scope: { kind: "organization" } },
  {
    name: "prescription_items",
    label: "Prescription items",
    group: "clinical",
    scope: { kind: "parent", parent: "prescriptions", column: "prescription_id" },
  },
  { name: "vaccination_schedules", label: "Vaccination schedules", group: "clinical", scope: { kind: "organization" }, archive: { column: "vaccine_name" } },
  { name: "vaccinations", label: "Vaccinations", group: "clinical", scope: { kind: "organization" } },
  { name: "deworming_records", label: "Deworming records", group: "clinical", scope: { kind: "organization" } },

  // -- Money ---------------------------------------------------------------
  { name: "invoices", label: "Invoices", group: "financial", scope: { kind: "organization" } },
  {
    name: "invoice_items",
    label: "Invoice lines",
    group: "financial",
    scope: { kind: "parent", parent: "invoices", column: "invoice_id" },
  },
  { name: "payments", label: "Payments", group: "financial", scope: { kind: "organization" } },
  { name: "refunds", label: "Refunds", group: "financial", scope: { kind: "organization" } },

  // -- Talking to clients --------------------------------------------------
  { name: "notification_templates", label: "Notification templates", group: "operations", scope: { kind: "organization" } },
  {
    name: "notification_preferences",
    label: "Notification preferences",
    group: "operations",
    scope: { kind: "parent", parent: "users", column: "user_id" },
  },
  { name: "notifications", label: "Notifications", group: "operations", scope: { kind: "organization" } },
  {
    name: "notification_logs",
    label: "Notification delivery log",
    group: "operations",
    scope: { kind: "parent", parent: "notifications", column: "notification_id" },
    history: true,
  },
  { name: "contact_messages", label: "Enquiries", group: "operations", scope: { kind: "organization" } },

  // -- The public website --------------------------------------------------
  { name: "site_content", label: "Website content", group: "website", scope: { kind: "organization" } },
  { name: "site_pages", label: "Website pages", group: "website", scope: { kind: "organization" } },
  {
    name: "site_page_blocks",
    label: "Website page blocks",
    group: "website",
    scope: { kind: "parent", parent: "site_pages", column: "page_id" },
  },
  { name: "nav_menu_items", label: "Website menu", group: "website", scope: { kind: "organization" } },
  { name: "page_section_items", label: "Page sections", group: "website", scope: { kind: "organization" } },
  { name: "organization_hero_images", label: "Hero images", group: "website", scope: { kind: "organization" } },

  // -- History -------------------------------------------------------------
  { name: "audit_logs", label: "Audit log", group: "operations", scope: { kind: "organization" }, history: true },
  { name: "data_exports", label: "Export history", group: "operations", scope: { kind: "organization" }, history: true },
  { name: "data_imports", label: "Import history", group: "operations", scope: { kind: "organization" }, history: true },
];

/**
 * Tables kept out of every snapshot, and why.
 *
 * Written down rather than merely omitted: "why is this not in my backup" is a
 * question someone will ask at the worst possible moment, and the answer
 * should already exist.
 */
export const EXCLUDED_TABLES: Record<string, string> = {
  push_subscriptions:
    "Browser push endpoints and their encryption keys. They are credentials for one device, they expire on their own, and they mean nothing outside the browser that issued them.",
};

/**
 * The newest migration this build of the application was written against.
 *
 * Stamped into every snapshot's manifest so an archive says which shape of
 * schema produced it, and shown on the health screen — where it answers the
 * question a deploy that forgot `supabase db push` otherwise leaves open.
 * tables.test.ts keeps it honest.
 */
export const SCHEMA_VERSION = "20260930000200";

/** The column a table is keyed by. */
export function keyOf(table: DataTable): string {
  return table.key ?? "id";
}

export const TABLES_BY_NAME = new Map(DATA_TABLES.map((table) => [table.name, table]));

/** The tables a snapshot writes, given whether the activity history was asked for. */
export function tablesForExport(includeHistory: boolean): DataTable[] {
  return DATA_TABLES.filter((table) => includeHistory || !table.history);
}

/** Tables the Archive screen offers, in menu order. */
export type ArchivableTable = DataTable & { archive: { column: string } };

export function archivableTables(): ArchivableTable[] {
  return DATA_TABLES.filter((table): table is ArchivableTable => Boolean(table.archive));
}

export const GROUP_LABELS: Record<TableGroup, string> = {
  practice: "Practice",
  people: "People",
  clinical: "Clinical",
  financial: "Billing",
  website: "Website",
  operations: "Operations",
  reference: "Shared reference data",
};

/**
 * Tables the audit triggers in 20260820000200_rls_and_audit.sql actually write
 * for, so the audit filter offers no dead ends.
 *
 * Here rather than in queries.ts because the filter is a client component, and
 * this module — unlike queries.ts — pulls no server-only code with it.
 */
export const AUDITED_TABLES = [
  "organizations",
  "branches",
  "users",
  "user_roles",
  "doctors",
  "staff",
  "clients",
  "pets",
  "appointments",
  "soap_records",
  "prescriptions",
  "vaccinations",
  "deworming_records",
  "documents",
  "invoices",
  "payments",
  "refunds",
  "notifications",
  "data_exports",
  "data_imports",
  "auth.sessions",
] as const;

