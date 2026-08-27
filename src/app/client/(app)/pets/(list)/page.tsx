import { PawPrint, Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { PetCard } from "@/components/pets/pet-card";
import { Pagination } from "@/components/search/pagination";
import { EmptyState } from "@/components/states/empty-state";
import { ErrorState } from "@/components/states/error-state";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { requireRole } from "@/features/auth/session";
import { listPets, signedPhotoUrl } from "@/features/pets/queries";
import { listPetDewormingStatuses } from "@/features/deworming/queries";
import { listPetVaccinationStatuses } from "@/features/vaccinations/queries";

export const metadata: Metadata = { title: "My pets · TV Care" };

/** Long enough to scan, short enough to render on a phone. */
const PAGE_SIZE = 25;

export default async function ClientPetsPage({ searchParams }: PageProps<"/client/pets">) {
  await requireRole("client");

  const { page: pageParam } = await searchParams;
  const page = typeof pageParam === "string" ? Math.max(1, Number(pageParam) || 1) : 1;
  const result = await listPets();

  const petIds = result.status === "ok" ? result.data.map((pet) => pet.id) : [];

  const [photos, vaccinationResult, dewormingResult] = await Promise.all([
    result.status === "ok" ? Promise.all(result.data.map((pet) => signedPhotoUrl(pet.photoPath))) : Promise.resolve([]),
    listPetVaccinationStatuses(petIds),
    listPetDewormingStatuses(petIds),
  ]);

  const vaccinationByPet = new Map(
    (vaccinationResult.status === "ok" ? vaccinationResult.data : []).map((row) => [row.petId, row]),
  );
  const dewormingByPet = new Map(
    (dewormingResult.status === "ok" ? dewormingResult.data : []).map((row) => [row.petId, row]),
  );

  const total = result.status === "ok" ? result.data.length : 0;
  // A page beyond the end is clamped to the last one rather than rendered
  // blank: with a single page of results the control hides itself, so an
  // out-of-range ?page would otherwise be a dead end with no way back.
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const start = (currentPage - 1) * PAGE_SIZE;
  const visible = result.status === "ok" ? result.data.slice(start, start + PAGE_SIZE) : [];

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="grid gap-1">
          <h1>My pets</h1>
          <p className="text-muted-foreground">Everyone in your care at The Traveling Vet.</p>
        </div>

        <Link
          href="/client/pets/new"
          className={buttonVariants({ size: "touch", className: "w-full sm:w-auto" })}
        >
          <Plus aria-hidden />
          Add a pet
        </Link>
      </div>

      {result.status === "error" ? (
        <Card>
          <CardContent>
            <ErrorState
              title="Your pets could not be loaded"
              description="Please try again in a moment. Their records are unaffected."
            />
          </CardContent>
        </Card>
      ) : result.data.length === 0 ? (
        <Card>
          <CardContent className="grid gap-4">
            <EmptyState
              icon={PawPrint}
              title="No pets yet"
              description="Add your pet to keep their records, prescriptions and vaccinations in one place."
              action={
                <Link
                  href="/client/pets/new"
                  className={buttonVariants({ size: "touch", className: "w-full" })}
                >
                  Add a pet
                </Link>
              }
            />
            <Pagination
            basePath="/client/pets"
            searchParams={{}}
            page={currentPage}
            pageSize={PAGE_SIZE}
            totalCount={total}
          />
        </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {visible.map((pet, index) => (
            <PetCard
              key={pet.id}
              pet={pet}
              photoUrl={photos[index] ?? null}
              href={`/client/pets/${pet.id}`}
              nextVaccination={vaccinationByPet.get(pet.id) ?? null}
              nextDeworming={dewormingByPet.get(pet.id) ?? null}
            />
          ))}
        </div>
      )}
    </div>
  );
}
