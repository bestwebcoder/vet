"use server";

import { revalidatePath } from "next/cache";

import { requireRole } from "@/features/auth/session";
import { failure, invalid, text, type FormState } from "@/lib/forms";
import { createClient } from "@/lib/supabase/server";
import { branchSchema, branchSlug } from "@/lib/validation/branch";

/** Branch writes. Admin only, enforced by row level security as well as here. */

function readBranch(formData: FormData) {
  return {
    name: text(formData, "name") ?? "",
    email: text(formData, "email") ?? null,
    phone: text(formData, "phone") ?? null,
    address: text(formData, "address") ?? null,
    city: text(formData, "city") ?? null,
  };
}

function duplicateName(): FormState {
  return {
    status: "error",
    message: "A branch with this name already exists at this practice.",
    fieldErrors: { name: ["Already in use"] },
  };
}

export async function createBranchAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const user = await requireRole("admin", "super_admin");
  const organizationId = user.organizationIds[0];
  if (!organizationId) return { status: "error", message: "Your account is not linked to a practice yet." };

  const parsed = branchSchema.safeParse(readBranch(formData));
  if (!parsed.success) return invalid(parsed.error);

  const supabase = await createClient();

  // The first branch a practice has is its primary one — a practice with
  // branches but no primary is a state nothing else in the app expects.
  const { count } = await supabase
    .from("branches")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", organizationId)
    .is("deleted_at", null);

  const { error } = await supabase.from("branches").insert({
    organization_id: organizationId,
    name: parsed.data.name,
    slug: branchSlug(parsed.data.name),
    email: parsed.data.email,
    phone: parsed.data.phone,
    address: parsed.data.address,
    city: parsed.data.city,
    is_primary: (count ?? 0) === 0,
  });

  if (error) {
    if (error.code === "23505") return duplicateName();
    return failure("branches", error, "We could not add that branch just now. Please try again.");
  }

  revalidatePath("/admin/settings");
  return { status: "success", message: "Branch added." };
}

export async function updateBranchAction(_previous: FormState, formData: FormData): Promise<FormState> {
  await requireRole("admin", "super_admin");

  const branchId = text(formData, "branchId");
  if (!branchId) return { status: "error", message: "We could not tell which branch this is." };

  const parsed = branchSchema.safeParse(readBranch(formData));
  if (!parsed.success) return invalid(parsed.error);

  const supabase = await createClient();
  const { error } = await supabase
    .from("branches")
    .update({
      name: parsed.data.name,
      slug: branchSlug(parsed.data.name),
      email: parsed.data.email,
      phone: parsed.data.phone,
      address: parsed.data.address,
      city: parsed.data.city,
    })
    .eq("id", branchId);

  if (error) {
    if (error.code === "23505") return duplicateName();
    return failure("branches", error, "We could not save that branch just now. Please try again.");
  }

  revalidatePath("/admin/settings");
  return { status: "success", message: "Branch saved." };
}

/**
 * Makes one branch primary.
 *
 * Through the set_primary_branch RPC rather than two updates: the partial
 * unique index allows only one primary per practice, so clearing the old one
 * and setting the new one must happen together or a crash between them leaves
 * the practice with none.
 */
export async function setPrimaryBranchAction(_previous: FormState, formData: FormData): Promise<FormState> {
  await requireRole("admin", "super_admin");

  const branchId = text(formData, "branchId");
  if (!branchId) return { status: "error", message: "We could not tell which branch to make primary." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("set_primary_branch", { p_branch_id: branchId });

  if (error) {
    return failure("branches", error, "We could not change the primary branch just now. Please try again.");
  }

  revalidatePath("/admin/settings");
  return { status: "success", message: "Primary branch updated." };
}

export async function toggleBranchActiveAction(_previous: FormState, formData: FormData): Promise<FormState> {
  await requireRole("admin", "super_admin");

  const branchId = text(formData, "branchId");
  const isActive = formData.get("isActive") === "true";
  if (!branchId) return { status: "error", message: "We could not tell which branch this is." };

  const supabase = await createClient();

  // The primary branch is where the practice is reachable, so it cannot be the
  // one that is closed. Make another branch primary first.
  if (!isActive) {
    const { data: branch } = await supabase.from("branches").select("is_primary").eq("id", branchId).maybeSingle();
    if (branch?.is_primary) {
      return {
        status: "error",
        message: "This is the primary branch. Make another branch primary before deactivating this one.",
      };
    }
  }

  const { error } = await supabase.from("branches").update({ is_active: isActive }).eq("id", branchId);

  if (error) {
    return failure("branches", error, "We could not update that branch just now. Please try again.");
  }

  revalidatePath("/admin/settings");
  return { status: "success", message: isActive ? "Branch reactivated." : "Branch deactivated." };
}

/**
 * Removes a branch outright.
 *
 * Only when nothing points at it: appointments and doctor_availability are
 * ON DELETE RESTRICT, so the database refuses a used branch regardless — this
 * checks first so an admin gets a sentence and is pointed at Deactivate, which
 * keeps the branch on the records that already reference it (CLAUDE.md §6).
 */
export async function deleteBranchAction(_previous: FormState, formData: FormData): Promise<FormState> {
  await requireRole("admin", "super_admin");

  const branchId = text(formData, "branchId");
  if (!branchId) return { status: "error", message: "We could not tell which branch to delete." };

  const supabase = await createClient();

  const { data: branch } = await supabase
    .from("branches")
    .select("is_primary, organization_id")
    .eq("id", branchId)
    .maybeSingle();

  if (!branch) return { status: "error", message: "That branch could not be found." };

  if (branch.is_primary) {
    const { count } = await supabase
      .from("branches")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", branch.organization_id)
      .is("deleted_at", null);

    if ((count ?? 0) > 1) {
      return {
        status: "error",
        message: "This is the primary branch. Make another branch primary before deleting this one.",
      };
    }
  }

  const [appointments, availability, doctors] = await Promise.all([
    supabase.from("appointments").select("id", { count: "exact", head: true }).eq("branch_id", branchId),
    supabase.from("doctor_availability").select("id", { count: "exact", head: true }).eq("branch_id", branchId),
    supabase.from("doctors").select("id", { count: "exact", head: true }).eq("primary_branch_id", branchId),
  ]);

  const referenced = (appointments.count ?? 0) + (availability.count ?? 0) + (doctors.count ?? 0);
  if (referenced > 0) {
    return {
      status: "error",
      message:
        "This branch is used by appointments, availability or a doctor's profile, so it cannot be deleted. Deactivate it instead — it stays on those records and stops being offered.",
    };
  }

  const { error } = await supabase.from("branches").delete().eq("id", branchId);

  if (error) {
    return failure("branches", error, "We could not delete that branch just now. Please try again.");
  }

  revalidatePath("/admin/settings");
  return { status: "success", message: "Branch deleted." };
}
