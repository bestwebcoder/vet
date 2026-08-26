"use server";

import { revalidatePath } from "next/cache";

import { requireRole } from "@/features/auth/session";
import {
  describeHeroImageProblem,
  MAX_HERO_CAPTION_LENGTH,
  MAX_HERO_IMAGES,
  readHeroImage,
  removeHeroImageObject,
  uploadHeroImage,
} from "@/features/organizations/hero-image";
import { describeLogoImageProblem, readLogoImage, uploadLogoImage } from "@/features/organizations/logo-image";
import { failure, invalid, text, type FormState } from "@/lib/forms";
import { createClient } from "@/lib/supabase/server";
import { optionalText, optionalTime } from "@/lib/validation/common";
import { organizationSettingsSchema } from "@/lib/validation/organization";

/**
 * §7.5's "payment information" on the invoice PDF — a single admin-editable
 * field, kept separate from the general Settings screen (Phase 10) below
 * since it lives on the billing page, not Settings.
 */

export async function updatePaymentInstructionsAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const organizationId = text(formData, "organizationId");
  if (!organizationId) return { status: "error", message: "We could not tell which practice this is for." };

  const paymentInstructions = optionalText(1000, "Payment instructions").safeParse(
    text(formData, "paymentInstructions") ?? "",
  );
  if (!paymentInstructions.success) {
    return { status: "error", message: "Keep payment instructions under 1000 characters." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("organizations")
    .update({ payment_instructions: paymentInstructions.data })
    .eq("id", organizationId);

  if (error) {
    return failure("organizations", error, "We could not save that just now. Please try again.");
  }

  revalidatePath("/admin/billing");
  return { status: "success", message: "Payment instructions saved." };
}

/**
 * §9.4's "practice-level defaults" — quiet hours defer sms/whatsapp/push
 * sends until the window ends; email is never deferred. Either bound left
 * blank disables quiet hours entirely.
 */
export async function updateQuietHoursAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const organizationId = text(formData, "organizationId");
  if (!organizationId) return { status: "error", message: "We could not tell which practice this is for." };

  const start = optionalTime("Start time").safeParse(text(formData, "quietHoursStart") ?? "");
  const end = optionalTime("End time").safeParse(text(formData, "quietHoursEnd") ?? "");
  if (!start.success || !end.success) {
    return { status: "error", message: "Choose valid start and end times, or leave both blank." };
  }
  if ((start.data === null) !== (end.data === null)) {
    return { status: "error", message: "Set both a start and an end time, or leave both blank." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("organizations")
    .update({ quiet_hours_start: start.data, quiet_hours_end: end.data })
    .eq("id", organizationId);

  if (error) {
    return failure("organizations", error, "We could not save quiet hours just now. Please try again.");
  }

  revalidatePath("/admin/notifications");
  return { status: "success", message: start.data ? "Quiet hours saved." : "Quiet hours disabled." };
}

/** §10's general practice settings — identity fields only; billing and quiet hours keep their own screens. */
export async function updateOrganizationSettingsAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const user = await requireRole("admin", "super_admin");
  const organizationId = user.organizationIds[0];
  if (!organizationId) return { status: "error", message: "Your account is not linked to a practice yet." };

  const parsed = organizationSettingsSchema.safeParse({
    name: text(formData, "name") ?? "",
    legalName: text(formData, "legalName") ?? null,
    timezone: text(formData, "timezone") ?? "",
    email: text(formData, "email") ?? null,
    phone: text(formData, "phone") ?? null,
    whatsappNumber: text(formData, "whatsappNumber") ?? null,
    address: text(formData, "address") ?? null,
    city: text(formData, "city") ?? null,
    country: text(formData, "country") ?? "",
  });
  if (!parsed.success) return invalid(parsed.error);

  const supabase = await createClient();
  const { error } = await supabase
    .from("organizations")
    .update({
      name: parsed.data.name,
      legal_name: parsed.data.legalName,
      timezone: parsed.data.timezone,
      email: parsed.data.email,
      phone: parsed.data.phone,
      whatsapp_number: parsed.data.whatsappNumber,
      address: parsed.data.address,
      city: parsed.data.city,
      country: parsed.data.country,
    })
    .eq("id", organizationId);

  if (error) {
    return failure("organizations", error, "We could not save these settings just now. Please try again.");
  }

  revalidatePath("/admin/settings");
  return { status: "success", message: "Settings saved." };
}

/** Adds one slide to the public front page's hero carousel (see the site-images bucket and organization_hero_images). */
export async function addHeroImageAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const user = await requireRole("admin", "super_admin");
  const organizationId = user.organizationIds[0];
  if (!organizationId) return { status: "error", message: "Your account is not linked to a practice yet." };

  const file = readHeroImage(formData);
  if (!file) {
    return { status: "error", message: "Choose an image to upload.", fieldErrors: { heroImage: ["Required"] } };
  }

  const problem = describeHeroImageProblem(file);
  if (problem) {
    return { status: "error", message: problem, fieldErrors: { heroImage: [problem] } };
  }

  const supabase = await createClient();

  const { count } = await supabase
    .from("organization_hero_images")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", organizationId);

  if ((count ?? 0) >= MAX_HERO_IMAGES) {
    return { status: "error", message: `You can have at most ${MAX_HERO_IMAGES} hero images. Remove one first.` };
  }

  const uploaded = await uploadHeroImage(organizationId, file);
  if (!uploaded.ok) {
    return { status: "error", message: "We could not upload that image. Please try again." };
  }

  const { error } = await supabase
    .from("organization_hero_images")
    .insert({ organization_id: organizationId, image_path: uploaded.path, position: count ?? 0 });

  if (error) {
    return failure("organizations", error, "We could not save that image just now. Please try again.");
  }

  revalidatePath("/admin/settings");
  revalidatePath("/");
  return { status: "success", message: "Hero image added." };
}

/** Removes one slide from the front page's hero carousel. */
export async function deleteHeroImageAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const user = await requireRole("admin", "super_admin");
  const organizationId = user.organizationIds[0];
  if (!organizationId) return { status: "error", message: "Your account is not linked to a practice yet." };

  const heroImageId = text(formData, "heroImageId");
  if (!heroImageId) return { status: "error", message: "We could not tell which image to remove." };

  const supabase = await createClient();

  const { data: existing, error: fetchError } = await supabase
    .from("organization_hero_images")
    .select("image_path")
    .eq("id", heroImageId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (fetchError || !existing) {
    return failure("organizations", fetchError, "We could not find that image.");
  }

  const { error } = await supabase.from("organization_hero_images").delete().eq("id", heroImageId);

  if (error) {
    return failure("organizations", error, "We could not remove that image just now. Please try again.");
  }

  await removeHeroImageObject(existing.image_path);

  revalidatePath("/admin/settings");
  revalidatePath("/");
  return { status: "success", message: "Hero image removed." };
}

/** The short line shown over one hero slide in the public carousel — optional, blank clears it. */
export async function updateHeroImageCaptionAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const user = await requireRole("admin", "super_admin");
  const organizationId = user.organizationIds[0];
  if (!organizationId) return { status: "error", message: "Your account is not linked to a practice yet." };

  const heroImageId = text(formData, "heroImageId");
  if (!heroImageId) return { status: "error", message: "We could not tell which image to update." };

  const parsed = optionalText(MAX_HERO_CAPTION_LENGTH, "Caption").safeParse(text(formData, "caption") ?? "");
  if (!parsed.success) return invalid(parsed.error);

  const supabase = await createClient();
  const { error } = await supabase
    .from("organization_hero_images")
    .update({ caption: parsed.data })
    .eq("id", heroImageId)
    .eq("organization_id", organizationId);

  if (error) {
    return failure("organizations", error, "We could not save that caption just now. Please try again.");
  }

  revalidatePath("/admin/settings");
  revalidatePath("/");
  return { status: "success", message: "Caption saved." };
}

/** The practice logo shown in the site header on every public page — see the site-images bucket. */
export async function updateLogoImageAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const user = await requireRole("admin", "super_admin");
  const organizationId = user.organizationIds[0];
  if (!organizationId) return { status: "error", message: "Your account is not linked to a practice yet." };

  const file = readLogoImage(formData);
  if (!file) {
    return { status: "error", message: "Choose an image to upload.", fieldErrors: { logoImage: ["Required"] } };
  }

  const problem = describeLogoImageProblem(file);
  if (problem) {
    return { status: "error", message: problem, fieldErrors: { logoImage: [problem] } };
  }

  const uploaded = await uploadLogoImage(organizationId, file);
  if (!uploaded.ok) {
    return { status: "error", message: "We could not upload that image. Please try again." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("organizations")
    .update({ logo_path: uploaded.path })
    .eq("id", organizationId);

  if (error) {
    return failure("organizations", error, "We could not save the logo just now. Please try again.");
  }

  revalidatePath("/admin/settings");
  // Shown in the header of every public page, not just Home — each fetches
  // its own organization data independently, so each needs its own revalidate.
  for (const path of ["/", "/about", "/services", "/contact", "/doctors"]) {
    revalidatePath(path);
  }
  return { status: "success", message: "Logo updated." };
}
