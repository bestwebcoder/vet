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
export async function getRecentActivity(limit = 6): Promise<RecentActivity> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("audit_logs")
    .select("id, action, created_at")
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
