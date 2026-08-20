import { Hammer } from "lucide-react";

import type { PetTab } from "@/components/pets/pet-tabs";
import { EmptyState } from "@/components/states/empty-state";
import { Card, CardContent } from "@/components/ui/card";

export function PetTabPlaceholder({ tab }: { tab: PetTab }) {
  return (
    <Card>
      <CardContent>
        <EmptyState
          icon={Hammer}
          title={`${tab.label} is not available yet`}
          description="This part of the record is still being built. Nothing here is a placeholder for real clinical data."
        />
      </CardContent>
    </Card>
  );
}
