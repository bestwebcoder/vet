import { format } from "date-fns";
import { Syringe } from "lucide-react";
import Link from "next/link";

import { EmptyState } from "@/components/states/empty-state";
import { ErrorState } from "@/components/states/error-state";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { listVaccinationsForPet } from "@/features/vaccinations/queries";
import { dueStatusBadgeVariant, getDueInfo } from "@/lib/due-window";

/**
 * A pet's full vaccination history, newest first. Doctor and admin views
 * link back to the visit a record was made on — vaccinations are edited
 * from the appointment, same as diagnoses/diagnostics (Phase 4). The client
 * view is read-only.
 */
export async function PetVaccinationSummary({ petId, editable = false }: { petId: string; editable?: boolean }) {
  const result = await listVaccinationsForPet(petId);

  if (result.status === "error") {
    return (
      <Card>
        <CardContent>
          <ErrorState title="Vaccinations could not be loaded" />
        </CardContent>
      </Card>
    );
  }

  if (result.data.length === 0) {
    return (
      <Card>
        <CardContent>
          <EmptyState
            icon={Syringe}
            title="No vaccinations recorded yet"
            description="Vaccinations recorded during a visit will appear here, along with when the next one is due."
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="grid gap-3">
        {result.data.map((record) => {
          const due = getDueInfo(record.nextDueDate);
          const content = (
            <div className="grid gap-1 rounded-lg border p-3 text-sm">
              <div className="flex items-center justify-between gap-3">
                <span className="font-medium">{record.vaccineName}</span>
                {record.nextDueDate ? <Badge variant={dueStatusBadgeVariant(due.status)}>{due.label}</Badge> : null}
              </div>
              <span className="text-muted-foreground text-xs" data-numeric>
                Given {format(new Date(`${record.dateAdministered}T00:00:00`), "d MMM yyyy")}
                {record.manufacturer ? ` · ${record.manufacturer}` : ""}
              </span>
              {record.notes ? <p className="text-sm">{record.notes}</p> : null}
            </div>
          );

          return editable ? (
            <Link key={record.id} href={`/doctor/appointments/${record.appointmentId}/vaccinations`} className="focus-visible:ring-ring rounded-lg focus-visible:ring-2 focus-visible:outline-none">
              {content}
            </Link>
          ) : (
            <div key={record.id}>{content}</div>
          );
        })}
      </CardContent>
    </Card>
  );
}
