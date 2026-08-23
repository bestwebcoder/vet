"use server";

import { revalidatePath } from "next/cache";

import { requireRole } from "@/features/auth/session";
import { getPublicOrganizationInfo } from "@/features/organizations/queries";
import { failure, invalid, text, type FormState } from "@/lib/forms";
import { createClient } from "@/lib/supabase/server";
import { contactMessageSchema } from "@/lib/validation/contact";

/**
 * A signed-out visitor has no session, so this insert runs through the
 * plain client (anon role) exactly like every other public page's reads —
 * exercising the anon-only insert policy on contact_messages for real,
 * not bypassing it with the service role. organization_id is resolved
 * server-side (never trusted from the form) via the same lookup the front
 * page itself uses to find "the" organization.
 */
export async function submitContactMessageAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const parsed = contactMessageSchema.safeParse({
    name: text(formData, "name") ?? "",
    email: text(formData, "email") ?? "",
    phone: text(formData, "phone") ?? null,
    message: text(formData, "message") ?? "",
  });
  if (!parsed.success) return invalid(parsed.error);

  const organization = await getPublicOrganizationInfo();
  if (!organization) {
    return { status: "error", message: "We could not send your message just now. Please try again." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("contact_messages").insert({
    organization_id: organization.id,
    name: parsed.data.name,
    email: parsed.data.email,
    phone: parsed.data.phone,
    message: parsed.data.message,
  });

  if (error) {
    return failure("contact", error, "We could not send your message just now. Please try again.");
  }

  return { status: "success", message: "Thanks — we'll get back to you soon." };
}

export async function markContactMessageReadAction(_previous: FormState, formData: FormData): Promise<FormState> {
  await requireRole("admin", "super_admin");

  const messageId = text(formData, "messageId");
  if (!messageId) return { status: "error", message: "We could not tell which message to update." };

  const supabase = await createClient();
  const { error } = await supabase.from("contact_messages").update({ status: "read" }).eq("id", messageId);

  if (error) {
    return failure("contact", error, "We could not update that message just now. Please try again.");
  }

  revalidatePath("/admin/messages");
  return { status: "success" };
}
