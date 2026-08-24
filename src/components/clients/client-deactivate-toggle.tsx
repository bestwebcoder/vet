"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { deactivateClientAction, reactivateClientAction } from "@/features/clients/actions";
import { idleState } from "@/lib/forms";

export function ClientDeactivateToggle({
  clientId,
  userId,
  isActive,
}: {
  clientId: string;
  userId: string | null;
  isActive: boolean;
}) {
  const action = isActive ? deactivateClientAction : reactivateClientAction;
  const [, formAction] = useActionState(action, idleState);

  return (
    <form action={formAction}>
      <input type="hidden" name="clientId" value={clientId} />
      {userId ? <input type="hidden" name="userId" value={userId} /> : null}
      <Button type="submit" variant="outline" size="touch">
        {isActive ? "Deactivate" : "Reactivate"}
      </Button>
    </form>
  );
}
