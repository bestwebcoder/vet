import { Hammer } from "lucide-react";
import { notFound } from "next/navigation";

import { findPetTab } from "@/components/pets/pet-tabs";
import { EmptyState } from "@/components/states/empty-state";
import { Card, CardContent } from "@/components/ui/card";
import { requireRole } from "@/features/auth/session";

/**
 * The tabs a later phase fills in.
 *
 * A tab that is part of the record but not yet built says so; anything that is
 * not a tab at all is a genuine 404, so this does not turn a typo into a
 * friendly page.
 */
export default async function PetTabPlaceholderPage({
  params,
}: PageProps<"/client/pets/[petId]/[...tab]">) {
  await requireRole("client");
  const { tab } = await params;

  const definition = tab.length === 1 ? findPetTab(tab[0]) : undefined;

  if (!definition || !definition.phase) {
    notFound();
  }

  return (
    <Card>
      <CardContent>
        <EmptyState
          icon={Hammer}
          title={`${definition.label} is not available yet`}
          description="This part of the record is still being built. Nothing here is a placeholder for real clinical data."
        />
      </CardContent>
    </Card>
  );
}
