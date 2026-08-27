import { formatCurrency } from "@/lib/currency";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * Service reads. Booking only ever needed name/duration (Phase 3); Phase 7
 * adds pricing and category so the same table now also drives billing.
 */

export type ServiceSummary = {
  id: string;
  name: string;
  description: string | null;
  durationMinutes: number;
  categoryId: string | null;
  categoryName: string | null;
  pricePaisa: number;
  price: string;
  taxRatePercent: number;
  isHomeVisitAvailable: boolean;
  isHomeVisitFee: boolean;
  requiresDoctor: boolean;
  isActive: boolean;
};

export type Result<T> = { status: "ok"; data: T } | { status: "error" };
export type PaginatedResult<T> =
  | { status: "ok"; data: T[]; totalCount: number; page: number; pageSize: number }
  | { status: "error" };

const SERVICE_COLUMNS = `
  id, name, description, duration_minutes, category_id, price_paisa, tax_rate_percent,
  is_home_visit_available, is_home_visit_fee, requires_doctor, is_active,
  category:category_id (name)
`;

type Related = { name: string } | { name: string }[] | null;
function one(value: Related) {
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

/* eslint-disable @typescript-eslint/no-explicit-any -- shaped by the select above */
function toSummary(row: any): ServiceSummary {
  const category = one(row.category);

  return {
    id: row.id,
    name: row.name,
    description: row.description,
    durationMinutes: row.duration_minutes,
    categoryId: row.category_id,
    categoryName: category?.name ?? null,
    pricePaisa: row.price_paisa,
    price: formatCurrency(row.price_paisa),
    taxRatePercent: Number(row.tax_rate_percent),
    isHomeVisitAvailable: row.is_home_visit_available,
    isHomeVisitFee: row.is_home_visit_fee,
    requiresDoctor: row.requires_doctor,
    isActive: row.is_active,
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/** Active services only — what booking and invoice item pickers offer. */
export async function listServices(): Promise<Result<ServiceSummary[]>> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("services")
    .select(SERVICE_COLUMNS)
    .eq("is_active", true)
    .is("deleted_at", null)
    .order("sort_order");

  if (error) {
    console.error("[services] list failed", error);
    return { status: "error" };
  }

  return { status: "ok", data: (data ?? []).map(toSummary) };
}

/** Every service, active or not — the admin catalog management screen. */
export async function listAllServices(): Promise<Result<ServiceSummary[]>> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("services")
    .select(SERVICE_COLUMNS)
    .is("deleted_at", null)
    .order("sort_order");

  if (error) {
    console.error("[services] list failed", error);
    return { status: "error" };
  }

  return { status: "ok", data: (data ?? []).map(toSummary) };
}

/**
 * One page of the service catalog, for the admin screen.
 *
 * Paged in Postgres rather than by slicing a full read: a practice's catalog
 * is one row per thing it charges for, which is not a bounded number — this
 * one already has 96. listAllServices() stays for the callers that genuinely
 * need every row at once, above all the category dropdown on this same page.
 */
export async function listServicesPage(
  options: { page?: number; pageSize?: number } = {},
): Promise<PaginatedResult<ServiceSummary>> {
  const supabase = await createClient();
  const page = Math.max(1, options.page ?? 1);
  const pageSize = options.pageSize ?? 25;
  const start = (page - 1) * pageSize;

  const { data, error, count } = await supabase
    .from("services")
    .select(SERVICE_COLUMNS, { count: "exact" })
    .is("deleted_at", null)
    .order("sort_order")
    .range(start, start + pageSize - 1);

  if (error) {
    console.error("[services] paged list failed", error);
    return { status: "error" };
  }

  return { status: "ok", data: (data ?? []).map(toSummary), totalCount: count ?? 0, page, pageSize };
}

export async function getService(serviceId: string): Promise<Result<ServiceSummary | null>> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("services")
    .select(SERVICE_COLUMNS)
    .eq("id", serviceId)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) {
    console.error("[services] get failed", error);
    return { status: "error" };
  }

  return { status: "ok", data: data ? toSummary(data) : null };
}

/**
 * The public Services page — reached before any session exists, so it
 * goes through the service role like every other public read. Real
 * prices, pulled from the same price_paisa every invoice already uses —
 * never a fabricated "starting from" figure (CLAUDE.md forbids hardcoding
 * prices, and this stays correct automatically if an admin changes one).
 * The home-visit fee is a billing surcharge, not a browsable service, so
 * it's excluded here the same way it's excluded from booking's service list.
 */
/**
 * The services shown on the public site.
 *
 * Scoped to the practice, which it was not. This goes through the service role
 * because the public pages are reached before any session exists and row level
 * security cannot scope them — and without an organization_id filter that
 * meant every practice in the database. Measured here: 1,578 services across
 * 201 organizations listed on the price list of a practice with 122 of its
 * own. Same fault as getPublicDoctors had.
 */
export async function getPublicServices(organizationId?: string): Promise<Result<ServiceSummary[]>> {
  const supabase = createServiceClient();

  let query = supabase
    .from("services")
    .select(SERVICE_COLUMNS)
    .eq("is_active", true)
    .eq("is_home_visit_fee", false)
    .is("deleted_at", null)
    .order("sort_order");

  if (organizationId) query = query.eq("organization_id", organizationId);

  const { data, error } = await query;

  if (error) {
    console.error("[services] public list failed", error);
    return { status: "error" };
  }

  return { status: "ok", data: (data ?? []).map(toSummary) };
}

/** The configured home-visit fee, if an admin has marked one — §7.3. */
export async function getHomeVisitFeeService(): Promise<Result<ServiceSummary | null>> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("services")
    .select(SERVICE_COLUMNS)
    .eq("is_home_visit_fee", true)
    .eq("is_active", true)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) {
    console.error("[services] home visit fee lookup failed", error);
    return { status: "error" };
  }

  return { status: "ok", data: data ? toSummary(data) : null };
}
