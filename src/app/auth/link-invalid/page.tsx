import type { Metadata } from "next";
import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = { title: "Link no longer valid · TV Care" };

export default function LinkInvalidPage() {
  return (
    <div className="bg-muted/40 flex min-h-svh flex-col items-center justify-center px-4 py-10">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>This link is no longer valid</CardTitle>
          <CardDescription>
            Confirmation and reset links can only be used once, and they expire after a while.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          <Link href="/forgot-password" className={buttonVariants({ size: "touch", className: "w-full" })}>
            Send me a new link
          </Link>
          <Link
            href="/login"
            className={buttonVariants({ variant: "outline", size: "touch", className: "w-full" })}
          >
            Back to sign in
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
