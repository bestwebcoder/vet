"use server";

import { revalidatePath } from "next/cache";

import { requireRole } from "@/features/auth/session";
import { getOwnDoctorRecord } from "@/features/doctors/queries";
import { describeSignatureProblem, readSignature, uploadDoctorSignature } from "@/features/doctors/signature";
import { failure, invalid, text, type FormState } from "@/lib/forms";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { inviteDoctorSchema, updateDoctorProfileSchema } from "@/lib/validation/doctor";

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

export async function updateDoctorProfileAction(_previous: FormState, formData: FormData): Promise<FormState> {
  await requireRole("admin", "super_admin");

  const doctorId = text(formData, "doctorId");
  if (!doctorId) return { status: "error", message: "We could not tell which doctor to update." };

  const parsed = updateDoctorProfileSchema.safeParse({
    primaryBranchId: text(formData, "primaryBranchId") ?? null,
    registrationNumber: text(formData, "registrationNumber") ?? null,
    specialization: text(formData, "specialization") ?? null,
    qualifications: text(formData, "qualifications") ?? null,
    bio: text(formData, "bio") ?? null,
  });
  if (!parsed.success) return invalid(parsed.error);

  const supabase = await createClient();
  const { error } = await supabase
    .from("doctors")
    .update({
      primary_branch_id: parsed.data.primaryBranchId,
      registration_number: parsed.data.registrationNumber,
      specialization: parsed.data.specialization,
      qualifications: parsed.data.qualifications,
      bio: parsed.data.bio,
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
