import { getSessionUser } from "@/features/auth/session";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * Doctor reads — booking/calendar summaries, and (Phase 10) the fuller
 * profile the admin doctor-management screen needs.
 */

export type DoctorSummary = {
  id: string;
  userId: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  specialization: string | null;
  registrationNumber: string | null;
  qualifications: string | null;
  bio: string | null;
  primaryBranchId: string | null;
  signatureUrl: string | null;
  isAcceptingAppointments: boolean;
  isActive: boolean;
  canManageBilling: boolean;
  canViewReports: boolean;
};

export type Result<T> = { status: "ok"; data: T } | { status: "error" };

const DOCTOR_COLUMNS = `
  id, user_id, organization_id, primary_branch_id, specialization, registration_number,
  qualifications, bio, signature_url,
  is_accepting_appointments, deleted_at, can_manage_billing, can_view_reports,
  user:user_id (full_name, email, phone)
`;

type Related = { full_name: string; email: string; phone: string | null } | { full_name: string; email: string; phone: string | null }[] | null;

function one(value: Related) {
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

/* eslint-disable @typescript-eslint/no-explicit-any -- shaped by the select above */
function toSummary(row: any): DoctorSummary {
  const user = one(row.user);
  return {
    id: row.id,
    userId: row.user_id,
    fullName: user?.full_name ?? "Unknown doctor",
    email: user?.email ?? null,
    phone: user?.phone ?? null,
    specialization: row.specialization,
    registrationNumber: row.registration_number,
    qualifications: row.qualifications,
    bio: row.bio,
    primaryBranchId: row.primary_branch_id,
    signatureUrl: row.signature_url,
    isAcceptingAppointments: row.is_accepting_appointments,
    isActive: row.deleted_at === null,
    canManageBilling: row.can_manage_billing,
    canViewReports: row.can_view_reports,
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

/** The doctor-management screen: every doctor, active or deactivated. */
export async function listDoctorsForAdmin(includeInactive = false): Promise<Result<DoctorSummary[]>> {
  const supabase = await createClient();

  let query = supabase.from("doctors").select(DOCTOR_COLUMNS).order("id");
  if (!includeInactive) {
    query = query.is("deleted_at", null);
  }

  const { data, error } = await query;

  if (error) {
    console.error("[doctors] admin list failed", error);
    return { status: "error" };
  }

  return { status: "ok", data: (data ?? []).map(toSummary) };
}

export type PublicDoctor = {
  id: string;
  fullName: string;
  specialization: string | null;
  qualifications: string | null;
  bio: string | null;
};

/**
 * The public Doctors page — reached before any session exists, so it goes
 * through the service role like every other public read. Real doctors,
 * not placeholder names (CLAUDE.md forbids hardcoding them); only the
 * fields a practice would put on its own website — never contact details
 * or anything clinical.
 */
export async function getPublicDoctors(): Promise<Result<PublicDoctor[]>> {
  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from("doctors")
    .select("id, specialization, qualifications, bio, user:user_id (full_name)")
    .is("deleted_at", null)
    .order("id");

  if (error) {
    console.error("[doctors] public list failed", error);
    return { status: "error" };
  }

  return {
    status: "ok",
    data: (data ?? []).map((row) => {
      const user = Array.isArray(row.user) ? row.user[0] : row.user;
      return {
        id: row.id,
        fullName: user?.full_name ?? "Unknown doctor",
        specialization: row.specialization,
        qualifications: row.qualifications,
        bio: row.bio,
      };
    }),
  };
}
