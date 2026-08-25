import { getSessionUser } from "@/features/auth/session";
import type { Metric } from "@/features/dashboard/queries";
import { createClient } from "@/lib/supabase/server";
import type { VisitType } from "@/lib/validation/appointment";

/**
 * Appointment reads.
 *
 * One parametrized query powers every list this phase needs — the client's
 * own appointments, a doctor's day/week/month calendar, each of the doctor
 * dashboard's cards, and the admin queue — rather than one function per
 * screen. Every query runs under the caller's own row level security policy,
 * so no scope check is repeated here.
 */

const APPOINTMENT_COLUMNS = `
  id, organization_id, branch_id, client_id, pet_id, doctor_id, service_id,
  visit_type, status, starts_at, ends_at, reason, location, notes,
  cancelled_at, cancellation_reason, created_at,
  pet:pets (id, name, species:species_id (name)),
  client:clients (id, full_name, phone),
  doctor:doctors (id, user:user_id (full_name)),
  service:services (id, name, duration_minutes)
`;

type One<T> = T | T[] | null;
function one<T>(value: One<T>): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

export type AppointmentSummary = {
  id: string;
  organizationId: string;
  status: string;
  visitType: VisitType;
  startsAt: string;
  endsAt: string;
  reason: string | null;
  location: string | null;
  petId: string;
  petName: string;
  speciesName: string | null;
  clientId: string;
  clientName: string;
  clientPhone: string;
  doctorId: string;
  doctorName: string;
  serviceId: string;
  serviceName: string;
  cancelledAt: string | null;
  cancellationReason: string | null;
};

/* eslint-disable @typescript-eslint/no-explicit-any -- shaped by the select above */
function toSummary(row: any): AppointmentSummary {
  const pet = one<any>(row.pet);
  const species = pet ? one<any>(pet.species) : null;
  const client = one<any>(row.client);
  const doctor = one<any>(row.doctor);
  const doctorUser = doctor ? one<any>(doctor.user) : null;
  const service = one<any>(row.service);

  return {
    id: row.id,
    organizationId: row.organization_id,
    status: row.status,
    visitType: row.visit_type,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    reason: row.reason,
    location: row.location,
    petId: row.pet_id,
    petName: pet?.name ?? "Unknown patient",
    speciesName: species?.name ?? null,
    clientId: row.client_id,
    clientName: client?.full_name ?? "Unknown client",
    clientPhone: client?.phone ?? "",
    doctorId: row.doctor_id,
    doctorName: doctorUser?.full_name ?? "Unknown doctor",
    serviceId: row.service_id,
    serviceName: service?.name ?? "Unknown service",
    cancelledAt: row.cancelled_at,
    cancellationReason: row.cancellation_reason,
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export type Result<T> = { status: "ok"; data: T } | { status: "error" };
export type PaginatedResult<T> =
  | { status: "ok"; data: T[]; totalCount: number; page: number; pageSize: number }
  | { status: "error" };

export type AppointmentFilter = {
  clientId?: string;
  doctorId?: string;
  petId?: string;
  visitType?: string;
  /** Inclusive ISO instant lower bound on `starts_at`. */
  from?: string;
  /** Exclusive ISO instant upper bound on `starts_at`. */
  to?: string;
  statuses?: string[];
  /** Excludes cancelled/no-show unless explicitly asked for. */
  excludeStatuses?: string[];
  order?: "asc" | "desc";
  limit?: number;
};

export async function listAppointments(filter: AppointmentFilter = {}): Promise<Result<AppointmentSummary[]>> {
  const supabase = await createClient();

  let query = supabase
    .from("appointments")
    .select(APPOINTMENT_COLUMNS)
    .is("deleted_at", null)
    .order("starts_at", { ascending: (filter.order ?? "asc") === "asc" })
    .limit(filter.limit ?? 200);

  if (filter.clientId) query = query.eq("client_id", filter.clientId);
  if (filter.doctorId) query = query.eq("doctor_id", filter.doctorId);
  if (filter.petId) query = query.eq("pet_id", filter.petId);
  if (filter.visitType) query = query.eq("visit_type", filter.visitType);
  if (filter.from) query = query.gte("starts_at", filter.from);
  if (filter.to) query = query.lt("starts_at", filter.to);
  if (filter.statuses?.length) query = query.in("status", filter.statuses);
  if (filter.excludeStatuses?.length) query = query.not("status", "in", `(${filter.excludeStatuses.join(",")})`);

  const { data, error } = await query;

  if (error) {
    console.error("[appointments] list failed", error);
    return { status: "error" };
  }

  return { status: "ok", data: (data ?? []).map(toSummary) };
}

/**
 * The same filters as {@link listAppointments}, paginated with a count —
 * for a list too long to just cap and show, unlike every other caller of
 * listAppointments (a day, a week, one doctor's near-term queue), which stay
 * on the simple limit. `from`/`to` here are plain `yyyy-MM-dd` dates, not
 * the ISO instants listAppointments takes, converted to an inclusive range
 * on `starts_at`.
 */
export async function listAppointmentsPaginated(
  filter: Omit<AppointmentFilter, "from" | "to" | "limit"> & {
    from?: string;
    to?: string;
    page?: number;
    pageSize?: number;
  } = {},
): Promise<PaginatedResult<AppointmentSummary>> {
  const supabase = await createClient();
  const page = Math.max(1, filter.page ?? 1);
  const pageSize = filter.pageSize ?? 25;

  let query = supabase
    .from("appointments")
    .select(APPOINTMENT_COLUMNS, { count: "exact" })
    .is("deleted_at", null)
    .order("starts_at", { ascending: (filter.order ?? "desc") === "asc" });

  if (filter.clientId) query = query.eq("client_id", filter.clientId);
  if (filter.doctorId) query = query.eq("doctor_id", filter.doctorId);
  if (filter.petId) query = query.eq("pet_id", filter.petId);
  if (filter.visitType) query = query.eq("visit_type", filter.visitType);
  if (filter.from) query = query.gte("starts_at", filter.from);
  if (filter.to) query = query.lte("starts_at", `${filter.to}T23:59:59.999Z`);
  if (filter.statuses?.length) query = query.in("status", filter.statuses);
  if (filter.excludeStatuses?.length) query = query.not("status", "in", `(${filter.excludeStatuses.join(",")})`);

  const start = (page - 1) * pageSize;
  const { data, error, count } = await query.range(start, start + pageSize - 1);

  if (error) {
    console.error("[appointments] paginated list failed", error);
    return { status: "error" };
  }

  return { status: "ok", data: (data ?? []).map(toSummary), totalCount: count ?? 0, page, pageSize };
}

export async function getAppointment(appointmentId: string): Promise<Result<AppointmentSummary | null>> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("appointments")
    .select(APPOINTMENT_COLUMNS)
    .eq("id", appointmentId)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) {
    console.error("[appointments] get failed", error);
    return { status: "error" };
  }

  return { status: "ok", data: data ? toSummary(data) : null };
}

/** A cheap row count for a dashboard card, without fetching the joined rows. */
export async function countAppointments(filter: AppointmentFilter = {}): Promise<Metric> {
  const supabase = await createClient();

  let query = supabase.from("appointments").select("*", { count: "exact", head: true }).is("deleted_at", null);

  if (filter.clientId) query = query.eq("client_id", filter.clientId);
  if (filter.doctorId) query = query.eq("doctor_id", filter.doctorId);
  if (filter.petId) query = query.eq("pet_id", filter.petId);
  if (filter.visitType) query = query.eq("visit_type", filter.visitType);
  if (filter.from) query = query.gte("starts_at", filter.from);
  if (filter.to) query = query.lt("starts_at", filter.to);
  if (filter.statuses?.length) query = query.in("status", filter.statuses);
  if (filter.excludeStatuses?.length) query = query.not("status", "in", `(${filter.excludeStatuses.join(",")})`);

  const { count, error } = await query;

  if (error) {
    console.error("[appointments] count failed", error);
    return { status: "error" };
  }

  return { status: "ok", value: count ?? 0 };
}

/** The next appointment that has not started yet, for the client dashboard card. */
export async function getNextAppointmentForClient(clientId: string): Promise<Result<AppointmentSummary | null>> {
  const result = await listAppointments({
    clientId,
    from: new Date().toISOString(),
    excludeStatuses: ["cancelled", "no_show"],
    limit: 1,
  });

  if (result.status === "error") return result;
  return { status: "ok", data: result.data[0] ?? null };
}

/** Whether the signed-in client may still change this appointment themselves. */
export async function mayClientChangeAppointment(
  startsAt: string,
  organizationId: string,
): Promise<boolean> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("may_client_change_appointment", {
    p_starts_at: startsAt,
    p_organization_id: organizationId,
  });

  if (error) {
    console.error("[appointments] notice window check failed", error);
    return false;
  }

  return Boolean(data);
}

export type AppointmentStatus = {
  slug: string;
  name: string;
  description: string | null;
  colour: string;
  sortOrder: number;
  occupiesSlot: boolean;
  isFinal: boolean;
};

/** The seven statuses, in configured order — never hard-coded in a component. */
export async function listAppointmentStatuses(): Promise<AppointmentStatus[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("appointment_statuses")
    .select("slug, name, description, colour, sort_order, occupies_slot, is_final")
    .order("sort_order");

  if (error) {
    console.error("[appointments] status list failed", error);
    return [];
  }

  return (data ?? []).map((row) => ({
    slug: row.slug,
    name: row.name,
    description: row.description,
    colour: row.colour,
    sortOrder: row.sort_order,
    occupiesSlot: row.occupies_slot,
    isFinal: row.is_final,
  }));
}

export type AvailabilityWindow = {
  id: string;
  weekday: number;
  startsAt: string;
  endsAt: string;
  slotMinutes: number;
  visitType: string | null;
  branchId: string | null;
};

/** A doctor's configured availability windows, for the admin screen and the booking engine. */
export async function listAvailabilityForDoctor(doctorId: string): Promise<Result<AvailabilityWindow[]>> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("doctor_availability")
    .select("id, weekday, starts_at, ends_at, slot_minutes, visit_type, branch_id")
    .eq("doctor_id", doctorId)
    .eq("is_active", true)
    .is("deleted_at", null)
    .order("weekday")
    .order("starts_at");

  if (error) {
    console.error("[appointments] availability list failed", error);
    return { status: "error" };
  }

  return {
    status: "ok",
    data: (data ?? []).map((row) => ({
      id: row.id,
      weekday: row.weekday,
      startsAt: row.starts_at.slice(0, 5),
      endsAt: row.ends_at.slice(0, 5),
      slotMinutes: row.slot_minutes,
      visitType: row.visit_type,
      branchId: row.branch_id,
    })),
  };
}

/** The client record belonging to the signed-in person, scoped to appointment booking. */
export async function getOwnClientIdAndOrg(): Promise<{ clientId: string; organizationId: string } | null> {
  const user = await getSessionUser();
  if (!user) return null;

  const supabase = await createClient();
  const { data } = await supabase
    .from("clients")
    .select("id, organization_id")
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .maybeSingle();

  if (!data) return null;
  return { clientId: data.id, organizationId: data.organization_id };
}
