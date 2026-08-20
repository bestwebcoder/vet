import Link from "next/link";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { PetDetail } from "@/features/pets/queries";

const SEX_LABEL: Record<string, string> = {
  male: "Male",
  female: "Female",
  unknown: "Not recorded",
};

function neuteredLabel(value: boolean | null) {
  if (value === null) return "Not recorded";
  return value ? "Yes" : "No";
}

/**
 * The Overview tab. Every field from §2.4, with anything unrecorded saying so
 * rather than being left blank — a vet needs to tell "no allergies" from
 * "nobody has asked".
 */
export type PetOwnerSummary = {
  name: string;
  phone: string;
  /** Where this owner's record can be opened, if the reader may open it. */
  href: string;
};

export function PetOverview({
  pet,
  owner,
}: {
  pet: PetDetail;
  /** Clinic views show who the animal belongs to; the client portal does not. */
  owner?: PetOwnerSummary;
}) {
  const details: { label: string; value: string; numeric?: boolean }[] = [
    { label: "Species", value: pet.speciesName ?? "Not recorded" },
    { label: "Breed", value: pet.breedName ?? "Mixed or not recorded" },
    { label: "Sex", value: SEX_LABEL[pet.sex] ?? SEX_LABEL.unknown },
    { label: "Neutered or spayed", value: neuteredLabel(pet.isNeutered) },
    {
      label: "Date of birth",
      value: pet.dateOfBirth
        ? `${pet.dateOfBirth}${pet.isDateOfBirthEstimated ? " (estimated)" : ""}`
        : "Not known",
      numeric: Boolean(pet.dateOfBirth),
    },
    { label: "Age", value: pet.age },
    { label: "Weight", value: pet.weight ?? "Not recorded", numeric: Boolean(pet.weight) },
    { label: "Colour", value: pet.colour ?? "Not recorded" },
    {
      label: "Microchip number",
      value: pet.microchipNumber ?? "Not recorded",
      numeric: Boolean(pet.microchipNumber),
    },
  ];

  return (
    <div className="grid gap-6">
      {owner ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Owner</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center justify-between gap-3">
            <div className="grid gap-0.5 text-sm">
              <span className="font-medium">{owner.name}</span>
              <span className="text-muted-foreground" data-numeric>
                {owner.phone}
              </span>
            </div>
            <Link href={owner.href} className="text-sm underline underline-offset-4">
              Open client record
            </Link>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Details</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            {details.map((detail) => (
              <div key={detail.label} className="flex justify-between gap-4 sm:block">
                <dt className="text-muted-foreground sm:mb-0.5">{detail.label}</dt>
                <dd
                  data-numeric={detail.numeric ? "" : undefined}
                  className="text-right sm:text-left"
                >
                  {detail.value}
                </dd>
              </div>
            ))}
          </dl>
        </CardContent>
      </Card>

      <div className="grid gap-6 sm:grid-cols-2">
        <NoteCard title="Allergies" value={pet.allergies} empty="No allergies recorded." />
        <NoteCard
          title="Chronic conditions"
          value={pet.chronicConditions}
          empty="No chronic conditions recorded."
        />
      </div>

      <NoteCard title="Important notes" value={pet.notes} empty="No notes recorded." />
    </div>
  );
}

function NoteCard({ title, value, empty }: { title: string; value: string | null; empty: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {value ? (
          <p className="text-sm whitespace-pre-line">{value}</p>
        ) : (
          <p className="text-muted-foreground text-sm">{empty}</p>
        )}
      </CardContent>
    </Card>
  );
}
