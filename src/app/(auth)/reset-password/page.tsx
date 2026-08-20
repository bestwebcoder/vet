import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

import { ResetPasswordForm } from "./reset-password-form";

export const metadata: Metadata = { title: "Choose a new password · TV Care" };

export default async function ResetPasswordPage() {
  // Reaching this page means the recovery link was verified and a session
  // exists. Without one there is nothing to update, so send them back to ask
  // for a fresh link rather than showing a form that cannot work.
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();

  if (!claims) {
    redirect("/auth/link-invalid");
  }

  return <ResetPasswordForm />;
}
