"use server";

import { revalidatePath } from "next/cache";

import { failure, text, type FormState } from "@/lib/forms";
import { createClient } from "@/lib/supabase/server";
import { optionalText } from "@/lib/validation/common";

/**
 * Admin-editable template content (§9.6 — "editable without a code
 * change"). Deactivating a template is the only removal path: content, like
 * everything else in this codebase, is never hard-deleted.
 */

export type Template = {
  id: string;
  type: string;
  channel: string;
  subjectTemplate: string | null;
  bodyTemplate: string;
  isActive: boolean;
};

export type Result<T> = { status: "ok"; data: T } | { status: "error" };

export async function getTemplates(organizationId: string): Promise<Result<Template[]>> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("notification_templates")
    .select("id, type, channel, subject_template, body_template, is_active")
    .eq("organization_id", organizationId)
    .order("type")
    .order("channel");

  if (error) {
    console.error("[notifications] templates read failed", error);
    return { status: "error" };
  }

  return {
    status: "ok",
    data: (data ?? []).map((row) => ({
      id: row.id,
      type: row.type,
      channel: row.channel,
      subjectTemplate: row.subject_template,
      bodyTemplate: row.body_template,
      isActive: row.is_active,
    })),
  };
}

export async function upsertTemplateAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const organizationId = text(formData, "organizationId");
  const type = text(formData, "type");
  const channel = text(formData, "channel");
  const bodyTemplate = text(formData, "bodyTemplate");

  if (!organizationId || !type || !channel || !bodyTemplate) {
    return { status: "error", message: "Fill in the template body before saving." };
  }

  const subjectTemplate = optionalText(200, "Subject").safeParse(text(formData, "subjectTemplate") ?? "");
  if (!subjectTemplate.success) {
    return { status: "error", message: "Keep the subject under 200 characters." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("notification_templates").upsert(
    {
      organization_id: organizationId,
      type,
      channel,
      subject_template: channel === "email" ? subjectTemplate.data : null,
      body_template: bodyTemplate,
      is_active: true,
    },
    { onConflict: "organization_id,type,channel" },
  );

  if (error) return failure("notifications", error, "We could not save that template just now. Please try again.");

  revalidatePath("/admin/notifications");
  return { status: "success", message: "Template saved." };
}

export async function setTemplateActiveAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const templateId = text(formData, "templateId");
  const isActive = text(formData, "isActive") === "true";
  if (!templateId) return { status: "error", message: "We could not tell which template to update." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("notification_templates")
    .update({ is_active: !isActive })
    .eq("id", templateId)
    .select("id")
    .maybeSingle();

  if (error) return failure("notifications", error, "We could not update that template just now. Please try again.");
  if (!data) return { status: "error", message: "You do not have access to this template." };

  revalidatePath("/admin/notifications");
  return { status: "success", message: isActive ? "Template deactivated." : "Template activated." };
}
