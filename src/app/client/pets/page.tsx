import { PawPrint, Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { PetCard } from "@/components/pets/pet-card";
import { EmptyState } from "@/components/states/empty-state";
import { ErrorState } from "@/components/states/error-state";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { requireRole } from "@/features/auth/session";
import { listPets, signedPhotoUrl } from "@/features/pets/queries";

export const metadata: Metadata = { title: "My pets · TV Care" };

export default async function ClientPetsPage() {
  await requireRole("client");
  const result = await listPets();

  const photos =
    result.status === "ok"
      ? await Promise.all(result.data.map((pet) => signedPhotoUrl(pet.photoPath)))
      : [];

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
          <CardContent>
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
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {result.data.map((pet, index) => (
            <PetCard
              key={pet.id}
              pet={pet}
              photoUrl={photos[index] ?? null}
              href={`/client/pets/${pet.id}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
