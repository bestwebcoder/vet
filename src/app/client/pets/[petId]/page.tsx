import { notFound } from "next/navigation";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireRole } from "@/features/auth/session";
import { getPet } from "@/features/pets/queries";

const SEX_LABEL: Record<string, string> = {
  male: "Male",
  female: "Female",
  unknown: "Not recorded",
};

function neuteredLabel(value: boolean | null) {
  if (value === null) return "Not recorded";
  return value ? "Yes" : "No";
}

export default async function PetOverviewPage({ params }: PageProps<"/client/pets/[petId]">) {
  await requireRole("client");
  const { petId } = await params;

  const result = await getPet(petId);
  if (result.status === "error" || !result.data) notFound();

  const pet = result.data;

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
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Details</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            {details.map((detail) => (
              <div key={detail.label} className="flex justify-between gap-4 sm:block">
                <dt className="text-muted-foreground sm:mb-0.5">{detail.label}</dt>
                <dd data-numeric={detail.numeric ? "" : undefined} className="text-right sm:text-left">
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

function NoteCard({
  title,
  value,
  empty,
}: {
  title: string;
  value: string | null;
  empty: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {value ? (
          <p className="text-sm whitespace-pre-line">{value}</p>
        ) : (
          // Said plainly rather than left blank: "none recorded" and "none"
          // are different, and a vet needs to know which this is.
          <p className="text-muted-foreground text-sm">{empty}</p>
        )}
      </CardContent>
    </Card>
  );
}
