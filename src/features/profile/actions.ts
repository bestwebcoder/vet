"use server";

import { revalidatePath } from "next/cache";

import { requireRole, requireUser } from "@/features/auth/session";
import { describeAvatarProblem, readAvatar, uploadAvatar } from "@/features/profile/photo";
import { failure, fieldErrorsFrom, invalid, text, type FormState } from "@/lib/forms";
import { publicEnv } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { ownClientProfileSchema, ownClientProfileToRow } from "@/lib/validation/client";
import {
  adminChangeEmailSchema,
  adminSetPasswordSchema,
  adminUpdateIdentitySchema,
  changePasswordSchema,
} from "@/lib/validation/profile";

function avatarPublicUrl(path: string): string {
  return `${publicEnv().NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/avatars/${path}?v=${Date.now()}`;
}

/**
 * Uploads an account photo — for the signed-in person themselves (no
 * `targetUserId` in the form) or, from an admin surface, for someone they
 * administer (`targetUserId` set explicitly). One action for both: the
 * storage bucket's own RLS (self or is_admin_of_user) and users_update's RLS
 * are the actual gate either way, matching this codebase's "the proxy check
 * is convenience, RLS is the boundary" rule — see
 * supabase/migrations/20260910000100_avatars.sql.
 */
export async function updateAvatarAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const targetUserId = text(formData, "targetUserId") ?? user.id;

  const file = readAvatar(formData);
  if (!file) {
    return { status: "error", message: "Choose an image to upload.", fieldErrors: { avatar: ["Required"] } };
  }

  const problem = describeAvatarProblem(file);
  if (problem) {
    return { status: "error", message: problem, fieldErrors: { avatar: [problem] } };
  }

  const uploaded = await uploadAvatar(targetUserId, file);
  if (!uploaded.ok) {
    return { status: "error", message: "We could not upload that image. Please try again." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("users")
    .update({ avatar_url: avatarPublicUrl(uploaded.path) })
    .eq("id", targetUserId)
    .select("id")
    .maybeSingle();

  if (error) {
    return failure("profile", error, "We could not save that photo just now. Please try again.");
  }

  if (!data) {
    return { status: "error", message: "You do not have access to update this photo." };
  }

  // The avatar shows in the sidebar/header on every authenticated screen,
  // not just the profile page it was uploaded from.
  revalidatePath("/", "layout");

  return { status: "success", message: "Photo updated." };
}

/**
 * A signed-in person changes their own password. The current password is
 * verified by attempting a real sign-in with it — Supabase has no separate
 * "check this password" call — before updateUser replaces it. A wrong
 * current password leaves the existing session untouched.
 */
export async function changeOwnPasswordAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();

  const parsed = changePasswordSchema.safeParse({
    currentPassword: formData.get("currentPassword"),
    newPassword: formData.get("newPassword"),
    confirmPassword: formData.get("confirmPassword"),
  });
  if (!parsed.success) return invalid(parsed.error);

  const supabase = await createClient();
  const { error: verifyError } = await supabase.auth.signInWithPassword({
    email: user.email,
    password: parsed.data.currentPassword,
  });

  if (verifyError) {
    return {
      status: "error",
      message: "Your current password is incorrect.",
      fieldErrors: { currentPassword: ["Incorrect"] },
    };
  }

  const { error } = await supabase.auth.updateUser({ password: parsed.data.newPassword });
  if (error) {
    return failure("profile", error, "We could not update your password just now. Please try again.");
  }

  return { status: "success", message: "Password changed." };
}

/**
 * An admin sets a password directly for someone they administer — no
 * current password, since it is not that person typing it. Authorization is
 * checked explicitly (via the RPC wrapper around is_admin_of_user, run under
 * the admin's own RLS-scoped session) before the one service-role call this
 * needs: auth.users has no other way in for an admin to set someone else's
 * password. Same one-call-only use of the service role as inviteDoctorAction
 * (src/features/doctors/actions.ts).
 */
export async function adminSetPasswordAction(_previous: FormState, formData: FormData): Promise<FormState> {
  await requireRole("admin", "super_admin");

  const parsed = adminSetPasswordSchema.safeParse({
    targetUserId: formData.get("targetUserId"),
    newPassword: formData.get("newPassword"),
    confirmPassword: formData.get("confirmPassword"),
  });
  if (!parsed.success) return invalid(parsed.error);

  const supabase = await createClient();
  const { data: authorized, error: authError } = await supabase.rpc("is_admin_of_user", {
    p_user_id: parsed.data.targetUserId,
  });

  if (authError || !authorized) {
    return { status: "error", message: "You do not have access to manage this account." };
  }

  const serviceClient = createServiceClient();
  const { error } = await serviceClient.auth.admin.updateUserById(parsed.data.targetUserId, {
    password: parsed.data.newPassword,
  });

  if (error) {
    return failure("profile", error, "We could not set that password just now. Please try again.");
  }

  return { status: "success", message: "Password updated." };
}

/**
 * An admin corrects someone's name or phone — the identity fields on
 * public.users, shared by every role. No explicit authorization check
 * needed here the way password/email changes need one: this is a normal
 * table write, so users_update's own RLS (id = auth.uid() or
 * is_admin_of_user(id)) is the gate, same as updateAvatarAction above.
 */
export async function adminUpdateIdentityAction(_previous: FormState, formData: FormData): Promise<FormState> {
  await requireRole("admin", "super_admin");

  const parsed = adminUpdateIdentitySchema.safeParse({
    targetUserId: formData.get("targetUserId"),
    fullName: formData.get("fullName"),
    phone: formData.get("phone"),
  });
  if (!parsed.success) return invalid(parsed.error);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("users")
    .update({ full_name: parsed.data.fullName, phone: parsed.data.phone })
    .eq("id", parsed.data.targetUserId)
    .select("id")
    .maybeSingle();

  if (error) {
    return failure("profile", error, "We could not save these changes just now. Please try again.");
  }

  if (!data) {
    return { status: "error", message: "You do not have access to manage this account." };
  }

  revalidatePath("/", "layout");

  return { status: "success", message: "Changes saved." };
}

/**
 * An admin changes someone's sign-in email. Unlike full_name/phone, this
 * cannot be a plain table write: auth.users has its own copy, used to sign
 * in, that public.users does not sync to automatically. Same
 * authorize-then-one-service-role-call shape as adminSetPasswordAction.
 */
export async function adminChangeEmailAction(_previous: FormState, formData: FormData): Promise<FormState> {
  await requireRole("admin", "super_admin");

  const parsed = adminChangeEmailSchema.safeParse({
    targetUserId: formData.get("targetUserId"),
    newEmail: formData.get("newEmail"),
  });
  if (!parsed.success) return invalid(parsed.error);

  const supabase = await createClient();
  const { data: authorized, error: authError } = await supabase.rpc("is_admin_of_user", {
    p_user_id: parsed.data.targetUserId,
  });

  if (authError || !authorized) {
    return { status: "error", message: "You do not have access to manage this account." };
  }

  const serviceClient = createServiceClient();
  const { error: authUpdateError } = await serviceClient.auth.admin.updateUserById(parsed.data.targetUserId, {
    email: parsed.data.newEmail,
    email_confirm: true,
  });

  if (authUpdateError) {
    if (authUpdateError.code === "email_exists") {
      return {
        status: "error",
        message: "An account with this email already exists.",
        fieldErrors: { newEmail: ["Already in use"] },
      };
    }
    return failure("profile", authUpdateError, "We could not update that email just now. Please try again.");
  }

  // public.users has its own copy of the email (queried far more often than
  // auth.users, which RLS cannot see into) — nothing keeps it in sync
  // automatically, so this is the second half of the change, not a cache.
  // Through the service client, deliberately: full_name/phone/avatar_url are
  // authenticated-grantable columns (20260820000200_rls_and_audit.sql), but
  // email is not — self-service editing it would let a signed-in person
  // silently diverge public.users.email from the auth.users address they
  // actually sign in with. The is_admin_of_user check above is what makes
  // this write legitimate, not a column grant.
  const { error } = await serviceClient.from("users").update({ email: parsed.data.newEmail }).eq("id", parsed.data.targetUserId);
  if (error) {
    return failure("profile", error, "The sign-in email changed, but we could not update the profile record. Please try again.");
  }

  revalidatePath("/", "layout");

  return { status: "success", message: "Email updated." };
}

/**
 * The client profile page saves as one form: contact details, an optional new
 * photo and an optional password change behind a single Save button.
 *
 * Everything is validated — including verifying the current password — before
 * anything is written, so a typo in one section cannot leave another half
 * saved. The photo and the password come last and downgrade to a warning if
 * they fail on their own: the contact details are already in the database at
 * that point, and saying "saved, except the photo" is honest where a bare
 * error would not be.
 *
 * The record is located by `user_id = auth.uid()`, not by an id posted from
 * the browser: this surface is only ever a client editing themselves, so
 * there is nothing to identify.
 */
export async function updateOwnClientProfileAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireRole("client");

  const parsed = ownClientProfileSchema.safeParse({
    fullName: text(formData, "fullName") ?? "",
    phone: text(formData, "phone") ?? "",
    alternatePhone: text(formData, "alternatePhone") ?? null,
    email: text(formData, "email") ?? null,
    preferredBranchId: text(formData, "preferredBranchId") ?? null,
    address: text(formData, "address") ?? "",
    city: text(formData, "city") ?? "",
  });

  const photo = readAvatar(formData);
  const photoProblem = photo ? describeAvatarProblem(photo) : null;

  // The password section is optional now that it shares a Save button with
  // the rest of the form: it is only attempted when something was typed into
  // it, so saving a new phone number does not demand a password too.
  const wantsPasswordChange = ["currentPassword", "newPassword", "confirmPassword"].some(
    (field) => text(formData, field) !== undefined,
  );
  const passwordParsed = wantsPasswordChange
    ? changePasswordSchema.safeParse({
        currentPassword: formData.get("currentPassword"),
        newPassword: formData.get("newPassword"),
        confirmPassword: formData.get("confirmPassword"),
      })
    : null;

  const fieldErrors: Record<string, string[]> = {};
  if (!parsed.success) Object.assign(fieldErrors, fieldErrorsFrom(parsed.error));
  if (passwordParsed && !passwordParsed.success) {
    Object.assign(fieldErrors, fieldErrorsFrom(passwordParsed.error));
  }
  if (photoProblem) fieldErrors.avatar = [photoProblem];

  if (Object.keys(fieldErrors).length > 0 || !parsed.success) {
    return { status: "error", message: "Please correct the highlighted fields.", fieldErrors };
  }

  const supabase = await createClient();
  const newPassword = passwordParsed?.success ? passwordParsed.data : null;

  if (newPassword) {
    // Supabase has no "check this password" call, so the current one is
    // verified by signing in with it — before anything is written, so a wrong
    // one costs nothing but the message.
    const { error: verifyError } = await supabase.auth.signInWithPassword({
      email: user.email,
      password: newPassword.currentPassword,
    });

    if (verifyError) {
      return {
        status: "error",
        message: "Your current password is incorrect.",
        fieldErrors: { currentPassword: ["Incorrect"] },
      };
    }
  }

  const { data, error } = await supabase
    .from("clients")
    .update(ownClientProfileToRow(parsed.data))
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .select("id")
    .maybeSingle();

  if (error) {
    if (error.code === "23505") {
      return {
        status: "error",
        message: "A client with this phone number already exists at this practice.",
        fieldErrors: { phone: ["Already in use"] },
      };
    }
    return failure("profile", error, "We could not save these changes just now. Please try again.");
  }

  if (!data) {
    return { status: "error", message: "We could not find your client record to update." };
  }

  const warnings: string[] = [];

  if (photo) {
    const uploaded = await uploadAvatar(user.id, photo);

    if (!uploaded.ok) {
      warnings.push("Your photo could not be uploaded.");
    } else {
      const { error: avatarError } = await supabase
        .from("users")
        .update({ avatar_url: avatarPublicUrl(uploaded.path) })
        .eq("id", user.id)
        .select("id")
        .maybeSingle();

      if (avatarError) {
        console.error("[profile]", avatarError);
        warnings.push("Your photo could not be saved.");
      }
    }
  }

  if (newPassword) {
    const { error: passwordError } = await supabase.auth.updateUser({
      password: newPassword.newPassword,
    });

    if (passwordError) {
      console.error("[profile]", passwordError);
      warnings.push("Your password could not be changed.");
    }
  }

  // The name and photo appear in the sidebar on every authenticated screen,
  // not only the page they were edited on.
  revalidatePath("/", "layout");

  const changedPassword = Boolean(newPassword) && warnings.length === 0;

  return {
    status: "success",
    message: changedPassword ? "Changes saved. Your password has been changed." : "Changes saved.",
    warning: warnings.length > 0 ? `${warnings.join(" ")} Everything else was saved.` : undefined,
  };
}
