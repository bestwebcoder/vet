import { Worm } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { EmptyState } from "@/components/states/empty-state";
import { ErrorState } from "@/components/states/error-state";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { requireRole } from "@/features/auth/session";
import { listPracticeDewormingStatuses } from "@/features/deworming/queries";
import { dueStatusBadgeVariant, getDueInfo } from "@/lib/due-window";

export const metadata: Metadata = { title: "Deworming · TV Care" };

export default async function AdminDewormingPage() {
  await requireRole("admin", "super_admin");

  const result = await listPracticeDewormingStatuses();

  const dueThisWeek =
    result.status === "ok"
      ? result.data
          .map((row) => ({ ...row, due: getDueInfo(row.nextDueDate) }))
          .filter((row) => ["due_in_7", "due_today", "overdue"].includes(row.due.status))
          .sort((a, b) => (a.due.daysUntil ?? 0) - (b.due.daysUntil ?? 0))
      : [];

  return (
    <div className="grid gap-6">
      <div className="grid gap-1">
        <h1>Deworming</h1>
        <p className="text-muted-foreground">Patients due or overdue for deworming this week.</p>
      </div>

      <Card>
        <CardContent>
          {result.status === "error" ? (
            <ErrorState title="Deworming records could not be loaded" />
          ) : dueThisWeek.length === 0 ? (
            <EmptyState icon={Worm} title="Nothing due this week" description="No patient is due or overdue for deworming." />
          ) : (
            <ul className="divide-border grid divide-y">
              {dueThisWeek.map((row) => (
                <li key={row.petId}>
                  <Link
                    href={`/admin/patients/${row.petId}/deworming`}
                    className="hover:bg-muted/50 focus-visible:ring-ring -mx-2 flex min-h-11 items-center gap-4 rounded-lg px-2 py-3 transition-colors focus-visible:ring-2 focus-visible:outline-none"
                  >
                    <div className="grid flex-1 gap-0.5">
                      <span className="text-sm font-medium">{row.petName}</span>
                      <span className="text-muted-foreground text-sm">{row.product}</span>
                    </div>
                    <Badge variant={dueStatusBadgeVariant(row.due.status)}>{row.due.label}</Badge>
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
