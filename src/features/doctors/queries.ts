import { getSessionUser } from "@/features/auth/session";
import { createClient } from "@/lib/supabase/server";

/**
 * Doctor reads.
 *
 * Managing a doctor's profile is Phase 10 (see the comment in
 * `src/components/shell/navigation.ts`). This file only reads what booking
 * and the calendar need now: who a doctor is, and whether they are currently
 * taking appointments.
 */

export type DoctorSummary = {
  id: string;
  userId: string;
  fullName: string;
  specialization: string | null;
  registrationNumber: string | null;
  signatureUrl: string | null;
  isAcceptingAppointments: boolean;
};

export type Result<T> = { status: "ok"; data: T } | { status: "error" };

const DOCTOR_COLUMNS = `
  id, user_id, organization_id, specialization, registration_number, signature_url, is_accepting_appointments,
  user:user_id (full_name)
`;

type Related = { full_name: string } | { full_name: string }[] | null;

function one(value: Related) {
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

/* eslint-disable @typescript-eslint/no-explicit-any -- shaped by the select above */
function toSummary(row: any): DoctorSummary {
  return {
    id: row.id,
    userId: row.user_id,
    fullName: one(row.user)?.full_name ?? "Unknown doctor",
    specialization: row.specialization,
    registrationNumber: row.registration_number,
    signatureUrl: row.signature_url,
    isAcceptingAppointments: row.is_accepting_appointments,
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/** Doctors of the caller's organization, for the booking flow and the calendar. */
export async function listDoctors(
  options: { onlyAccepting?: boolean } = {},
): Promise<Result<DoctorSummary[]>> {
  const supabase = await createClient();

  let query = supabase
    .from("doctors")
    .select(DOCTOR_COLUMNS)
    .is("deleted_at", null)
    .order("id");

  if (options.onlyAccepting) {
    query = query.eq("is_accepting_appointments", true);
  }

  const { data, error } = await query;

  if (error) {
    console.error("[doctors] list failed", error);
    return { status: "error" };
  }

  return { status: "ok", data: (data ?? []).map(toSummary) };
}

export async function getDoctor(doctorId: string): Promise<Result<DoctorSummary | null>> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("doctors")
    .select(DOCTOR_COLUMNS)
    .eq("id", doctorId)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) {
    console.error("[doctors] get failed", error);
    return { status: "error" };
  }

  return { status: "ok", data: data ? toSummary(data) : null };
}

/** The doctor record belonging to the signed-in person, if they have one. */
export async function getOwnDoctorRecord(): Promise<Result<DoctorSummary | null>> {
  const user = await getSessionUser();
  if (!user) return { status: "ok", data: null };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("doctors")
    .select(DOCTOR_COLUMNS)
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) {
    console.error("[doctors] own record failed", error);
    return { status: "error" };
  }

  return { status: "ok", data: data ? toSummary(data) : null };
}
