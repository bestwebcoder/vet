"use client";

import { useEffect } from "react";

import { ErrorState } from "@/components/states/error-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

/**
 * §10.7 — the route-segment error boundary this app had none of. Catches
 * any render error below it and shows the same professional error state
 * every other failure path already uses, instead of Next's default overlay
 * (which can surface a raw stack trace). The actual error goes to the
 * console for diagnosis — never shown to the person using the app.
 */
export default function ErrorBoundary({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("[error-boundary]", error);
  }, [error]);

  return (
    <div className="bg-muted/40 flex min-h-svh items-center justify-center px-4 py-10">
      <Card className="w-full max-w-md">
        <CardContent>
          <ErrorState
            title="Something went wrong"
            description="We could not load this page just now. Please try again."
            action={
              <Button onClick={() => reset()} size="touch" className="w-full">
                Try again
              </Button>
            }
          />
        </CardContent>
      </Card>
    </div>
  );
}
