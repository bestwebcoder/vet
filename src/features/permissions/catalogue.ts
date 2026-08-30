/**
 * What a role can be allowed to do.
 *
 * This list is the contract between three things that must never drift apart:
 * the checkboxes on the Roles screen, the pages a person may reach, and the
 * row level security policies in Postgres that decide what they may actually
 * read and write. A key here that no policy consults is a checkbox that lies,
 * which in a system holding clinical records is worse than no checkbox at all.
 *
 * So the catalogue is code, mirrored into the `permissions` table by
 * 20260930000100_permissions.sql, and every key below is enforced by a policy
 * in 20260930000200_permission_policies.sql. Adding one means doing all three.
 *
 * Granularity is module × (view | manage). Per-table permissions would make a
 * sixty-row matrix nobody reads, and per-field ones a matrix nobody can keep
 * correct; a module is the unit a practice actually delegates — "she runs the
 * front desk", "he does the invoicing".
 */

export type PermissionAction = "view" | "manage";

export type PermissionModule = {
  key: string;
  label: string;
  /** What this module covers, in the words the practice would use. */
  description: string;
  /** Both actions unless a module is inherently read-only. */
  actions: PermissionAction[];
};

/**
 * The order here is the order on screen: patient-facing work first, money
 * second, the practice's own administration last.
 */
export const PERMISSION_MODULES: PermissionModule[] = [
  {
    key: "appointments",
    label: "Appointments",
    description: "The calendar, bookings, rescheduling and cancellations.",
    actions: ["view", "manage"],
  },
  {
    key: "clients",
    label: "Clients",
    description: "Pet owners and their contact details.",
    actions: ["view", "manage"],
  },
  {
    key: "patients",
    label: "Patients",
    description: "Animal records, their identity and their documents.",
    actions: ["view", "manage"],
  },
  {
    key: "clinical",
    label: "Clinical records",
    description:
      "Reading SOAP notes, diagnoses, prescriptions and test results. Writing them is the attending vet's — see below.",
    actions: ["view"],
  },
  {
    key: "preventive",
    label: "Vaccinations & deworming",
    description:
      "Seeing doses given and what falls due; managing covers the schedules behind them, not recording a dose.",
    actions: ["view", "manage"],
  },
  {
    key: "billing",
    label: "Billing",
    description: "Invoices, payments and refunds.",
    actions: ["view", "manage"],
  },
  {
    key: "services",
    label: "Services & medications",
    description: "The service list, its categories and prices, and the formulary.",
    actions: ["view", "manage"],
  },
  {
    key: "doctors",
    label: "Doctors",
    description: "Veterinarian profiles and their working hours.",
    actions: ["view", "manage"],
  },
  {
    key: "reports",
    label: "Reports",
    description: "Revenue, activity and clinical reporting across the practice.",
    actions: ["view"],
  },
  {
    key: "notifications",
    label: "Notifications & messages",
    description: "Reminder templates, what was sent, and enquiries from the website.",
    actions: ["view", "manage"],
  },
  {
    key: "website",
    label: "Website",
    description: "The public pages, their content and the menus that reach them.",
    actions: ["view", "manage"],
  },
  {
    key: "data",
    label: "Data & audit",
    description: "Backups, imports, the archive and the audit log.",
    actions: ["view", "manage"],
  },
  {
    key: "settings",
    label: "Practice settings",
    description: "The practice's own details and its branches.",
    actions: ["view", "manage"],
  },
  {
    key: "team",
    label: "Team",
    description:
      "Seeing who has a login and what role they hold. Granting roles and editing what a role may do stays with administrators — see below.",
    actions: ["view"],
  },
];

export type PermissionKey = string;

/** `module.action`, the form stored in the database and checked in policies. */
export function permissionKey(module: string, action: PermissionAction): PermissionKey {
  return `${module}.${action}`;
}

/** Every key in the catalogue, in screen order. */
export function allPermissionKeys(): PermissionKey[] {
  return PERMISSION_MODULES.flatMap((module) =>
    module.actions.map((action) => permissionKey(module.key, action)),
  );
}

/**
 * Managing implies viewing, always.
 *
 * Enforced when permissions are saved rather than left to whoever ticks the
 * boxes: a role that may edit an invoice but not read one is not a decision
 * anybody means to make, and the policies would enforce exactly that.
 */
export function withImpliedViews(keys: PermissionKey[]): PermissionKey[] {
  const result = new Set(keys);

  for (const key of keys) {
    const [module, action] = key.split(".");
    if (action === "manage") result.add(permissionKey(module, "view"));
  }

  return [...result];
}

/** Rejects anything not in the catalogue, so a tampered form cannot invent a key. */
export function isPermissionKey(value: string): value is PermissionKey {
  return allPermissionKeys().includes(value);
}

/**
 * Clinical authorship is not delegable either, and for a stronger reason.
 *
 * Writing a SOAP note, a prescription, a vaccination record or a diagnostic
 * result is a clinical act: it is the attending veterinarian's, and TV Care is
 * a record-management system, not a way to spread that responsibility around
 * (CLAUDE.md §11). The database has enforced this from the beginning — an
 * administrator cannot author a SOAP note today — so the matrix offers no
 * checkbox that would appear to change it. `clinical` is view-only above, and
 * `preventive.manage` covers the schedules, not the doses given against them.
 */
export const CLINICAL_AUTHORSHIP_IS_DOCTOR_ONLY = true;

/**
 * Role administration is deliberately not delegable.
 *
 * Any permission that lets someone grant roles is a permission that lets them
 * grant themselves every other one, so the matrix does not offer it: editing
 * roles, their permissions, and who holds them requires the built-in
 * Administrator role, enforced in row level security rather than here. `team`
 * is view-only above for the same reason.
 */
export const ROLE_ADMINISTRATION_IS_ADMIN_ONLY = true;
