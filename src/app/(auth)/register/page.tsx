import type { Metadata } from "next";
import Link from "next/link";

import { RegisterForm } from "./register-form";

export const metadata: Metadata = { title: "Create an account · TV Care" };

export default function RegisterPage() {
  return (
    <>
      <RegisterForm />
      <p className="text-muted-foreground mt-6 text-center text-sm">
        Already have an account?{" "}
        <Link href="/login" className="text-foreground font-medium underline underline-offset-4">
          Sign in
        </Link>
      </p>
    </>
  );
}
