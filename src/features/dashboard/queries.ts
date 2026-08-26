import { createClient } from "@/lib/supabase/server";

/**
 * Dashboard data.
 *
 * Every number here comes from a real query under row level security. Figures
 * that depend on tables a later phase introduces are not estimated, mocked or
 * zero-filled — the card says it is not available yet. A dashboard that shows
 * a confident "0 vaccinations due" when no vaccination table exists is worse
 * than one that admits the gap.
 */

export type Metric =
  | { status: "ok"; value: number }
  | { status: "error" }
  /** The table behind this figure arrives in a later phase. */
  | { status: "pending"; phase: number };

type CountableTable = "clients" | "doctors" | "staff" | "branches" | "users";

async function count(table: CountableTable, apply?: (query: never) => unknown): Promise<Metric> {
  const supabase = await createClient();

  let query = supabase.from(table).select("*", { count: "exact", head: true }).is("deleted_at", null);

  if (apply) {
    query = apply(query as never) as typeof query;
  }

  const { count: value, error } = await query;

  if (error) {
    console.error(`[dashboard] count(${table}) failed`, error);
    return { status: "error" };
  }

  return { status: "ok", value: value ?? 0 };
}

export type AdminOverview = {
  clients: Metric;
  doctors: Metric;
  staff: Metric;
  branches: Metric;
};

export async function getAdminOverview(): Promise<AdminOverview> {
  const [clients, doctors, staff, branches] = await Promise.all([
    count("clients"),
    count("doctors"),
    count("staff"),
    count("branches"),
  ]);

  return { clients, doctors, staff, branches };
}

export type AdminRevenue = {
  todayRevenuePaisa: Metric;
  monthRevenuePaisa: Metric;
  outstandingBalancePaisa: Metric;
  unpaidInvoices: Metric;
};

const UNPAID_STATUSES = ["issued", "partially_paid"];

/** §7.7 — the admin dashboard's revenue cards, computed from payments/invoices, never estimated. */
export async function getAdminRevenue(): Promise<AdminRevenue> {
  const supabase = await createClient();

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const startOfMonth = new Date(startOfToday.getFullYear(), startOfToday.getMonth(), 1);

  const [todayResult, monthResult, outstandingResult, unpaidResult] = await Promise.all([
    supabase.from("payments").select("amount_paisa").gte("paid_at", startOfToday.toISOString()),
    supabase.from("payments").select("amount_paisa").gte("paid_at", startOfMonth.toISOString()),
    supabase.from("invoices").select("balance_paisa").in("status", UNPAID_STATUSES).is("deleted_at", null),
    supabase
      .from("invoices")
      .select("*", { count: "exact", head: true })
      .in("status", UNPAID_STATUSES)
      .is("deleted_at", null),
  ]);

  const sum = (rows: { amount_paisa?: number; balance_paisa?: number }[] | null, key: "amount_paisa" | "balance_paisa") =>
    (rows ?? []).reduce((total, row) => total + (row[key] ?? 0), 0);

  const todayRevenuePaisa: Metric = todayResult.error
    ? { status: "error" }
    : { status: "ok", value: sum(todayResult.data, "amount_paisa") };

  const monthRevenuePaisa: Metric = monthResult.error
    ? { status: "error" }
    : { status: "ok", value: sum(monthResult.data, "amount_paisa") };

  const outstandingBalancePaisa: Metric = outstandingResult.error
    ? { status: "error" }
    : { status: "ok", value: sum(outstandingResult.data, "balance_paisa") };

  const unpaidInvoices: Metric = unpaidResult.error
    ? { status: "error" }
    : { status: "ok", value: unpaidResult.count ?? 0 };

  return { todayRevenuePaisa, monthRevenuePaisa, outstandingBalancePaisa, unpaidInvoices };
}

export type AdminOperationalSummary = {
  newClients: Metric;
  newPatients: Metric;
  upcomingSurgeries: Metric;
  doctorsOnDutyToday: Metric;
};

const NOT_FINAL_STATUSES = ["completed", "cancelled", "no_show"];

/** §8.7 — the admin dashboard's remaining cards. */
export async function getAdminOperationalSummary(): Promise<AdminOperationalSummary> {
  const supabase = await createClient();

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const now = new Date();
  const todayWeekday = now.getDay();

  const [newClientsResult, newPatientsResult, surgeriesResult, availabilityResult] = await Promise.all([
    supabase.from("clients").select("*", { count: "exact", head: true }).is("deleted_at", null).gte("created_at", sevenDaysAgo),
    supabase.from("pets").select("*", { count: "exact", head: true }).is("deleted_at", null).gte("created_at", sevenDaysAgo),
    supabase
      .from("appointments")
      .select("*", { count: "exact", head: true })
      .eq("visit_type", "surgery")
      .not("status", "in", `(${NOT_FINAL_STATUSES.join(",")})`)
      .gte("starts_at", now.toISOString()),
    supabase
      .from("doctor_availability")
      .select("doctor_id")
      .eq("weekday", todayWeekday)
      .eq("is_active", true)
      .is("deleted_at", null),
  ]);

  const newClients: Metric = newClientsResult.error ? { status: "error" } : { status: "ok", value: newClientsResult.count ?? 0 };
  const newPatients: Metric = newPatientsResult.error ? { status: "error" } : { status: "ok", value: newPatientsResult.count ?? 0 };
  const upcomingSurgeries: Metric = surgeriesResult.error ? { status: "error" } : { status: "ok", value: surgeriesResult.count ?? 0 };
  const doctorsOnDutyToday: Metric = availabilityResult.error
    ? { status: "error" }
    : { status: "ok", value: new Set((availabilityResult.data ?? []).map((row) => row.doctor_id)).size };

  return { newClients, newPatients, upcomingSurgeries, doctorsOnDutyToday };
}

export type DoctorOverview = {
  clients: Metric;
  colleagues: Metric;
};

export async function getDoctorOverview(): Promise<DoctorOverview> {
  const [clients, colleagues] = await Promise.all([count("clients"), count("doctors")]);

  return { clients, colleagues };
}

export type ClientProfile = {
  status: "ok";
  fullName: string;
  phone: string;
  city: string | null;
  organizationName: string | null;
} | { status: "missing" } | { status: "error" };

/** The client's own record, which the signup trigger created. */
export async function getClientProfile(userId: string): Promise<ClientProfile> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("clients")
    .select("full_name, phone, city, organizations(name)")
    .eq("user_id", userId)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) {
    console.error("[dashboard] client profile failed", error);
    return { status: "error" };
  }

  if (!data) return { status: "missing" };

  const organization = Array.isArray(data.organizations)
    ? data.organizations[0]
    : data.organizations;

  return {
    status: "ok",
    fullName: data.full_name,
    phone: data.phone,
    city: data.city,
    organizationName: organization?.name ?? null,
  };
}

export type ActivityEntry = {
  id: string;
  action: string;
  createdAt: string;
};

export type RecentActivity =
  | { status: "ok"; entries: ActivityEntry[] }
  | { status: "error" };

/**
 * Audit trail, scoped by policy to the reader's own organization.
 */
/**
 * The dashboard's activity feed.
 *
 * Scoped to the practice explicitly, not left to row level security. The two
 * are not equivalent here: audit_logs' policy ends in
 * is_admin_of_user(entity_id), a function Postgres must call for every
 * candidate row, and without an organization_id predicate the planner has no
 * index to start from — so "the last 6 entries" became a sequential scan of
 * the whole audit log, evaluating that function all the way down it. Measured
 * at 12,324 rows: a seq scan over every one of them, against an index scan
 * touching 6 with the filter in place. It had started timing out
 * (`57014: canceling statement due to statement timeout`).
 *
 * Audit logs only ever grow, so this would not have recovered on its own.
 */
export async function getRecentActivity(organizationId: string, limit = 6): Promise<RecentActivity> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("audit_logs")
    .select("id, action, created_at")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("[dashboard] recent activity failed", error);
    return { status: "error" };
  }

  return {
    status: "ok",
    entries: (data ?? []).map((row) => ({
      id: row.id,
      action: row.action,
      createdAt: row.created_at,
    })),
  };
}

/** Turns an audit action such as `clients.insert` into something readable. */
export function describeAction(action: string): string {
  const readable: Record<string, string> = {
    "auth.login": "Signed in",
    "users.insert": "Account created",
    "users.update": "Account updated",
    "clients.insert": "Client added",
    "clients.update": "Client updated",
    "doctors.insert": "Doctor added",
    "doctors.update": "Doctor updated",
    "staff.insert": "Staff member added",
    "staff.update": "Staff member updated",
    "user_roles.insert": "Role granted",
    "user_roles.update": "Role changed",
    "branches.insert": "Branch added",
    "branches.update": "Branch updated",
    "organizations.update": "Organisation updated",
    "appointments.insert": "Appointment booked",
    "appointments.update": "Appointment updated",
    "services.insert": "Service added",
    "services.update": "Service updated",
    "doctor_availability.insert": "Availability window added",
    "doctor_availability.update": "Availability window updated",
    "soap_records.insert": "SOAP record started",
    "soap_records.update": "SOAP record updated",
    "diagnoses.insert": "Diagnosis recorded",
    "diagnostics.insert": "Diagnostic test ordered",
    "diagnostics.update": "Diagnostic test updated",
    "documents.insert": "Document uploaded",
    "documents.update": "Document updated",
    "prescriptions.insert": "Prescription started",
    "prescriptions.update": "Prescription updated",
    "prescription_items.insert": "Prescription item added",
    "prescription_items.update": "Prescription item updated",
    "vaccination_schedules.insert": "Vaccination schedule added",
    "vaccination_schedules.update": "Vaccination schedule updated",
    "vaccinations.insert": "Vaccination recorded",
    "vaccinations.update": "Vaccination updated",
    "deworming_records.insert": "Deworming recorded",
    "deworming_records.update": "Deworming updated",
    "service_categories.insert": "Service category added",
    "service_categories.update": "Service category updated",
    "invoices.insert": "Invoice created",
    "invoices.update": "Invoice updated",
    "payments.insert": "Payment recorded",
  };

  return readable[action] ?? action;
}
