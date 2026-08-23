"use server";

import { revalidatePath } from "next/cache";

import { requireRole } from "@/features/auth/session";
import { describeHeroImageProblem, readHeroImage, uploadHeroImage } from "@/features/organizations/hero-image";
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

/** The public front page's hero image — the one image an admin controls (see the site-images bucket). */
export async function updateHeroImageAction(_previous: FormState, formData: FormData): Promise<FormState> {
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

  const uploaded = await uploadHeroImage(organizationId, file);
  if (!uploaded.ok) {
    return { status: "error", message: "We could not upload that image. Please try again." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("organizations")
    .update({ hero_image_path: uploaded.path })
    .eq("id", organizationId);

  if (error) {
    return failure("organizations", error, "We could not save the hero image just now. Please try again.");
  }

  revalidatePath("/admin/settings");
  revalidatePath("/");
  return { status: "success", message: "Hero image updated." };
}
