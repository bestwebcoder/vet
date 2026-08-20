import type { Metadata } from "next";
import Link from "next/link";

import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in · TV Care" };

export default function LoginPage() {
  return (
    <>
      <LoginForm />
      <p className="text-muted-foreground mt-6 text-center text-sm">
        New to TV Care?{" "}
        <Link href="/register" className="text-foreground font-medium underline underline-offset-4">
          Create an account
        </Link>
      </p>
    </>
  );
}
