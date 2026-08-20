import { PawPrint } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

import type { PetDetail } from "@/features/pets/queries";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const SEX_LABEL: Record<string, string> = {
  male: "Male",
  female: "Female",
  unknown: "Sex not recorded",
};

/**
 * A patient at a glance, as the brief describes: photo, name, species, breed,
 * sex, age and weight, with the reminder rows that Phase 6 fills in.
 */
export function PetCard({
  pet,
  photoUrl,
  href,
}: {
  pet: PetDetail;
  photoUrl: string | null;
  href: string;
}) {
  return (
    <Card className="hover:border-ring focus-within:border-ring transition-colors">
      <CardContent className="flex gap-4">
        <Link href={href} className="flex flex-1 gap-4 focus:outline-none">
          <span
            className={cn(
              "bg-secondary text-secondary-foreground relative flex size-16 shrink-0",
              "items-center justify-center overflow-hidden rounded-lg",
            )}
          >
            {photoUrl ? (
              <Image src={photoUrl} alt="" fill sizes="64px" className="object-cover" />
            ) : (
              <PawPrint className="size-7" aria-hidden />
            )}
          </span>

          <span className="grid flex-1 gap-1">
            <span className="text-base font-medium">{pet.name}</span>

            <span className="text-muted-foreground text-sm">
              {[pet.speciesName, pet.breedName].filter(Boolean).join(" · ") ||
                "Species not recorded"}
            </span>

            <span className="text-muted-foreground text-sm">
              {SEX_LABEL[pet.sex] ?? SEX_LABEL.unknown} • {pet.age}
              {pet.weight ? (
                <>
                  {" • "}
                  <span data-numeric>{pet.weight}</span>
                </>
              ) : null}
            </span>

            <span className="text-muted-foreground/80 mt-1 grid gap-0.5 text-xs">
              {/* Deliberately shown as unscheduled rather than hidden: an owner
                  should be able to see that nothing is booked. */}
              <span>Next vaccination — not scheduled yet</span>
              <span>Next deworming — not scheduled yet</span>
            </span>
          </span>
        </Link>
      </CardContent>
    </Card>
  );
}
