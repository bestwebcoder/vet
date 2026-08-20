import type { Metadata } from "next";
import Link from "next/link";

import { ErrorState } from "@/components/states/error-state";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { getSessionUser, homeHrefFor } from "@/features/auth/session";

export const metadata: Metadata = { title: "No access · TV Care" };

/**
 * Shown when someone reaches an area their role does not cover.
 *
 * Says nothing about whether the thing they asked for exists, and offers the
 * way back to their own work rather than leaving a dead end.
 */
export default async function NoAccessPage() {
  const user = await getSessionUser();
  const home = user ? homeHrefFor(user) : null;

  return (
    <div className="bg-muted/40 flex min-h-svh items-center justify-center px-4 py-10">
      <Card className="w-full max-w-md">
        <CardContent>
          <ErrorState
            title="You do not have access to this area"
            description="Your account does not cover this part of TV Care. If you think it should, ask an administrator at your clinic."
            action={
              <Link
                href={home ?? "/login"}
                className={buttonVariants({ size: "touch", className: "w-full" })}
              >
                {home ? "Back to my dashboard" : "Sign in"}
              </Link>
            }
          />
        </CardContent>
      </Card>
    </div>
  );
}
