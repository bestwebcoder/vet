import { createClient } from "@/lib/supabase/server";

/**
 * Global search, first pass (§3.9) — client name, phone, pet name, microchip
 * number, patient ID, appointment ID. Doctor/admin only; each query runs
 * under the caller's own row level security policy, so results are already
 * scoped to their organisation and never include a record they may not see.
 */

export type SearchResults = {
  clients: { id: string; fullName: string; phone: string }[];
  pets: { id: string; name: string; ownerName: string }[];
  appointments: { id: string; startsAt: string; clientName: string; petName: string }[];
};

const EMPTY: SearchResults = { clients: [], pets: [], appointments: [] };

export async function globalSearch(term: string): Promise<SearchResults> {
  const trimmed = term.trim();
  if (!trimmed) return EMPTY;

  const escaped = trimmed.replace(/[%,()]/g, " ");
  const digits = trimmed.replace(/[\s()-]/g, "");
  const normalisedPhone = digits.replace(/^(?:\+?880|0)/, "+880");
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(trimmed);

  const supabase = await createClient();

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
    .select("id, name, microchip_number, client:clients (full_name)")
    .is("deleted_at", null)
    .or(
      [`name.ilike.%${escaped}%`, `microchip_number.ilike.%${escaped}%`, ...(isUuid ? [`id.eq.${trimmed}`] : [])].join(
        ",",
      ),
    )
    .limit(10);

  const appointmentsQuery = isUuid
    ? supabase
        .from("appointments")
        .select("id, starts_at, client:clients (full_name), pet:pets (name)")
        .eq("id", trimmed)
        .is("deleted_at", null)
        .limit(1)
    : null;

  const [clientsResult, petsResult, appointmentsResult] = await Promise.all([
    clientsQuery,
    petsQuery,
    appointmentsQuery,
  ]);

  if (clientsResult.error) console.error("[search] clients failed", clientsResult.error);
  if (petsResult.error) console.error("[search] pets failed", petsResult.error);
  if (appointmentsResult?.error) console.error("[search] appointments failed", appointmentsResult.error);

  type One<T> = T | T[] | null;
  const one = <T,>(value: One<T>): T | null => (Array.isArray(value) ? (value[0] ?? null) : value);

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
    appointments: (appointmentsResult?.data ?? []).map((row) => ({
      id: row.id,
      startsAt: row.starts_at,
      /* eslint-disable-next-line @typescript-eslint/no-explicit-any -- shaped by the select above */
      clientName: one<any>(row.client)?.full_name ?? "Unknown client",
      /* eslint-disable-next-line @typescript-eslint/no-explicit-any -- shaped by the select above */
      petName: one<any>(row.pet)?.name ?? "Unknown patient",
    })),
  };
}
