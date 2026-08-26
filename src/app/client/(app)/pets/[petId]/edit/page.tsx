import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PetForm } from "@/components/pets/pet-form";
import { ErrorState } from "@/components/states/error-state";
import { Card, CardContent } from "@/components/ui/card";
import { requireRole } from "@/features/auth/session";
import { updatePetAction } from "@/features/pets/actions";
import { getPet, listBreeds, listSpecies } from "@/features/pets/queries";

export const metadata: Metadata = { title: "Edit pet · TV Care" };

export default async function EditPetPage({ params }: PageProps<"/client/pets/[petId]/edit">) {
  await requireRole("client");
  const { petId } = await params;

  const result = await getPet(petId);

  if (result.status === "error") {
    return (
      <Card>
        <CardContent>
          <ErrorState title="This pet could not be loaded" />
        </CardContent>
      </Card>
    );
  }

  // Policies return nothing for a patient this person may not reach, which is
  // indistinguishable from one that does not exist — as it should be.
  if (!result.data) {
    notFound();
  }

  const [species, breeds] = await Promise.all([listSpecies(), listBreeds()]);

  return (
    <div className="mx-auto grid w-full max-w-xl gap-6">
      <div className="grid gap-1">
        <h1>Edit {result.data.name}</h1>
        <p className="text-muted-foreground">
          <Link href="/client/pets" className="underline underline-offset-4">
            Back to my pets
          </Link>
        </p>
      </div>

      <PetForm
        action={updatePetAction}
        species={species}
        breeds={breeds}
        pet={result.data}
        submitLabel="Save changes"
      />
    </div>
  );
}
