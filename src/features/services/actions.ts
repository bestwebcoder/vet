"use server";

import { revalidatePath } from "next/cache";

import { getSessionUser } from "@/features/auth/session";
import { failure, invalid, text, type FormState } from "@/lib/forms";
import { createClient } from "@/lib/supabase/server";
import { serviceSchema, serviceToRow } from "@/lib/validation/service";

/**
 * Service catalog writes — admin only, enforced by row level security.
 * §7.3: the first admin CRUD this table has had; Phase 3 only ever read it.
 */

function readServiceForm(formData: FormData) {
  return {
    categoryId: text(formData, "categoryId") ?? "",
    name: text(formData, "name") ?? "",
    description: text(formData, "description") ?? "",
    durationMinutes: text(formData, "durationMinutes") ?? "",
    pricePaisa: text(formData, "pricePaisa") ?? "",
    taxRatePercent: text(formData, "taxRatePercent") ?? "",
    isHomeVisitAvailable: formData.get("isHomeVisitAvailable") === "on",
    isHomeVisitFee: formData.get("isHomeVisitFee") === "on",
    requiresDoctor: formData.get("requiresDoctor") === "on",
  };
}

export async function createServiceAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const parsed = serviceSchema.safeParse(readServiceForm(formData));
  if (!parsed.success) return invalid(parsed.error);

  const user = await getSessionUser();
  const organizationId = user?.organizationIds[0];
  if (!organizationId) return { status: "error", message: "Please sign in again." };

  const supabase = await createClient();
  const { error } = await supabase.from("services").insert({
    ...serviceToRow(parsed.data),
    organization_id: organizationId,
  });

  if (error) {
    if (error.code === "23505") {
      return { status: "error", message: "A service with this name already exists." };
    }
    return failure("services", error, "We could not save that service just now. Please try again.");
  }

  revalidatePath("/admin/services");
  return { status: "success", message: "Service added." };
}

export async function updateServiceAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const serviceId = text(formData, "serviceId");
  if (!serviceId) return { status: "error", message: "We could not tell which service to update." };

  const parsed = serviceSchema.safeParse(readServiceForm(formData));
  if (!parsed.success) return invalid(parsed.error);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("services")
    .update(serviceToRow(parsed.data))
    .eq("id", serviceId)
    .select("id")
    .maybeSingle();

  if (error) {
    if (error.code === "23505") {
      return { status: "error", message: "A service with this name already exists." };
    }
    return failure("services", error, "We could not save these changes just now. Please try again.");
  }
  if (!data) return { status: "error", message: "You do not have access to this service." };

  revalidatePath("/admin/services");
  return { status: "success", message: "Changes saved." };
}

export async function toggleServiceActiveAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const serviceId = text(formData, "serviceId");
  const isActive = text(formData, "isActive") === "true";
  if (!serviceId) return { status: "error", message: "We could not tell which service to update." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("services")
    .update({ is_active: !isActive })
    .eq("id", serviceId)
    .select("id")
    .maybeSingle();

  if (error) {
    return failure("services", error, "We could not update that service just now. Please try again.");
  }
  if (!data) return { status: "error", message: "You do not have access to this service." };

  revalidatePath("/admin/services");
  return { status: "success", message: isActive ? "Service deactivated." : "Service reactivated." };
}
