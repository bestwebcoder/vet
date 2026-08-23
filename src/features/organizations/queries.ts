import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

/** Organization reads — practice identity, billing and quiet-hours settings each own their own screen. */

export type Result<T> = { status: "ok"; data: T } | { status: "error" };

export type Organization = {
  id: string;
  name: string;
  legalName: string | null;
  timezone: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  country: string;
  isActive: boolean;
  paymentInstructions: string | null;
  quietHoursStart: string | null;
  quietHoursEnd: string | null;
};

const ORGANIZATION_COLUMNS = `
  id, name, legal_name, timezone, email, phone, address, city, country, is_active,
  payment_instructions, quiet_hours_start, quiet_hours_end
`;

/* eslint-disable @typescript-eslint/no-explicit-any -- shaped by the select above */
function toOrganization(row: any): Organization {
  return {
    id: row.id,
    name: row.name,
    legalName: row.legal_name,
    timezone: row.timezone,
    email: row.email,
    phone: row.phone,
    address: row.address,
    city: row.city,
    country: row.country,
    isActive: row.is_active,
    paymentInstructions: row.payment_instructions,
    quietHoursStart: row.quiet_hours_start,
    quietHoursEnd: row.quiet_hours_end,
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export async function getOwnOrganization(organizationId: string): Promise<Result<Organization | null>> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("organizations")
    .select(ORGANIZATION_COLUMNS)
    .eq("id", organizationId)
    .maybeSingle();

  if (error) {
    console.error("[organizations] get failed", error);
    return { status: "error" };
  }

  return { status: "ok", data: data ? toOrganization(data) : null };
}

export type PublicOrganizationInfo = {
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
};

/**
 * For the signed-out front page (src/app/page.tsx) — reached before any
 * session exists, so it goes through the service role rather than the
 * RLS-scoped client. Only business contact info, the same fields a real
 * clinic would put on its own website; never clinical or financial data.
 * Mirrors default_organization_id()'s "the" organization resolution
 * (20260820000300_signup.sql): earliest created, active, not deleted.
 */
export async function getPublicOrganizationInfo(): Promise<PublicOrganizationInfo | null> {
  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from("organizations")
    .select("name, phone, email, address, city")
    .eq("is_active", true)
    .is("deleted_at", null)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("[organizations] public info failed", error);
    return null;
  }

  return data;
}
