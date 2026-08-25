import { PawPrint } from "lucide-react";
import Link from "next/link";

import { EmptyState } from "@/components/states/empty-state";
import { Badge } from "@/components/ui/badge";
import type { PetDetail } from "@/features/pets/queries";

const SEX_LABEL: Record<string, string> = {
  male: "Male",
  female: "Female",
  unknown: "Sex not recorded",
};

/** A list of patients for clinic staff, with the owner alongside each animal. */
export function PatientList({
  pets,
  basePath,
  ownerNames,
  search,
}: {
  pets: PetDetail[];
  basePath: string;
  /** Owner name by client id, so the list reads as a person's animal. */
  ownerNames: Record<string, string>;
  search?: string;
}) {
  if (pets.length === 0) {
    return (
      <EmptyState
        icon={PawPrint}
        title={search ? `No patients match “${search}”` : "No patients yet"}
        description={
          search
            ? "Try the patient's name, the owner's name, a mobile number, or a microchip number."
            : "Patients appear here once a client has registered one."
        }
      />
    );
  }

  return (
    <ul className="divide-border grid divide-y">
      {pets.map((pet) => (
        <li key={pet.id}>
          <Link
            href={`${basePath}/${pet.id}`}
            className="hover:bg-muted/50 focus-visible:ring-ring -mx-2 flex min-h-11 items-center gap-4 rounded-lg px-2 py-3 transition-colors focus-visible:ring-2 focus-visible:outline-none"
          >
            <div className="grid flex-1 gap-0.5">
              <span className="flex items-center gap-2 text-sm font-medium">
                {pet.name}
                {!pet.isActive ? <Badge variant="destructive">Archived</Badge> : null}
              </span>
              <span className="text-muted-foreground text-sm">
                {[pet.speciesName, pet.breedName].filter(Boolean).join(" · ") ||
                  "Species not recorded"}
                {" • "}
                {SEX_LABEL[pet.sex] ?? SEX_LABEL.unknown}
                {" • "}
                {pet.age}
              </span>
              <span className="text-muted-foreground text-sm">
                {ownerNames[pet.clientId] ?? "Owner not available"}
              </span>
            </div>

            {pet.weight ? (
              <span className="text-muted-foreground shrink-0 text-sm" data-numeric>
                {pet.weight}
              </span>
            ) : null}
          </Link>
        </li>
      ))}
    </ul>
  );
}
