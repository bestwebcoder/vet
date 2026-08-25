"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { UsersRound } from "lucide-react";

import { FormAlert } from "@/components/form/form-alert";
import { SelectField } from "@/components/form/select-field";
import { EmptyState } from "@/components/states/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { setTeamRoleAction } from "@/features/team/actions";
import type { TeamMember } from "@/features/team/queries";
import { idleState } from "@/lib/forms";

const ROLE_OPTIONS = [
  { value: "none", label: "No role" },
  { value: "client", label: "Client" },
  { value: "doctor", label: "Doctor" },
  { value: "admin", label: "Admin" },
];

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="outline" size="sm" disabled={pending} aria-busy={pending}>
      {pending ? "Saving…" : "Save"}
    </Button>
  );
}

function TeamMemberRow({ member }: { member: TeamMember }) {
  const [state, formAction] = useActionState(setTeamRoleAction, idleState);

  return (
    <div className="grid gap-2 border-b py-3 last:border-b-0">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-medium">{member.fullName}</p>
          <p className="text-muted-foreground text-sm">
            {member.email}
            {member.phone ? ` · ${member.phone}` : ""}
          </p>
        </div>
        {member.role === "none" ? <Badge variant="outline">No role</Badge> : <Badge>Admin</Badge>}
      </div>

      <form action={formAction} className="flex flex-wrap items-end gap-2">
        <input type="hidden" name="userId" value={member.userId} />
        <div className="w-40">
          <SelectField label="Role" name="role" options={ROLE_OPTIONS} defaultValue={member.role} />
        </div>
        <SaveButton />
      </form>
      {state.status !== "idle" ? <FormAlert state={state} /> : null}
    </div>
  );
}

/**
 * The practice's admins, plus anyone registered as staff who has not been
 * granted a role yet. Doctors and clients are managed at their own pages
 * (/admin/doctors, /admin/clients) and deliberately do not appear here —
 * see src/features/team/queries.ts.
 */
export function TeamRolesForm({ members }: { members: TeamMember[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Team & roles</CardTitle>
      </CardHeader>
      <CardContent>
        {members.length === 0 ? (
          <EmptyState
            icon={UsersRound}
            title="No admins or pending staff"
            description="Practice admins, and staff accounts waiting for a role, show up here."
          />
        ) : (
          <div className="grid">
            {members.map((member) => (
              <TeamMemberRow key={member.userId} member={member} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
