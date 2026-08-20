import type { Metadata } from "next";

import { PetDocuments } from "@/components/documents/pet-documents";
import { requireRole } from "@/features/auth/session";

export const metadata: Metadata = { title: "Documents · TV Care" };

export default async function AdminPatientDocumentsPage({
  params,
}: PageProps<"/admin/patients/[petId]/documents">) {
  await requireRole("admin", "super_admin");
  const { petId } = await params;

  return <PetDocuments petId={petId} audience="clinic" />;
}
