"use server";

import { revalidatePath } from "next/cache";

import { getOwnDoctorRecord } from "@/features/doctors/queries";
import { describeSignatureProblem, readSignature, uploadDoctorSignature } from "@/features/doctors/signature";
import { failure, type FormState } from "@/lib/forms";
import { createClient } from "@/lib/supabase/server";

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
