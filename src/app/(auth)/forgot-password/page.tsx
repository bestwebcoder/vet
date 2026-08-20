import type { Metadata } from "next";
import Link from "next/link";

import { ForgotPasswordForm } from "./forgot-password-form";

export const metadata: Metadata = { title: "Reset your password · TV Care" };

export default function ForgotPasswordPage() {
  return (
    <>
      <ForgotPasswordForm />
      <p className="text-muted-foreground mt-6 text-center text-sm">
        <Link href="/login" className="text-foreground font-medium underline underline-offset-4">
          Back to sign in
        </Link>
      </p>
    </>
  );
}
