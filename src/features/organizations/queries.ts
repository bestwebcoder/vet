import { MAX_HERO_IMAGES } from "@/features/organizations/hero-image";
import { publicEnv } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

/** Organization reads — practice identity, billing and quiet-hours settings each own their own screen. */

/**
 * A public-bucket object's URL is a deterministic string, not a signed
 * grant — no client/auth needed to build it, unlike every other storage
 * path in this app (which all resolve through a signed URL instead).
 *
 * `updatedAt`, when given, adds a cache-busting `v` param — needed for a
 * fixed path that gets overwritten in place (the logo), so browsers and the
 * storage CDN don't keep serving the old image. Hero gallery images each
 * get their own never-reused path (organizations/hero-image.ts), so they
 * don't need one.
 */
function siteImagePublicUrl(path: string, updatedAt?: string): string {
  const base = `${publicEnv().NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/site-images/${path}`;
  return updatedAt ? `${base}?v=${Date.parse(updatedAt)}` : base;
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
  logoPath: string | null;
  logoUrl: string | null;
};

const ORGANIZATION_COLUMNS = `
  id, name, legal_name, timezone, email, phone, whatsapp_number, address, city, country, is_active,
  payment_instructions, quiet_hours_start, quiet_hours_end, logo_path, updated_at
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
    logoPath: row.logo_path,
    logoUrl: row.logo_path ? siteImagePublicUrl(row.logo_path, row.updated_at) : null,
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

export type OrganizationHeroImage = { id: string; url: string; caption: string | null };

/** The front page hero carousel's slides, in upload order — the gallery an admin builds up from Settings. */
export async function getOrganizationHeroImages(organizationId: string): Promise<Result<OrganizationHeroImage[]>> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("organization_hero_images")
    .select("id, image_path, caption")
    .eq("organization_id", organizationId)
    .order("position", { ascending: true });

  if (error) {
    console.error("[organizations] hero images list failed", error);
    return { status: "error" };
  }

  return {
    status: "ok",
    data: (data ?? []).map((row) => ({ id: row.id, url: siteImagePublicUrl(row.image_path), caption: row.caption })),
  };
}

export type PublicOrganizationInfo = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  whatsappNumber: string | null;
  address: string | null;
  city: string | null;
  heroImages: { src: string; alt: string; caption: string | null }[];
  logoUrl: string | null;
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
    .select("id, name, phone, email, whatsapp_number, address, city, logo_path, updated_at")
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

  const { data: heroRows, error: heroError } = await supabase
    .from("organization_hero_images")
    .select("image_path, caption")
    .eq("organization_id", data.id)
    .order("position", { ascending: true })
    .limit(MAX_HERO_IMAGES);

  if (heroError) {
    console.error("[organizations] public hero images failed", heroError);
  }

  return {
    id: data.id,
    name: data.name,
    phone: data.phone,
    email: data.email,
    whatsappNumber: data.whatsapp_number,
    address: data.address,
    city: data.city,
    heroImages: (heroRows ?? []).map((row) => ({
      src: siteImagePublicUrl(row.image_path),
      alt: row.caption ?? "",
      caption: row.caption,
    })),
    logoUrl: data.logo_path ? siteImagePublicUrl(data.logo_path, data.updated_at) : null,
  };
}
