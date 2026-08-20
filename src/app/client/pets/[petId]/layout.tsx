import { PawPrint, Pencil } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PetTabNav } from "@/components/pets/pet-tab-nav";
import { buttonVariants } from "@/components/ui/button";
import { requireRole } from "@/features/auth/session";
import { getPet, signedPhotoUrl } from "@/features/pets/queries";

/**
 * The patient record frame: who this is, and the nine tabs of their history.
 *
 * Loading the patient here means every tab inherits the same access decision,
 * so no tab can accidentally render for someone who may not see the patient.
 */
export default async function PetLayout({ children, params }: LayoutProps<"/client/pets/[petId]">) {
  await requireRole("client");
  const { petId } = await params;

  const result = await getPet(petId);

  // A patient the policies do not return is indistinguishable from one that
  // does not exist, which is the correct answer to give.
  if (result.status === "error" || !result.data) {
    notFound();
  }

  const pet = result.data;
  const photoUrl = await signedPhotoUrl(pet.photoPath);

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-start gap-4">
        <span className="bg-secondary text-secondary-foreground relative flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-lg">
          {photoUrl ? (
            <Image src={photoUrl} alt="" fill sizes="64px" className="object-cover" />
          ) : (
            <PawPrint className="size-7" aria-hidden />
          )}
        </span>

        <div className="grid flex-1 gap-1">
          <h1>{pet.name}</h1>
          <p className="text-muted-foreground">
            {[pet.speciesName, pet.breedName].filter(Boolean).join(" · ") ||
              "Species not recorded"}{" "}
            • {pet.age}
          </p>
        </div>

        <Link
          href={`/client/pets/${pet.id}/edit`}
          className={buttonVariants({ variant: "outline", size: "touch" })}
        >
          <Pencil aria-hidden />
          Edit
        </Link>
      </div>

      <PetTabNav basePath={`/client/pets/${pet.id}`} />

      {children}
    </div>
  );
}
