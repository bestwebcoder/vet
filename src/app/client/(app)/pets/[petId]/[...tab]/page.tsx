import { notFound } from "next/navigation";

import { PetTabPlaceholder } from "@/components/pets/pet-tab-placeholder";
import { findPetTab } from "@/components/pets/pet-tabs";
import { requireRole } from "@/features/auth/session";

export default async function PetTabPlaceholderPage({
  params,
}: PageProps<"/client/pets/[petId]/[...tab]">) {
  await requireRole("client");
  const { tab } = await params;

  const definition = tab.length === 1 ? findPetTab(tab[0]) : undefined;

  // A tab that is part of the record but unbuilt explains itself; anything
  // that is not a tab at all is a genuine 404.
  if (!definition || !definition.phase) {
    notFound();
  }

  return <PetTabPlaceholder tab={definition} />;
}
