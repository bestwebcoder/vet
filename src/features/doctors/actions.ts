"use server";

import { revalidatePath } from "next/cache";

import { requireRole } from "@/features/auth/session";
import { countDoctorHistory, getOwnDoctorRecord } from "@/features/doctors/queries";
import { describeDoctorPhotoProblem, readDoctorPhoto, uploadDoctorPhoto } from "@/features/doctors/photo";
import { describeSignatureProblem, readSignature, uploadDoctorSignature } from "@/features/doctors/signature";
import { failure, invalid, text, type FormState } from "@/lib/forms";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { inviteDoctorSchema, updateDoctorProfileSchema } from "@/lib/validation/doctor";
import { adminUpdateIdentitySchema } from "@/lib/validation/profile";

/** A doctor uploads their own signature image, reused on every prescription after. */
export async function updateSignatureAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const file = readSignature(formData);
  if (!file) {
    return { status: "error", message: "Choose an image to upload.", fieldErrors: { signature: ["Required"] } };
  }

  const problem = describeSignatureProblem(file);
  if (problem) {
    return { status: "error", message: problem, fieldErrors: { signature: [problem] } };
  }

  const doctor = await getOwnDoctorRecord();
  if (doctor.status !== "ok" || !doctor.data) {
    return { status: "error", message: "Your doctor record could not be found." };
  }

  const uploaded = await uploadDoctorSignature(doctor.data.id, file);
  if (!uploaded.ok) {
    return { status: "error", message: "We could not upload that image. Please try again." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("doctors")
    .update({ signature_url: uploaded.path })
    .eq("id", doctor.data.id);

  if (error) {
    return failure("doctors", error, "We could not save your signature just now. Please try again.");
  }

  revalidatePath("/doctor/prescriptions");

  return { status: "success", message: "Signature saved." };
}

/**
 * §10's doctor management. Inviting is a real Supabase Auth invite — the
 * service role is used for that one call only (auth.users has no other way
 * in for an admin); the resulting user_roles/doctors rows are then written
 * through the admin's own RLS-scoped session like every other write here.
 */
export async function inviteDoctorAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const user = await requireRole("admin", "super_admin");
  const organizationId = user.organizationIds[0];
  if (!organizationId) return { status: "error", message: "Your account is not linked to a practice yet." };

  const parsed = inviteDoctorSchema.safeParse({
    fullName: text(formData, "fullName") ?? "",
    email: text(formData, "email") ?? "",
    phone: text(formData, "phone") ?? null,
    primaryBranchId: text(formData, "primaryBranchId") ?? null,
    registrationNumber: text(formData, "registrationNumber") ?? null,
    specialization: text(formData, "specialization") ?? null,
    qualifications: text(formData, "qualifications") ?? null,
  });
  if (!parsed.success) return invalid(parsed.error);

  const serviceClient = createServiceClient();
  const { data: invited, error: inviteError } = await serviceClient.auth.admin.inviteUserByEmail(parsed.data.email, {
    data: { full_name: parsed.data.fullName, phone: parsed.data.phone },
  });

  if (inviteError) {
    if (inviteError.code === "email_exists") {
      return {
        status: "error",
        message: "An account with this email already exists.",
        fieldErrors: { email: ["Already in use"] },
      };
    }
    return failure("doctors", inviteError, "We could not send that invitation just now. Please try again.");
  }

  const supabase = await createClient();
  const { data: role } = await supabase.from("roles").select("id").eq("slug", "doctor").single();
  if (!role) return { status: "error", message: "The doctor role is not configured for this practice." };

  const { error: roleError } = await supabase
    .from("user_roles")
    .insert({ user_id: invited.user.id, role_id: role.id, organization_id: organizationId });
  if (roleError) return failure("doctors", roleError, "We could not grant the doctor role just now. Please try again.");

  const { error: doctorError } = await supabase.from("doctors").insert({
    user_id: invited.user.id,
    organization_id: organizationId,
    primary_branch_id: parsed.data.primaryBranchId,
    registration_number: parsed.data.registrationNumber,
    specialization: parsed.data.specialization,
    qualifications: parsed.data.qualifications,
  });
  if (doctorError) {
    if (doctorError.code === "23505") {
      return {
        status: "error",
        message: "A doctor with this registration number already exists at this practice.",
        fieldErrors: { registrationNumber: ["Already in use"] },
      };
    }
    return failure("doctors", doctorError, "We could not create the doctor profile just now. Please try again.");
  }

  revalidatePath("/admin/doctors");
  return { status: "success", message: `Invitation sent to ${parsed.data.email}.` };
}

/**
 * One save for the whole Edit dialog — the profile fields and the photo.
 *
 * The dialog used to hold three separate forms — name/phone, photo, and the
 * profile fields — each with its own Save. An admin who filled in more than
 * one and pressed a button lost the rest. This writes all three: the identity
 * columns on public.users, and the doctor row.
 *
 * The photo is optional: leaving the picker alone keeps the current one rather
 * than clearing it.
 */
export async function updateDoctorProfileAction(_previous: FormState, formData: FormData): Promise<FormState> {
  await requireRole("admin", "super_admin");

  const doctorId = text(formData, "doctorId");
  if (!doctorId) return { status: "error", message: "We could not tell which doctor to update." };

  const photo = readDoctorPhoto(formData);
  if (photo) {
    const problem = describeDoctorPhotoProblem(photo);
    if (problem) return { status: "error", message: problem, fieldErrors: { photo: [problem] } };
  }

  const identity = adminUpdateIdentitySchema.safeParse({
    targetUserId: text(formData, "targetUserId"),
    fullName: text(formData, "fullName"),
    phone: text(formData, "phone") ?? null,
  });
  if (!identity.success) return invalid(identity.error);

  const parsed = updateDoctorProfileSchema.safeParse({
    primaryBranchId: text(formData, "primaryBranchId") ?? null,
    registrationNumber: text(formData, "registrationNumber") ?? null,
    specialization: text(formData, "specialization") ?? null,
    qualifications: text(formData, "qualifications") ?? null,
    bio: text(formData, "bio") ?? null,
    isAcceptingAppointments: formData.get("isAcceptingAppointments") === "on",
  });
  if (!parsed.success) return invalid(parsed.error);

  // Uploaded before the row is touched, so a storage failure leaves the
  // profile as it was rather than half-saved.
  let photoPath: string | undefined;
  if (photo) {
    const uploaded = await uploadDoctorPhoto(doctorId, photo);
    if (!uploaded.ok) return { status: "error", message: "We could not upload that image. Please try again." };
    photoPath = uploaded.path;
  }

  const supabase = await createClient();

  // users first: its own RLS (id = auth.uid() or is_admin_of_user(id)) is what
  // authorizes the name and phone, and a failure there should stop the rest.
  const { error: identityError } = await supabase
    .from("users")
    .update({ full_name: identity.data.fullName, phone: identity.data.phone })
    .eq("id", identity.data.targetUserId)
    .select("id")
    .maybeSingle();

  if (identityError) {
    return failure("doctors", identityError, "We could not save this doctor's details just now. Please try again.");
  }

  const { error } = await supabase
    .from("doctors")
    .update({
      ...(photoPath === undefined ? {} : { photo_path: photoPath }),
      primary_branch_id: parsed.data.primaryBranchId,
      registration_number: parsed.data.registrationNumber,
      specialization: parsed.data.specialization,
      qualifications: parsed.data.qualifications,
      bio: parsed.data.bio,
      is_accepting_appointments: parsed.data.isAcceptingAppointments,
    })
    .eq("id", doctorId);

  if (error) {
    if (error.code === "23505") {
      return {
        status: "error",
        message: "A doctor with this registration number already exists at this practice.",
        fieldErrors: { registrationNumber: ["Already in use"] },
      };
    }
    return failure("doctors", error, "We could not save this doctor's profile just now. Please try again.");
  }

  revalidatePath("/admin/doctors");
  return { status: "success", message: "Doctor profile saved." };
}

/** Deactivating removes login access and list visibility together — clinical history stays intact (on delete restrict). */
export async function deactivateDoctorAction(_previous: FormState, formData: FormData): Promise<FormState> {
  await requireRole("admin", "super_admin");

  const doctorId = text(formData, "doctorId");
  const userId = text(formData, "userId");
  if (!doctorId || !userId) return { status: "error", message: "We could not tell which doctor to deactivate." };

  const supabase = await createClient();
  const now = new Date().toISOString();

  const [{ error: doctorError }, { error: roleError }] = await Promise.all([
    supabase.from("doctors").update({ deleted_at: now }).eq("id", doctorId),
    supabase.from("user_roles").update({ revoked_at: now }).eq("user_id", userId).is("revoked_at", null),
  ]);

  if (doctorError || roleError) {
    return failure("doctors", doctorError ?? roleError, "We could not deactivate this doctor just now. Please try again.");
  }

  revalidatePath("/admin/doctors");
  return { status: "success", message: "Doctor deactivated." };
}

export async function reactivateDoctorAction(_previous: FormState, formData: FormData): Promise<FormState> {
  await requireRole("admin", "super_admin");

  const doctorId = text(formData, "doctorId");
  const userId = text(formData, "userId");
  if (!doctorId || !userId) return { status: "error", message: "We could not tell which doctor to reactivate." };

  const supabase = await createClient();

  const [{ error: doctorError }, { error: roleError }] = await Promise.all([
    supabase.from("doctors").update({ deleted_at: null }).eq("id", doctorId),
    supabase.from("user_roles").update({ revoked_at: null }).eq("user_id", userId),
  ]);

  if (doctorError || roleError) {
    return failure("doctors", doctorError ?? roleError, "We could not reactivate this doctor just now. Please try again.");
  }

  revalidatePath("/admin/doctors");
  return { status: "success", message: "Doctor reactivated." };
}

/**
 * Turns the counts into the half-sentence the refusal reads with, longest
 * first: "12 appointments, 5 SOAP records and 1 prescription".
 */
function describeDoctorHistory(history: {
  appointments: number;
  soapRecords: number;
  prescriptions: number;
  vaccinations: number;
  dewormingRecords: number;
}): string {
  const parts = [
    [history.appointments, "appointment"],
    [history.soapRecords, "SOAP record"],
    [history.prescriptions, "prescription"],
    [history.vaccinations, "vaccination"],
    [history.dewormingRecords, "deworming record"],
  ] as const;

  const named = parts
    .filter(([count]) => count > 0)
    .map(([count, noun]) => `${count} ${noun}${count === 1 ? "" : "s"}`);

  if (named.length === 0) return "";
  if (named.length === 1) return named[0];
  return `${named.slice(0, -1).join(", ")} and ${named[named.length - 1]}`;
}

/**
 * Deletes a doctor record for good.
 *
 * Deliberately narrow, and not the same button as Deactivate: this is for a
 * profile that should never have existed — an invitation sent twice, the wrong
 * person invited. A doctor who has actually seen a patient keeps their
 * records, and the delete refuses by naming what is holding it (CLAUDE.md §6,
 * §16).
 *
 * The removal itself happens in `delete_doctor`, one transaction that also
 * clears the doctor's availability and revokes their doctor role at this
 * practice. The login account is left alone: it may be the same person's
 * client account, and an account is not this screen's to destroy.
 */
export async function deleteDoctorAction(_previous: FormState, formData: FormData): Promise<FormState> {
  await requireRole("admin", "super_admin");

  const doctorId = text(formData, "doctorId");
  if (!doctorId) return { status: "error", message: "We could not tell which doctor to delete." };

  const history = await countDoctorHistory(doctorId);
  if (history.status === "error") {
    return { status: "error", message: "We could not check this doctor's records just now. Please try again." };
  }

  if (history.data.total > 0) {
    return {
      status: "error",
      message: `This doctor has ${describeDoctorHistory(history.data)} and cannot be deleted. Deactivate them instead — that removes their access and keeps their records intact.`,
    };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("delete_doctor", { p_doctor_id: doctorId });

  if (error) {
    // The function runs the same history check inside the transaction, so a
    // record created between the count above and this call lands here rather
    // than being deleted.
    if (error.code === "23001") {
      return {
        status: "error",
        message: "This doctor now has appointment or clinical history and cannot be deleted. Deactivate them instead.",
      };
    }
    return failure("doctors", error, "We could not delete this doctor just now. Please try again.");
  }

  revalidatePath("/admin/doctors");
  return { status: "success", message: "Doctor deleted." };
}
