"use server";

import { revalidatePath } from "next/cache";

import { getSessionUser } from "@/features/auth/session";
import { failure, invalid, text, type FormState } from "@/lib/forms";
import { createClient } from "@/lib/supabase/server";
import { vaccinationScheduleSchema, vaccinationScheduleToRow } from "@/lib/validation/vaccination-schedule";

/**
 * Vaccination schedule catalog writes — admin only, enforced by row level
 * security. §6.3: this is the one place the practice's vaccination
 * intervals live, so a doctor recording a vaccination is never guessing.
 */

function readScheduleForm(formData: FormData) {
  return {
    speciesId: text(formData, "speciesId") ?? "",
    vaccineName: text(formData, "vaccineName") ?? "",
    intervalValue: text(formData, "intervalValue") ?? "",
    intervalUnit: text(formData, "intervalUnit") ?? "",
    description: text(formData, "description") ?? "",
  };
}

export async function createScheduleAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const parsed = vaccinationScheduleSchema.safeParse(readScheduleForm(formData));
  if (!parsed.success) return invalid(parsed.error);

  const user = await getSessionUser();
  const organizationId = user?.organizationIds[0];
  if (!organizationId) return { status: "error", message: "Please sign in again." };

  const supabase = await createClient();
  const { error } = await supabase.from("vaccination_schedules").insert({
    ...vaccinationScheduleToRow(parsed.data),
    organization_id: organizationId,
  });

  if (error) {
    return failure("vaccination_schedules", error, "We could not save that schedule just now. Please try again.");
  }

  revalidatePath("/admin/vaccinations");
  return { status: "success", message: "Schedule added." };
}

export async function updateScheduleAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const scheduleId = text(formData, "scheduleId");
  if (!scheduleId) return { status: "error", message: "We could not tell which schedule to update." };

  const parsed = vaccinationScheduleSchema.safeParse(readScheduleForm(formData));
  if (!parsed.success) return invalid(parsed.error);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("vaccination_schedules")
    .update(vaccinationScheduleToRow(parsed.data))
    .eq("id", scheduleId)
    .select("id")
    .maybeSingle();

  if (error) {
    return failure("vaccination_schedules", error, "We could not save these changes just now. Please try again.");
  }
  if (!data) return { status: "error", message: "You do not have access to this schedule." };

  revalidatePath("/admin/vaccinations");
  return { status: "success", message: "Changes saved." };
}

export async function toggleScheduleActiveAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const scheduleId = text(formData, "scheduleId");
  const isActive = text(formData, "isActive") === "true";
  if (!scheduleId) return { status: "error", message: "We could not tell which schedule to update." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("vaccination_schedules")
    .update({ is_active: !isActive })
    .eq("id", scheduleId)
    .select("id")
    .maybeSingle();

  if (error) {
    return failure("vaccination_schedules", error, "We could not update that schedule just now. Please try again.");
  }
  if (!data) return { status: "error", message: "You do not have access to this schedule." };

  revalidatePath("/admin/vaccinations");
  return { status: "success", message: isActive ? "Schedule deactivated." : "Schedule reactivated." };
}

/**
 * Removes a schedule from the practice's list.
 *
 * A soft delete, like every other record an administrator removes by hand: it
 * sets `deleted_at`, both reads here already skip those rows, and the schedule
 * appears on the Archive screen, where it can be put back or — deliberately,
 * behind a typed confirmation — destroyed for good.
 *
 * Vaccinations already given are untouched. vaccinations.vaccination_schedule_id
 * is ON DELETE SET NULL and each record carries its own vaccine name and dates,
 * so a patient's history reads the same afterwards (CLAUDE.md §6). What stops
 * is the scheduling: nothing new is booked against a schedule that is gone.
 *
 * Deactivate is still the gentler option and keeps it in the list — this is
 * for the one entered by mistake.
 */
export async function deleteScheduleAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const scheduleId = text(formData, "scheduleId");
  if (!scheduleId) return { status: "error", message: "We could not tell which schedule to delete." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("vaccination_schedules")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", scheduleId)
    .is("deleted_at", null)
    .select("id")
    .maybeSingle();

  if (error) {
    return failure("vaccination_schedules", error, "We could not delete that schedule just now. Please try again.");
  }
  if (!data) return { status: "error", message: "You do not have access to this schedule." };

  revalidatePath("/admin/vaccinations");
  revalidatePath("/admin/data/archive");
  return { status: "success", message: "Schedule deleted." };
}
