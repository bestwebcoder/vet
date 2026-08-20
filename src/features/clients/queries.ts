import { createClient } from "@/lib/supabase/server";
import { getSessionUser } from "@/features/auth/session";

/**
 * Client record reads, under the caller's own policies.
 */

export type ClientSummary = {
  id: string;
  fullName: string;
  phone: string;
  email: string | null;
  city: string | null;
  petCount: number;
};

export type ClientDetail = ClientSummary & {
  organizationId: string;
  userId: string | null;
  alternatePhone: string | null;
  address: string | null;
  notes: string | null;
  preferredBranchId: string | null;
};

export type Result<T> = { status: "ok"; data: T } | { status: "error" };

const CLIENT_COLUMNS = `
  id, user_id, organization_id, full_name, phone, alternate_phone, email,
  address, city, notes, preferred_branch_id,
  pets(count)
`;

/* eslint-disable @typescript-eslint/no-explicit-any -- shaped by the select above */
function toDetail(row: any): ClientDetail {
  return {
    id: row.id,
    userId: row.user_id,
    organizationId: row.organization_id,
    fullName: row.full_name,
    phone: row.phone,
    alternatePhone: row.alternate_phone,
    email: row.email,
    address: row.address,
    city: row.city,
    notes: row.notes,
    preferredBranchId: row.preferred_branch_id,
    petCount: row.pets?.[0]?.count ?? 0,
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/**
 * The client record belonging to the signed-in person, if they have one.
 *
 * A client account without a record is a real state: provisioning can fail
 * between creating the account and creating the record.
 */
export async function getOwnClientRecord(): Promise<Result<ClientDetail | null>> {
  const user = await getSessionUser();
  if (!user) return { status: "ok", data: null };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("clients")
    .select(CLIENT_COLUMNS)
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) {
    console.error("[clients] own record failed", error);
    return { status: "error" };
  }

  return { status: "ok", data: data ? toDetail(data) : null };
}

/**
 * Clients the caller may see, optionally narrowed by a search term.
 *
 * Matches name, phone or email. The phone is matched against the stored,
 * normalised form as well as what was typed, so searching "01712345678" finds
 * a record stored as "+8801712345678".
 */
export async function listClients(
  options: { search?: string; limit?: number } = {},
): Promise<Result<ClientDetail[]>> {
  const supabase = await createClient();

  let query = supabase
    .from("clients")
    .select(CLIENT_COLUMNS)
    .is("deleted_at", null)
    .order("full_name")
    .limit(options.limit ?? 50);

  const search = options.search?.trim();

  if (search) {
    const digits = search.replace(/[\s()-]/g, "");
    const normalised = digits.replace(/^(?:\+?880|0)/, "+880");
    const escaped = search.replace(/[%,()]/g, " ");

    query = query.or(
      [
        `full_name.ilike.%${escaped}%`,
        `email.ilike.%${escaped}%`,
        `phone.ilike.%${escaped}%`,
        ...(/^\+?\d+$/.test(digits) ? [`phone.ilike.%${normalised}%`] : []),
      ].join(","),
    );
  }

  const { data, error } = await query;

  if (error) {
    console.error("[clients] list failed", error);
    return { status: "error" };
  }

  return { status: "ok", data: (data ?? []).map(toDetail) };
}

export async function getClientRecord(clientId: string): Promise<Result<ClientDetail | null>> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("clients")
    .select(CLIENT_COLUMNS)
    .eq("id", clientId)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) {
    console.error("[clients] get failed", error);
    return { status: "error" };
  }

  return { status: "ok", data: data ? toDetail(data) : null };
}

/** Branches of the caller's organisation, for the preferred-branch selector. */
export async function listBranches(): Promise<{ id: string; name: string }[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("branches")
    .select("id, name")
    .eq("is_active", true)
    .is("deleted_at", null)
    .order("name");

  if (error) {
    console.error("[clients] branch list failed", error);
    return [];
  }

  return data ?? [];
}
