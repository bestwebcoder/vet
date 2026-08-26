import { Syringe } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { VaccinationScheduleManager } from "@/components/vaccination-schedules/schedule-form";
import { Pagination } from "@/components/search/pagination";
import { EmptyState } from "@/components/states/empty-state";
import { ErrorState } from "@/components/states/error-state";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ACCESS } from "@/features/auth/access";
import { requireRole } from "@/features/auth/session";
import { listSpecies } from "@/features/pets/queries";
import { listAllSchedules } from "@/features/vaccination-schedules/queries";
import { listPracticeVaccinationStatuses } from "@/features/vaccinations/queries";
import { dueStatusBadgeVariant, getDueInfo } from "@/lib/due-window";

export const metadata: Metadata = { title: "Vaccinations · TV Care" };

const PAGE_SIZE = 25;

export default async function AdminVaccinationsPage({ searchParams }: PageProps<"/admin/vaccinations">) {
  await requireRole(...ACCESS.reception);

  const { page: pageParam } = await searchParams;
  const page = typeof pageParam === "string" ? Number(pageParam) || 1 : 1;

  const [schedulesResult, species, statusResult] = await Promise.all([
    listAllSchedules(),
    listSpecies(),
    listPracticeVaccinationStatuses(),
  ]);

  const allDueToday =
    statusResult.status === "ok"
      ? statusResult.data
          .map((row) => ({ ...row, due: getDueInfo(row.nextDueDate) }))
          .filter((row) => row.due.status === "due_today" || row.due.status === "overdue")
          .sort((a, b) => (a.due.daysUntil ?? 0) - (b.due.daysUntil ?? 0))
      : [];

  const start = (page - 1) * PAGE_SIZE;
  const dueToday = allDueToday.slice(start, start + PAGE_SIZE);

  return (
    <div className="grid gap-6">
      <div className="grid gap-1">
        <h1>Vaccinations</h1>
        <p className="text-muted-foreground">Configure the practice&apos;s vaccination schedules and see who is due today.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Due today</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          {statusResult.status === "error" ? (
            <ErrorState title="Due vaccinations could not be loaded" />
          ) : allDueToday.length === 0 ? (
            <EmptyState icon={Syringe} title="Nothing due today" description="No patient is due or overdue for a vaccination." />
          ) : (
            <>
              <ul className="divide-border grid divide-y">
                {dueToday.map((row) => (
                  <li key={row.petId}>
                    <Link
                      href={`/admin/patients/${row.petId}/vaccinations`}
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
              <Pagination
                basePath="/admin/vaccinations"
                searchParams={{}}
                page={page}
                pageSize={PAGE_SIZE}
                totalCount={allDueToday.length}
              />
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Vaccination schedules</CardTitle>
        </CardHeader>
        <CardContent>
          {schedulesResult.status === "error" ? (
            <ErrorState title="Schedules could not be loaded" />
          ) : (
            <VaccinationScheduleManager schedules={schedulesResult.data} species={species} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
