import { notFound } from "next/navigation";

import { PetRecordFrame } from "@/components/pets/pet-record-frame";
import { requireRole } from "@/features/auth/session";
import { getPet, signedPhotoUrl } from "@/features/pets/queries";

/**
 * Loading the patient in the layout means every tab inherits the same access
 * decision, so no tab can render for someone who may not see the patient.
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

  const photoUrl = await signedPhotoUrl(result.data.photoPath);

  return (
    <PetRecordFrame
      pet={result.data}
      photoUrl={photoUrl}
      basePath={`/client/pets/${result.data.id}`}
    >
      {children}
    </PetRecordFrame>
  );
}
