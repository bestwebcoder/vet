import { notFound } from "next/navigation";

import { PetRecordFrame } from "@/components/pets/pet-record-frame";
import { requireRole } from "@/features/auth/session";
import { getPet, signedPhotoUrl } from "@/features/pets/queries";

/**
 * Loading the patient here means every tab inherits the same access decision.
 */
export default async function AdminPatientLayout({
  children,
  params,
}: LayoutProps<"/admin/patients/[petId]">) {
  await requireRole("admin", "super_admin");
  const { petId } = await params;

  const result = await getPet(petId, { includeInactive: true });
  if (result.status === "error" || !result.data) notFound();

  const photoUrl = await signedPhotoUrl(result.data.photoPath);

  return (
    <PetRecordFrame
      pet={result.data}
      photoUrl={photoUrl}
      basePath={`/admin/patients/${result.data.id}`}
      canManage
    >
      {children}
    </PetRecordFrame>
  );
}
