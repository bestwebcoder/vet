"use server";

import { revalidatePath } from "next/cache";

import { failure, invalid, text, type FormState } from "@/lib/forms";
import { createClient } from "@/lib/supabase/server";
import { clientSchema, clientToRow } from "@/lib/validation/client";

/**
 * Client record writes, for clinic staff. Row level security decides whether
 * the write is allowed; these actions shape it and translate failures.
 */

function readClientForm(formData: FormData) {
  return {
    fullName: text(formData, "fullName") ?? "",
    phone: text(formData, "phone") ?? "",
    alternatePhone: text(formData, "alternatePhone") ?? null,
    email: text(formData, "email") ?? null,
    preferredBranchId: text(formData, "preferredBranchId") ?? null,
    address: text(formData, "address") ?? "",
    city: text(formData, "city") ?? "",
    notes: text(formData, "notes") ?? "",
  };
}

function duplicatePhone(): FormState {
  return {
    status: "error",
    message: "A client with this phone number already exists at this practice.",
    fieldErrors: { phone: ["Already in use"] },
  };
}

export async function createClientAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = clientSchema.safeParse(readClientForm(formData));
  if (!parsed.success) return invalid(parsed.error);

  const organizationId = text(formData, "organizationId");
  if (!organizationId) {
    return { status: "error", message: "We could not tell which practice to add this client to." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("clients")
    .insert({ ...clientToRow(parsed.data), organization_id: organizationId })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") return duplicatePhone();
    return failure("clients", error, "We could not save this client just now. Please try again.");
  }

  revalidatePath("/admin/clients");
  revalidatePath("/doctor/patients");

  return { status: "success", message: `${parsed.data.fullName} has been added.`, id: data.id };
}

export async function updateClientAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const clientId = text(formData, "clientId");
  if (!clientId) return { status: "error", message: "We could not tell which client to update." };

  const parsed = clientSchema.safeParse(readClientForm(formData));
  if (!parsed.success) return invalid(parsed.error);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("clients")
    .update(clientToRow(parsed.data))
    .eq("id", clientId)
    .select("id")
    .maybeSingle();

  if (error) {
    if (error.code === "23505") return duplicatePhone();
    return failure("clients", error, "We could not save these changes just now. Please try again.");
  }

  if (!data) {
    return { status: "error", message: "You do not have access to this client." };
  }

  revalidatePath("/admin/clients");
  revalidatePath(`/admin/clients/${clientId}`);
  revalidatePath("/doctor/patients");

  return { status: "success", message: "Changes saved.", id: clientId };
}
