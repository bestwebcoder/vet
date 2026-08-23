import { Syringe } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { EmptyState } from "@/components/states/empty-state";
import { ErrorState } from "@/components/states/error-state";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { requireRole } from "@/features/auth/session";
import { listPracticeVaccinationStatuses } from "@/features/vaccinations/queries";
import { dueStatusBadgeVariant, getDueInfo } from "@/lib/due-window";

export const metadata: Metadata = { title: "Vaccinations · TV Care" };

export default async function DoctorVaccinationsPage() {
  await requireRole("doctor");

  const result = await listPracticeVaccinationStatuses();

  const due =
    result.status === "ok"
      ? result.data
          .map((row) => ({ ...row, due: getDueInfo(row.nextDueDate) }))
          .filter((row) => row.due.status !== "none" && row.due.status !== "upcoming")
          .sort((a, b) => (a.due.daysUntil ?? 0) - (b.due.daysUntil ?? 0))
      : [];

  return (
    <div className="grid gap-6">
      <div className="grid gap-1">
        <h1>Vaccinations</h1>
        <p className="text-muted-foreground">Patients due or overdue for their next vaccination, soonest first.</p>
      </div>

      <Card>
        <CardContent>
          {result.status === "error" ? (
            <ErrorState title="Vaccinations could not be loaded" />
          ) : due.length === 0 ? (
            <EmptyState icon={Syringe} title="Nothing due" description="No patient is due for a vaccination in the next 30 days." />
          ) : (
            <ul className="divide-border grid divide-y">
              {due.map((row) => (
                <li key={row.petId}>
                  <Link
                    href={`/doctor/patients/${row.petId}/vaccinations`}
                    className="hover:bg-muted/50 focus-visible:ring-ring -mx-2 flex min-h-11 items-center gap-4 rounded-lg px-2 py-3 transition-colors focus-visible:ring-2 focus-visible:outline-none"
                  >
                    <div className="grid flex-1 gap-0.5">
                      <span className="text-sm font-medium">{row.petName}</span>
                      <span className="text-muted-foreground text-sm">{row.vaccineName}</span>
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
