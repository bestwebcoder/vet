import type { Metadata } from "next";

import { PetDocuments } from "@/components/documents/pet-documents";
import { requireRole } from "@/features/auth/session";

export const metadata: Metadata = { title: "Documents · TV Care" };

export default async function DoctorPatientDocumentsPage({
  params,
}: PageProps<"/doctor/patients/[petId]/documents">) {
  await requireRole("doctor");
  const { petId } = await params;

  return <PetDocuments petId={petId} audience="clinic" />;
}
