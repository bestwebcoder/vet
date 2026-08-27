import { format } from "date-fns";
import { Worm } from "lucide-react";
import type { Metadata } from "next";

import { Pagination } from "@/components/search/pagination";
import { EmptyState } from "@/components/states/empty-state";
import { ErrorState } from "@/components/states/error-state";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { requireRole } from "@/features/auth/session";
import { getOwnClientRecord } from "@/features/clients/queries";
import { listPets } from "@/features/pets/queries";
import { listDewormingForPet } from "@/features/deworming/queries";
import { dueStatusBadgeVariant, getDueInfo } from "@/lib/due-window";

export const metadata: Metadata = { title: "Deworming · TV Care" };

/** Long enough to scan, short enough to render on a phone. */
const PAGE_SIZE = 25;

export default async function ClientDewormingPage({ searchParams }: PageProps<"/client/deworming">) {
  await requireRole("client");

  const { page: pageParam } = await searchParams;
  const page = typeof pageParam === "string" ? Math.max(1, Number(pageParam) || 1) : 1;

  const client = await getOwnClientRecord();

  if (client.status === "error" || !client.data) {
    return (
      <Card>
        <CardContent>
          <ErrorState
            title="We could not load your pets' deworming records"
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

  const byPet = await Promise.all(pets.data.map((pet) => listDewormingForPet(pet.id)));

  const records = pets.data
    .flatMap((pet, index) => {
      const result = byPet[index];
      if (result.status !== "ok") return [];
      return result.data.map((record) => ({ pet, record }));
    })
    .sort((a, b) => b.record.dateAdministered.localeCompare(a.record.dateAdministered));

  const total = records.length;
  // A page beyond the end is clamped to the last one rather than rendered
  // blank: with a single page of results the control hides itself, so an
  // out-of-range ?page would otherwise be a dead end with no way back.
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const start = (currentPage - 1) * PAGE_SIZE;
  const visible = records.slice(start, start + PAGE_SIZE);

  return (
    <div className="grid gap-6">
      <h1>Deworming</h1>

      {records.length === 0 ? (
        <Card>
          <CardContent className="grid gap-4">
            <EmptyState icon={Worm} title="No deworming yet" description="Deworming recorded for your pets will appear here." />
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {visible.map(({ pet, record }) => {
            const due = getDueInfo(record.nextDueDate);
            return (
              <Card key={record.id}>
                <CardContent className="grid gap-1">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="font-medium">
                      {pet.name} · {record.product}
                    </p>
                    <Badge variant={dueStatusBadgeVariant(due.status)}>{due.label}</Badge>
                  </div>
                  <p className="text-muted-foreground text-sm" data-numeric>
                    Given {format(new Date(`${record.dateAdministered}T00:00:00`), "d MMM yyyy")}
                  </p>
                  <Pagination
            basePath="/client/deworming"
            searchParams={{}}
            page={currentPage}
            pageSize={PAGE_SIZE}
            totalCount={total}
          />
        </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
