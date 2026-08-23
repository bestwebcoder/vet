import { format } from "date-fns";
import { Worm } from "lucide-react";
import Link from "next/link";

import { EmptyState } from "@/components/states/empty-state";
import { ErrorState } from "@/components/states/error-state";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { listDewormingForPet } from "@/features/deworming/queries";
import { dueStatusBadgeVariant, getDueInfo } from "@/lib/due-window";
import { DEWORMING_INTERVAL_LABELS } from "@/lib/deworming-interval";

/**
 * A pet's full deworming history, newest first. Same shape as
 * PetVaccinationSummary — doctor/admin link back to the visit, client is
 * read-only.
 */
export async function PetDewormingSummary({ petId, editable = false }: { petId: string; editable?: boolean }) {
  const result = await listDewormingForPet(petId);

  if (result.status === "error") {
    return (
      <Card>
        <CardContent>
          <ErrorState title="Deworming records could not be loaded" />
        </CardContent>
      </Card>
    );
  }

  if (result.data.length === 0) {
    return (
      <Card>
        <CardContent>
          <EmptyState
            icon={Worm}
            title="No deworming recorded yet"
            description="Deworming recorded during a visit will appear here, along with when the next one is due."
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
                <span className="font-medium">{record.product}</span>
                <Badge variant={dueStatusBadgeVariant(due.status)}>{due.label}</Badge>
              </div>
              <span className="text-muted-foreground text-xs" data-numeric>
                Given {format(new Date(`${record.dateAdministered}T00:00:00`), "d MMM yyyy")} ·{" "}
                {DEWORMING_INTERVAL_LABELS[record.interval]}
                {record.weight ? ` · ${record.weight}` : ""}
              </span>
              {record.notes ? <p className="text-sm">{record.notes}</p> : null}
            </div>
          );

          return editable ? (
            <Link key={record.id} href={`/doctor/appointments/${record.appointmentId}/deworming`} className="focus-visible:ring-ring rounded-lg focus-visible:ring-2 focus-visible:outline-none">
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
