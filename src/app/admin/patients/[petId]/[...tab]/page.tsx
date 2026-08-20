import { notFound } from "next/navigation";

import { PetTabPlaceholder } from "@/components/pets/pet-tab-placeholder";
import { findPetTab } from "@/components/pets/pet-tabs";
import { requireRole } from "@/features/auth/session";

export default async function AdminPatientTabPage({
  params,
}: PageProps<"/admin/patients/[petId]/[...tab]">) {
  await requireRole("admin", "super_admin");
  const { tab } = await params;

  const definition = tab.length === 1 ? findPetTab(tab[0]) : undefined;
  if (!definition || !definition.phase) notFound();

  return <PetTabPlaceholder tab={definition} />;
}
