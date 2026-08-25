"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { archivePetAction, restorePetAction } from "@/features/pets/actions";
import { idleState } from "@/lib/forms";

/** Clinic staff only — soft-deletes/restores a patient record. Reversible, like every other lifecycle toggle in this app. */
export function PetArchiveToggle({ petId, isActive }: { petId: string; isActive: boolean }) {
  const action = isActive ? archivePetAction : restorePetAction;
  const [, formAction] = useActionState(action, idleState);

  return (
    <form action={formAction}>
      <input type="hidden" name="petId" value={petId} />
      <Button type="submit" variant="outline" size="touch">
        {isActive ? "Archive" : "Restore"}
      </Button>
    </form>
  );
}
