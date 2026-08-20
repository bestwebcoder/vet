import type { Metadata } from "next";
import Link from "next/link";

import { EmptyState } from "@/components/states/empty-state";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export const metadata: Metadata = { title: "Page not found · TV Care" };

export default function NotFound() {
  return (
    <div className="bg-muted/40 flex min-h-svh items-center justify-center px-4 py-10">
      <Card className="w-full max-w-md">
        <CardContent>
          <EmptyState
            title="We could not find that page"
            description="The link may be out of date, or the page may have moved."
            action={
              <Link href="/" className={buttonVariants({ size: "touch", className: "w-full" })}>
                Go to my dashboard
              </Link>
            }
          />
        </CardContent>
      </Card>
    </div>
  );
}
