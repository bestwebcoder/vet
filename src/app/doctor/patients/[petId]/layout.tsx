import { notFound } from "next/navigation";

import { PetRecordFrame } from "@/components/pets/pet-record-frame";
import { requireRole } from "@/features/auth/session";
import { getPet, signedPhotoUrl } from "@/features/pets/queries";

/**
 * Loading the patient here means every tab inherits the same access decision.
 */
export default async function DoctorPatientLayout({
  children,
  params,
}: LayoutProps<"/doctor/patients/[petId]">) {
  await requireRole("doctor");
  const { petId } = await params;

  const result = await getPet(petId);
  if (result.status === "error" || !result.data) notFound();

  const photoUrl = await signedPhotoUrl(result.data.photoPath);

  return (
    <PetRecordFrame
      pet={result.data}
      photoUrl={photoUrl}
      basePath={`/doctor/patients/${result.data.id}`}
    >
      {children}
    </PetRecordFrame>
  );
}
