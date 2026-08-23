import { format } from "date-fns";
import { ClipboardList } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { EmptyState } from "@/components/states/empty-state";
import { ErrorState } from "@/components/states/error-state";
import { Card, CardContent } from "@/components/ui/card";
import { requireRole } from "@/features/auth/session";
import { getOwnClientRecord } from "@/features/clients/queries";
import { listPets } from "@/features/pets/queries";
import { listSoapRecordsForPet } from "@/features/soap/queries";

export const metadata: Metadata = { title: "Medical records · TV Care" };

export default async function ClientRecordsPage() {
  await requireRole("client");

  const client = await getOwnClientRecord();

  if (client.status === "error" || !client.data) {
    return (
      <Card>
        <CardContent>
          <ErrorState
            title="We could not load your records"
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

  const recordsByPet = await Promise.all(pets.data.map((pet) => listSoapRecordsForPet(pet.id)));

  const records = pets.data
    .flatMap((pet, index) => {
      const result = recordsByPet[index];
      if (result.status !== "ok") return [];
      return result.data.map((record) => ({ pet, record }));
    })
    .sort((a, b) => b.record.createdAt.localeCompare(a.record.createdAt));

  return (
    <div className="grid gap-6">
      <h1>Medical records</h1>

      <Card>
        <CardContent>
          {records.length === 0 ? (
            <EmptyState
              icon={ClipboardList}
              title="No records yet"
              description="Finalized visit records for your pets will appear here."
            />
          ) : (
            <ul className="divide-border grid divide-y">
              {records.map(({ pet, record }) => (
                <li key={record.id}>
                  <Link
                    href={`/client/pets/${pet.id}/visits/${record.id}`}
                    className="hover:bg-muted/50 focus-visible:ring-ring -mx-2 flex min-h-11 items-center gap-4 rounded-lg px-2 py-3 transition-colors focus-visible:ring-2 focus-visible:outline-none"
                  >
                    <div className="grid flex-1 gap-0.5">
                      <span className="text-sm font-medium">{pet.name}</span>
                      <span className="text-muted-foreground text-sm">
                        {record.chiefComplaint ?? "Visit record"}
                      </span>
                    </div>
                    <span className="text-muted-foreground text-xs" data-numeric>
                      {format(new Date(record.createdAt), "d MMM yyyy")}
                    </span>
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
