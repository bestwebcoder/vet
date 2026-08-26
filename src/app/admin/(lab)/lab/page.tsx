import { format } from "date-fns";
import { FlaskConical } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { EmptyState } from "@/components/states/empty-state";
import { ErrorState } from "@/components/states/error-state";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { ACCESS } from "@/features/auth/access";
import { requireRole } from "@/features/auth/session";
import { listOpenDiagnosticsQueue } from "@/features/soap/queries";

export const metadata: Metadata = { title: "Lab · TV Care" };

const STATUS_LABEL: Record<string, string> = {
  ordered: "Ordered",
  in_progress: "In progress",
  completed: "Completed",
};

/**
 * The lab's own queue: every test a doctor has ordered and nobody has
 * completed, oldest first — the same list /doctor/diagnostics shows, reached
 * by the people who actually run the tests.
 *
 * Read-only for now. Recording a result is done from the patient's own
 * diagnostics tab; a lab user reaching that is the next piece of this work.
 * Ordering a test is not here at all and will not be: that is a clinical
 * decision, and row level security refuses a lab user's insert
 * (20260917000100_staff_roles.sql) whatever this page offers.
 */
export default async function AdminLabQueuePage() {
  await requireRole(...ACCESS.lab);

  const result = await listOpenDiagnosticsQueue();

  return (
    <div className="grid gap-6">
      <div className="grid gap-1">
        <h1>Lab</h1>
        <p className="text-muted-foreground">Tests waiting on a result, oldest first.</p>
      </div>

      <Card>
        <CardContent>
          {result.status === "error" ? (
            <ErrorState title="The lab queue could not be loaded" />
          ) : result.data.length === 0 ? (
            <EmptyState
              icon={FlaskConical}
              title="Nothing waiting"
              description="Every ordered test has a result. New tests appear here as doctors order them."
            />
          ) : (
            <ul className="divide-border grid divide-y">
              {result.data.map((test) => (
                <li key={test.id}>
                  <Link
                    href={`/admin/patients/${test.petId}/diagnostics`}
                    className="hover:bg-muted/50 focus-visible:ring-ring -mx-2 flex min-h-11 items-center gap-4 rounded-lg px-2 py-3 transition-colors focus-visible:ring-2 focus-visible:outline-none"
                  >
                    <div className="grid flex-1 gap-0.5">
                      <span className="text-sm font-medium">
                        {test.testName} · {test.petName}
                      </span>
                      <span className="text-muted-foreground text-sm" data-numeric>
                        Ordered {format(new Date(test.orderedAt), "d MMM yyyy")}
                      </span>
                    </div>
                    <Badge variant="secondary">{STATUS_LABEL[test.status] ?? test.status}</Badge>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
