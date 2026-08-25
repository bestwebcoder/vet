import { formatCurrency } from "@/lib/currency";
import { createClient } from "@/lib/supabase/server";

/**
 * Global search (§3.9) — client name, phone, pet name, microchip number,
 * doctor name, appointment/invoice/payment reference, and date.
 *
 * "Intelligent" here means reading the shape of the term rather than
 * treating every search the same way:
 *   - a UUID matches a record by id directly (appointment/invoice/pet),
 *   - a Bangladesh phone number (in any of the usual typed forms) is
 *     normalised before matching a client's phone,
 *   - a `yyyy-MM-dd` date (what a `<input type="date">` submits, and what
 *     someone pastes from a receipt) matches appointments/invoices/payments
 *     that happened on that day,
 *   - anything else is a name/reference substring match.
 * Client and pet name matches are resolved once, up front, and reused to
 * pull in the appointments/invoices/payments that belong to them — PostgREST
 * can filter a plain column with `ilike`, but not a joined table's column in
 * the same request, so this is the same two-step shape pets/queries.ts
 * already uses for its own owner-aware search.
 *
 * Each query runs under the caller's own row level security policy, so
 * results are already scoped to their organisation and never include a
 * record they may not see — a doctor's own search never surfaces a client
 * or invoice the doctors_select/invoices_select policies would not already
 * let them read directly.
 */

export type SearchResults = {
  clients: { id: string; fullName: string; phone: string }[];
  pets: { id: string; name: string; ownerName: string }[];
  doctors: { id: string; fullName: string; specialization: string | null }[];
  appointments: { id: string; startsAt: string; clientName: string; petName: string; status: string }[];
  invoices: { id: string; invoiceNumber: string; status: string; clientName: string }[];
  payments: { id: string; invoiceId: string; invoiceNumber: string | null; clientName: string | null; amount: string; paidAt: string }[];
};

const EMPTY: SearchResults = { clients: [], pets: [], doctors: [], appointments: [], invoices: [], payments: [] };

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

type One<T> = T | T[] | null;
function one<T>(value: One<T>): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

export async function globalSearch(term: string): Promise<SearchResults> {
  const trimmed = term.trim();
  if (!trimmed) return EMPTY;

  const escaped = trimmed.replace(/[%,()]/g, " ");
  const digits = trimmed.replace(/[\s()-]/g, "");
  const normalisedPhone = digits.replace(/^(?:\+?880|0)/, "+880");
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(trimmed);
  const isDate = DATE_PATTERN.test(trimmed);
  const dayEnd = isDate ? `${trimmed}T23:59:59.999Z` : null;

  const supabase = await createClient();

  // Resolved first so appointments/invoices/payments can be matched by
  // owner name too, not just their own columns.
  const [clientsForLookup, petsForLookup] = await Promise.all([
    supabase
      .from("clients")
      .select("id")
      .is("deleted_at", null)
      .or(
        [
          `full_name.ilike.%${escaped}%`,
          `phone.ilike.%${escaped}%`,
          ...(/^\+?\d+$/.test(digits) ? [`phone.ilike.%${normalisedPhone}%`] : []),
        ].join(","),
      )
      .limit(25),
    supabase
      .from("pets")
      .select("id")
      .is("deleted_at", null)
      .or([`name.ilike.%${escaped}%`, `microchip_number.ilike.%${escaped}%`].join(","))
      .limit(25),
  ]);

  const clientIds = (clientsForLookup.data ?? []).map((row) => row.id);
  const petIds = (petsForLookup.data ?? []).map((row) => row.id);

  const clientsQuery = supabase
    .from("clients")
    .select("id, full_name, phone")
    .is("deleted_at", null)
    .or(
      [
        `full_name.ilike.%${escaped}%`,
        `phone.ilike.%${escaped}%`,
        ...(/^\+?\d+$/.test(digits) ? [`phone.ilike.%${normalisedPhone}%`] : []),
      ].join(","),
    )
    .limit(10);

  const petsQuery = supabase
    .from("pets")
    .select("id, name, client:clients (full_name)")
    .is("deleted_at", null)
    .or([`name.ilike.%${escaped}%`, `microchip_number.ilike.%${escaped}%`, ...(isUuid ? [`id.eq.${trimmed}`] : [])].join(","))
    .limit(10);

  // Doctors are catalog-scale (a practice has tens, not thousands), so this
  // fetches the org's doctors once and matches in memory — simpler and just
  // as correct as a two-step id lookup, and avoids PostgREST's
  // can't-ilike-a-joined-column limit for the doctor's own name.
  const doctorsQuery = supabase
    .from("doctors")
    .select("id, specialization, registration_number, user:user_id (full_name, email, phone)")
    .is("deleted_at", null);

  const appointmentConditions = [
    ...(isUuid ? [`id.eq.${trimmed}`] : []),
    ...(clientIds.length ? [`client_id.in.(${clientIds.join(",")})`] : []),
    ...(petIds.length ? [`pet_id.in.(${petIds.join(",")})`] : []),
  ];
  const appointmentsQuery =
    appointmentConditions.length > 0
      ? supabase
          .from("appointments")
          .select("id, starts_at, status, client:clients (full_name), pet:pets (name)")
          .is("deleted_at", null)
          .or(appointmentConditions.join(","))
          .order("starts_at", { ascending: false })
          .limit(10)
      : isDate
        ? supabase
            .from("appointments")
            .select("id, starts_at, status, client:clients (full_name), pet:pets (name)")
            .is("deleted_at", null)
            .gte("starts_at", trimmed)
            .lte("starts_at", dayEnd!)
            .order("starts_at", { ascending: false })
            .limit(10)
        : null;

  const invoiceConditions = [
    `invoice_number.ilike.%${escaped}%`,
    ...(isUuid ? [`id.eq.${trimmed}`] : []),
    ...(clientIds.length ? [`client_id.in.(${clientIds.join(",")})`] : []),
  ];
  const invoicesQuery = supabase
    .from("invoices")
    .select("id, invoice_number, status, client:clients (full_name)")
    .is("deleted_at", null)
    .or(invoiceConditions.join(","))
    .order("created_at", { ascending: false })
    .limit(10);

  const [clientsResult, petsResult, doctorsResult, appointmentsResult, invoicesResult] = await Promise.all([
    clientsQuery,
    petsQuery,
    doctorsQuery,
    appointmentsQuery,
    invoicesQuery,
  ]);

  if (clientsResult.error) console.error("[search] clients failed", clientsResult.error);
  if (petsResult.error) console.error("[search] pets failed", petsResult.error);
  if (doctorsResult.error) console.error("[search] doctors failed", doctorsResult.error);
  if (appointmentsResult?.error) console.error("[search] appointments failed", appointmentsResult.error);
  if (invoicesResult.error) console.error("[search] invoices failed", invoicesResult.error);

  // Payments match their own reference number, the invoice they belong to
  // (already found above), or — for a date — being paid that day.
  const invoiceIds = (invoicesResult.data ?? []).map((row) => row.id);
  const paymentConditions = [
    `reference_number.ilike.%${escaped}%`,
    ...(invoiceIds.length ? [`invoice_id.in.(${invoiceIds.join(",")})`] : []),
  ];
  const paymentsQuery = isDate
    ? supabase
        .from("payments")
        .select("id, invoice_id, amount_paisa, paid_at, invoice:invoices (invoice_number, client:clients (full_name))")
        .gte("paid_at", trimmed)
        .lte("paid_at", dayEnd!)
        .order("paid_at", { ascending: false })
        .limit(10)
    : supabase
        .from("payments")
        .select("id, invoice_id, amount_paisa, paid_at, invoice:invoices (invoice_number, client:clients (full_name))")
        .or(paymentConditions.join(","))
        .order("paid_at", { ascending: false })
        .limit(10);

  const paymentsResult = await paymentsQuery;
  if (paymentsResult.error) console.error("[search] payments failed", paymentsResult.error);

  const doctors = (doctorsResult.data ?? [])
    .map((row) => {
      /* eslint-disable-next-line @typescript-eslint/no-explicit-any -- shaped by the select above */
      const user = one<any>(row.user);
      return {
        id: row.id,
        fullName: user?.full_name ?? "Unknown doctor",
        email: (user?.email as string | undefined) ?? "",
        phone: (user?.phone as string | undefined) ?? "",
        specialization: row.specialization as string | null,
        registrationNumber: row.registration_number as string | null,
      };
    })
    .filter((doctor) => {
      const haystack = `${doctor.fullName} ${doctor.email} ${doctor.phone} ${doctor.specialization ?? ""} ${doctor.registrationNumber ?? ""}`.toLowerCase();
      return haystack.includes(trimmed.toLowerCase());
    })
    .slice(0, 10)
    .map((doctor) => ({ id: doctor.id, fullName: doctor.fullName, specialization: doctor.specialization }));

  return {
    clients: (clientsResult.data ?? []).map((row) => ({
      id: row.id,
      fullName: row.full_name,
      phone: row.phone,
    })),
    pets: (petsResult.data ?? []).map((row) => ({
      id: row.id,
      name: row.name,
      /* eslint-disable-next-line @typescript-eslint/no-explicit-any -- shaped by the select above */
      ownerName: one<any>(row.client)?.full_name ?? "Unknown owner",
    })),
    doctors,
    appointments: (appointmentsResult?.data ?? []).map((row) => ({
      id: row.id,
      startsAt: row.starts_at,
      status: row.status,
      /* eslint-disable-next-line @typescript-eslint/no-explicit-any -- shaped by the select above */
      clientName: one<any>(row.client)?.full_name ?? "Unknown client",
      /* eslint-disable-next-line @typescript-eslint/no-explicit-any -- shaped by the select above */
      petName: one<any>(row.pet)?.name ?? "Unknown patient",
    })),
    invoices: (invoicesResult.data ?? []).map((row) => ({
      id: row.id,
      invoiceNumber: row.invoice_number,
      status: row.status,
      /* eslint-disable-next-line @typescript-eslint/no-explicit-any -- shaped by the select above */
      clientName: one<any>(row.client)?.full_name ?? "Unknown client",
    })),
    payments: (paymentsResult.data ?? []).map((row) => {
      /* eslint-disable @typescript-eslint/no-explicit-any -- shaped by the select above */
      const invoice = one<any>(row.invoice);
      const client = invoice ? one<any>(invoice.client) : null;
      /* eslint-enable @typescript-eslint/no-explicit-any */
      return {
        id: row.id,
        invoiceId: row.invoice_id,
        invoiceNumber: invoice?.invoice_number ?? null,
        clientName: client?.full_name ?? null,
        amount: formatCurrency(row.amount_paisa),
        paidAt: row.paid_at,
      };
    }),
  };
}
