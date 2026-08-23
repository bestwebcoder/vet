import { format } from "date-fns";
import { Syringe } from "lucide-react";
import type { Metadata } from "next";

import { EmptyState } from "@/components/states/empty-state";
import { ErrorState } from "@/components/states/error-state";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { requireRole } from "@/features/auth/session";
import { getOwnClientRecord } from "@/features/clients/queries";
import { listPets } from "@/features/pets/queries";
import { listVaccinationsForPet } from "@/features/vaccinations/queries";
import { dueStatusBadgeVariant, getDueInfo } from "@/lib/due-window";

export const metadata: Metadata = { title: "Vaccinations · TV Care" };

export default async function ClientVaccinationsPage() {
  await requireRole("client");

  const client = await getOwnClientRecord();

  if (client.status === "error" || !client.data) {
    return (
      <Card>
        <CardContent>
          <ErrorState
            title="We could not load your pets' vaccinations"
            description="Your client record could not be found. Please contact your clinic."
          />
        </CardContent>
      </Card>
    );
  }

  const pets = await listPets({ clientId: client.data.id });
  if (pets.status === "error") {
    return (
      <Card>
        <CardContent>
          <ErrorState title="Your pets could not be loaded" />
        </CardContent>
      </Card>
    );
  }

  const byPet = await Promise.all(pets.data.map((pet) => listVaccinationsForPet(pet.id)));

  const records = pets.data
    .flatMap((pet, index) => {
      const result = byPet[index];
      if (result.status !== "ok") return [];
      return result.data.map((record) => ({ pet, record }));
    })
    .sort((a, b) => b.record.dateAdministered.localeCompare(a.record.dateAdministered));

  return (
    <div className="grid gap-6">
      <h1>Vaccinations</h1>

      {records.length === 0 ? (
        <Card>
          <CardContent>
            <EmptyState icon={Syringe} title="No vaccinations yet" description="Vaccinations recorded for your pets will appear here." />
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {records.map(({ pet, record }) => {
            const due = getDueInfo(record.nextDueDate);
            return (
              <Card key={record.id}>
                <CardContent className="grid gap-1">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="font-medium">
                      {pet.name} · {record.vaccineName}
                    </p>
                    {record.nextDueDate ? <Badge variant={dueStatusBadgeVariant(due.status)}>{due.label}</Badge> : null}
                  </div>
                  <p className="text-muted-foreground text-sm" data-numeric>
                    Given {format(new Date(`${record.dateAdministered}T00:00:00`), "d MMM yyyy")}
                    {record.manufacturer ? ` · ${record.manufacturer}` : ""}
                  </p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
