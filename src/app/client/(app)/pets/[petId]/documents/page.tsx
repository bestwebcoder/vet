import type { Metadata } from "next";

import { PetDocuments } from "@/components/documents/pet-documents";
import { requireRole } from "@/features/auth/session";

export const metadata: Metadata = { title: "Documents · TV Care" };

export default async function PetDocumentsPage({
  params,
}: PageProps<"/client/pets/[petId]/documents">) {
  await requireRole("client");
  const { petId } = await params;

  return <PetDocuments petId={petId} audience="client" />;
}
