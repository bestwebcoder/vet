import { CalendarPlus, PawPrint, Pencil } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

import { PetTabNav } from "@/components/pets/pet-tab-nav";
import { buttonVariants } from "@/components/ui/button";
import type { PetDetail } from "@/features/pets/queries";

/**
 * The patient record frame, shared by the client portal and the clinic views.
 *
 * One implementation so a patient cannot appear to be two different animals
 * depending on who is looking.
 */
export function PetRecordFrame({
  pet,
  photoUrl,
  basePath,
  children,
}: {
  pet: PetDetail;
  photoUrl: string | null;
  basePath: string;
  children: React.ReactNode;
}) {
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
          href={`/${basePath.split("/")[1]}/appointments/new?petId=${pet.id}`}
          className={buttonVariants({ variant: "outline", size: "touch" })}
        >
          <CalendarPlus aria-hidden />
          Book appointment
        </Link>

        <Link
          href={`${basePath}/edit`}
          className={buttonVariants({ variant: "outline", size: "touch" })}
        >
          <Pencil aria-hidden />
          Edit
        </Link>
      </div>

      <PetTabNav basePath={basePath} />

      {children}
    </div>
  );
}
