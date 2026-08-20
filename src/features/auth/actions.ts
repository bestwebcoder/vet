"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { ZodError } from "zod";

import { createClient } from "@/lib/supabase/server";
import {
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
} from "@/lib/validation/auth";

/**
 * Every action returns this shape. Technical detail is logged, never returned:
 * the user sees a sentence, the server keeps the cause.
 */
export type FormState =
  | { status: "idle" }
  | { status: "success"; message?: string }
  | { status: "error"; message: string; fieldErrors?: Record<string, string[]> };

function fieldErrorsFrom(error: ZodError): Record<string, string[]> {
  const fieldErrors: Record<string, string[]> = {};

  for (const issue of error.issues) {
    const key = issue.path.join(".") || "form";
    (fieldErrors[key] ??= []).push(issue.message);
  }

  return fieldErrors;
}

function logFailure(context: string, cause: unknown) {
  console.error(`[auth] ${context}`, cause);
}

async function siteOrigin(): Promise<string> {
  const headerList = await headers();
  const host = headerList.get("host") ?? "localhost:3000";
  const protocol = host.startsWith("localhost") || host.startsWith("127.0.0.1") ? "http" : "https";

  return `${protocol}://${host}`;
}

export async function registerAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = registerSchema.safeParse({
    fullName: formData.get("fullName"),
    email: formData.get("email"),
    phone: formData.get("phone"),
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  });

  if (!parsed.success) {
    return {
      status: "error",
      message: "Please correct the highlighted fields.",
      fieldErrors: fieldErrorsFrom(parsed.error),
    };
  }

  const { fullName, email, phone, password } = parsed.data;
  const supabase = await createClient();

  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${await siteOrigin()}/auth/confirm`,
      // signup_source is what tells the database trigger to provision a pet
      // owner. Accounts created any other way get a profile and nothing more.
      data: { full_name: fullName, phone, signup_source: "self_registration" },
    },
  });

  if (error) {
    logFailure("registration failed", error);

    // 23505 is the unique index on (organization_id, phone) raised by the
    // signup trigger, surfaced through the auth API as a database error.
    if (error.message.includes("already registered")) {
      return {
        status: "error",
        message: "An account with this email already exists. Try signing in instead.",
      };
    }

    if (error.message.includes("duplicate key") || error.message.includes("23505")) {
      return {
        status: "error",
        message: "An account with this phone number already exists.",
      };
    }

    return {
      status: "error",
      message: "We could not create your account just now. Please try again.",
    };
  }

  return {
    status: "success",
    message: "Check your email for a link to confirm your account.",
  };
}

export async function loginAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return {
      status: "error",
      message: "Please correct the highlighted fields.",
      fieldErrors: fieldErrorsFrom(parsed.error),
    };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);

  if (error) {
    logFailure("sign in failed", error);

    if (error.code === "email_not_confirmed") {
      return {
        status: "error",
        message: "Please confirm your email address first. Check your inbox for the link.",
      };
    }

    // Deliberately identical for a wrong password and an unknown address, so
    // this form cannot be used to discover who holds an account here.
    return { status: "error", message: "Email or password is incorrect." };
  }

  redirect("/");
}

export async function logoutAction() {
  const supabase = await createClient();
  const { error } = await supabase.auth.signOut();

  if (error) {
    logFailure("sign out failed", error);
  }

  redirect("/login");
}

export async function requestPasswordResetAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = forgotPasswordSchema.safeParse({ email: formData.get("email") });

  if (!parsed.success) {
    return {
      status: "error",
      message: "Please correct the highlighted fields.",
      fieldErrors: fieldErrorsFrom(parsed.error),
    };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${await siteOrigin()}/auth/confirm?next=/reset-password`,
  });

  if (error) {
    logFailure("password reset request failed", error);
  }

  // Always the same answer, whether or not that address has an account.
  return {
    status: "success",
    message: "If an account exists for that address, we have sent a reset link.",
  };
}

export async function resetPasswordAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = resetPasswordSchema.safeParse({
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  });

  if (!parsed.success) {
    return {
      status: "error",
      message: "Please correct the highlighted fields.",
      fieldErrors: fieldErrorsFrom(parsed.error),
    };
  }

  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();

  if (!claims) {
    return {
      status: "error",
      message: "This reset link has expired. Request a new one to continue.",
    };
  }

  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });

  if (error) {
    logFailure("password update failed", error);

    return {
      status: "error",
      message: "We could not update your password. Request a new reset link and try again.",
    };
  }

  redirect("/");
}
