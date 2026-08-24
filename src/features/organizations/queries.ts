import { publicEnv } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

/** Organization reads — practice identity, billing and quiet-hours settings each own their own screen. */

/**
 * A public-bucket object's URL is a deterministic string, not a signed
 * grant — no client/auth needed to build it, unlike every other storage
 * path in this app (which all resolve through a signed URL instead).
 *
 * The path itself never changes across re-uploads (upsert overwrites it in
 * place), so a `v` cache-buster tied to `updated_at` is required — without
 * it, browsers and the storage CDN keep serving the previous image after an
 * admin uploads a new one.
 */
function heroImagePublicUrl(path: string, updatedAt: string): string {
  return `${publicEnv().NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/site-images/${path}?v=${Date.parse(updatedAt)}`;
}

export type Result<T> = { status: "ok"; data: T } | { status: "error" };

export type Organization = {
  id: string;
  name: string;
  legalName: string | null;
  timezone: string;
  email: string | null;
  phone: string | null;
  whatsappNumber: string | null;
  address: string | null;
  city: string | null;
  country: string;
  isActive: boolean;
  paymentInstructions: string | null;
  quietHoursStart: string | null;
  quietHoursEnd: string | null;
  heroImagePath: string | null;
  heroImageUrl: string | null;
};

const ORGANIZATION_COLUMNS = `
  id, name, legal_name, timezone, email, phone, whatsapp_number, address, city, country, is_active,
  payment_instructions, quiet_hours_start, quiet_hours_end, hero_image_path, updated_at
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
    whatsappNumber: row.whatsapp_number,
    address: row.address,
    city: row.city,
    country: row.country,
    isActive: row.is_active,
    paymentInstructions: row.payment_instructions,
    quietHoursStart: row.quiet_hours_start,
    quietHoursEnd: row.quiet_hours_end,
    heroImagePath: row.hero_image_path,
    heroImageUrl: row.hero_image_path ? heroImagePublicUrl(row.hero_image_path, row.updated_at) : null,
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
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  whatsappNumber: string | null;
  address: string | null;
  city: string | null;
  heroImageUrl: string | null;
};

/**
 * For every signed-out public page — reached before any session exists, so
 * it goes through the service role rather than the RLS-scoped client. Only
 * business contact info and the hero image, the same things a real clinic
 * would put on its own website; never clinical or financial data. Mirrors
 * default_organization_id()'s "the" organization resolution
 * (20260820000300_signup.sql): earliest created, active, not deleted.
 */
export async function getPublicOrganizationInfo(): Promise<PublicOrganizationInfo | null> {
  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from("organizations")
    .select("id, name, phone, email, whatsapp_number, address, city, hero_image_path, updated_at")
    .eq("is_active", true)
    .is("deleted_at", null)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("[organizations] public info failed", error);
    return null;
  }

  if (!data) return null;

  return {
    id: data.id,
    name: data.name,
    phone: data.phone,
    email: data.email,
    whatsappNumber: data.whatsapp_number,
    address: data.address,
    city: data.city,
    heroImageUrl: data.hero_image_path ? heroImagePublicUrl(data.hero_image_path, data.updated_at) : null,
  };
}
