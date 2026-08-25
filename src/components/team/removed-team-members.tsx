"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { restoreTeamMemberAction } from "@/features/team/actions";
import type { RemovedTeamMember } from "@/features/team/queries";
import { Button } from "@/components/ui/button";
import { idleState } from "@/lib/forms";

function RestoreButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="outline" size="sm" disabled={pending} aria-busy={pending}>
      {pending ? "Restoring…" : "Restore"}
    </Button>
  );
}

function RemovedMemberRow({ member }: { member: RemovedTeamMember }) {
  const [, formAction] = useActionState(restoreTeamMemberAction, idleState);

  return (
    <li className="flex items-center justify-between gap-3 py-2">
      <div>
        <p className="font-medium">{member.fullName}</p>
        <p className="text-muted-foreground text-sm">{member.email}</p>
      </div>
      <form action={formAction}>
        <input type="hidden" name="userId" value={member.userId} />
        <RestoreButton />
      </form>
    </li>
  );
}

/** deleteTeamMemberAction's undo list — collapsed away entirely when nobody has been removed. */
export function RemovedTeamMembers({ members }: { members: RemovedTeamMember[] }) {
  if (members.length === 0) return null;

  return (
    <div className="grid gap-2">
      <p className="text-muted-foreground text-sm font-medium">Removed from the team</p>
      <ul className="divide-border grid divide-y">
        {members.map((member) => (
          <RemovedMemberRow key={member.userId} member={member} />
        ))}
      </ul>
    </div>
  );
}
