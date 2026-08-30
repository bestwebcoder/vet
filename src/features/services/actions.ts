"use server";

import { revalidatePath } from "next/cache";

import { getSessionUser } from "@/features/auth/session";
import { failure, invalid, text, type FormState } from "@/lib/forms";
import { createClient } from "@/lib/supabase/server";
import {
  servicePresentationSchema,
  servicePresentationToRow,
  serviceSchema,
  serviceToRow,
} from "@/lib/validation/service";

/**
 * Service catalog writes — admin only, enforced by row level security.
 * §7.3: the first admin CRUD this table has had; Phase 3 only ever read it.
 */

/**
 * Every screen that shows the catalogue: the admin list, the website editors
 * that let a page's blocks be reworded and reordered, and the public pages
 * those blocks render on. One function because the list had been copied to
 * five call sites and had already drifted — a deactivate refreshed the admin
 * list and left the public page showing the service.
 */
function revalidateCatalogue() {
  for (const path of [
    "/admin/services",
    "/admin/website/sections/services",
    "/admin/website/sections/training",
    "/services",
    "/training-education",
  ]) {
    revalidatePath(path);
  }
}

/**
 * The bullet list and the fee lines arrive as repeated fields — one input per
 * point, one pair per tier — so the browser posts them as parallel arrays.
 * Blank rows are dropped rather than rejected: an empty row at the end of a
 * list is somebody who stopped typing, not an error worth a red message.
 */
function readRepeated(formData: FormData, key: string): string[] {
  return formData
    .getAll(key)
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.trim());
}

function readServiceForm(formData: FormData) {
  const amounts = readRepeated(formData, "feeAmount");
  const qualifiers = readRepeated(formData, "feeQualifier");

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
    tagline: text(formData, "tagline") ?? "",
    inclusionsLabel: text(formData, "inclusionsLabel") ?? "",
    inclusions: readRepeated(formData, "inclusion").filter(Boolean),
    feeLabel: text(formData, "feeLabel") ?? "",
    feeTiers: amounts
      .map((amount, index) => ({ amount, qualifier: qualifiers[index] ?? "" }))
      .filter((tier) => tier.amount !== ""),
    feeNote: text(formData, "feeNote") ?? "",
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

  revalidateCatalogue();
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

  revalidateCatalogue();
  return { status: "success", message: "Changes saved." };
}

/**
 * Saves one service's block on the public pages — the website editor's half.
 *
 * Separate from updateServiceAction because it is a different question. That
 * one is the catalogue: what a booking costs, how long it takes, whether it
 * needs a doctor. This one is the block a prospective client reads, and it
 * writes only those columns — so an admin arranging the website cannot move a
 * price, and cannot blank one by saving a form that never carried it.
 */
export async function updateServicePresentationAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const serviceId = text(formData, "serviceId");
  if (!serviceId) return { status: "error", message: "We could not tell which service to update." };

  const parsed = servicePresentationSchema.safeParse(readServiceForm(formData));
  if (!parsed.success) return invalid(parsed.error);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("services")
    .update(servicePresentationToRow(parsed.data))
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

  revalidateCatalogue();
  return { status: "success", message: "Changes saved." };
}

/**
 * The order services read in, inside their category, on the public pages.
 *
 * One update per row rather than a single upsert: an upsert would have to
 * carry every not-null column of each row to satisfy the insert half of it,
 * which is how a reorder ends up rewriting a price. sort_order is the only
 * column touched here.
 */
export async function reorderServicesAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const raw = text(formData, "order");
  if (!raw) return { status: "error", message: "We could not tell the new order." };

  let orderedIds: unknown;
  try {
    orderedIds = JSON.parse(raw);
  } catch {
    return { status: "error", message: "We could not read the new order. Please try again." };
  }

  if (!Array.isArray(orderedIds) || !orderedIds.every((id) => typeof id === "string")) {
    return { status: "error", message: "We could not read the new order. Please try again." };
  }

  const supabase = await createClient();
  const results = await Promise.all(
    orderedIds.map((id, index) => supabase.from("services").update({ sort_order: index }).eq("id", id)),
  );

  const firstError = results.find((result) => result.error)?.error;
  if (firstError) {
    return failure("services", firstError, "We could not save that order just now. Please try again.");
  }

  revalidateCatalogue();
  return { status: "success" };
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

  revalidateCatalogue();
  return { status: "success", message: isActive ? "Service deactivated." : "Service reactivated." };
}

/**
 * Removes a service outright.
 *
 * Only ever when nothing has been booked against it. appointments.service_id
 * is ON DELETE RESTRICT, so the database would refuse anyway — this checks
 * first so an admin gets a sentence explaining why rather than a constraint
 * error, and is pointed at Deactivate, which is what they want for a service
 * the practice has stopped offering. Deleting is for the one added by mistake.
 *
 * Invoice lines are unaffected either way: invoice_items.service_id is
 * ON DELETE SET NULL and the line keeps its own copied description and price,
 * so billing history stays intact (CLAUDE.md §6).
 */
export async function deleteServiceAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const serviceId = text(formData, "serviceId");
  if (!serviceId) return { status: "error", message: "We could not tell which service to delete." };

  const supabase = await createClient();

  const { count, error: countError } = await supabase
    .from("appointments")
    .select("id", { count: "exact", head: true })
    .eq("service_id", serviceId);

  if (countError) {
    return failure("services", countError, "We could not check that service just now. Please try again.");
  }

  if ((count ?? 0) > 0) {
    return {
      status: "error",
      message:
        count === 1
          ? "This service is used by an appointment, so it cannot be deleted. Deactivate it instead — it stays on past records and stops being bookable."
          : `This service is used by ${count} appointments, so it cannot be deleted. Deactivate it instead — it stays on past records and stops being bookable.`,
    };
  }

  const { error } = await supabase.from("services").delete().eq("id", serviceId);

  if (error) {
    return failure("services", error, "We could not delete that service just now. Please try again.");
  }

  revalidateCatalogue();
  return { status: "success", message: "Service deleted." };
}
