import type { Metadata } from "next";
import Link from "next/link";

import { PetForm } from "@/components/pets/pet-form";
import { requireRole } from "@/features/auth/session";
import { createPetAction } from "@/features/pets/actions";
import { listBreeds, listSpecies } from "@/features/pets/queries";

export const metadata: Metadata = { title: "Add a pet · TV Care" };

export default async function NewPetPage() {
  await requireRole("client");

  const [species, breeds] = await Promise.all([listSpecies(), listBreeds()]);

  return (
    <div className="mx-auto grid w-full max-w-xl gap-6">
      <div className="grid gap-1">
        <h1>Add a pet</h1>
        <p className="text-muted-foreground">
          <Link href="/client/pets" className="underline underline-offset-4">
            Back to my pets
          </Link>
        </p>
      </div>

      <PetForm
        action={createPetAction}
        species={species}
        breeds={breeds}
        recordHrefBase="/client/pets"
        submitLabel="Add pet"
      />
    </div>
  );
}
