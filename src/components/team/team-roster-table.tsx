"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { Trash2, UsersRound } from "lucide-react";

import { FormAlert } from "@/components/form/form-alert";
import { SelectField } from "@/components/form/select-field";
import { EmptyState } from "@/components/states/empty-state";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { deleteTeamMemberAction, setTeamRoleAction } from "@/features/team/actions";
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

function DeleteButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="destructive" size="touch" disabled={pending} aria-busy={pending}>
      {pending ? "Removing…" : "Remove from team"}
    </Button>
  );
}

/** Confirmed separately from Save/role changes — unlike those, this cannot be undone from this page. */
function DeleteTeamMemberDialog({ member }: { member: TeamMember }) {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState(deleteTeamMemberAction, idleState);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button type="button" variant="ghost" size="icon" aria-label={`Remove ${member.fullName}`} />}>
        <Trash2 aria-hidden />
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Remove {member.fullName}?</DialogTitle>
          <DialogDescription>
            Removes them from the team roster and any role they hold. Their account itself is untouched, and they can
            be restored from the removed list.
          </DialogDescription>
        </DialogHeader>
        <FormAlert state={state} />
        <form action={formAction}>
          <input type="hidden" name="userId" value={member.userId} />
          <DialogFooter>
            <Button type="button" variant="outline" size="touch" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <DeleteButton />
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function TeamMemberRow({ member }: { member: TeamMember }) {
  const [state, formAction] = useActionState(setTeamRoleAction, idleState);

  return (
    <TableRow>
      <TableCell>
        <p className="font-medium">{member.fullName}</p>
        <p className="text-muted-foreground text-sm">
          {member.email}
          {member.phone ? ` · ${member.phone}` : ""}
        </p>
      </TableCell>
      <TableCell className="whitespace-normal">
        <form action={formAction} className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="userId" value={member.userId} />
          <div className="w-36 [&_label]:sr-only">
            <SelectField label="Role" name="role" options={ROLE_OPTIONS} defaultValue={member.role} />
          </div>
          <SaveButton />
        </form>
        {state.status !== "idle" ? (
          <div className="mt-2">
            <FormAlert state={state} />
          </div>
        ) : null}
      </TableCell>
      <TableCell>{member.hasStaffRecord ? <DeleteTeamMemberDialog member={member} /> : null}</TableCell>
    </TableRow>
  );
}

/**
 * The practice's admins, plus anyone registered as staff who has not been
 * granted a role yet. Doctors and clients are managed at their own pages
 * (/admin/doctors, /admin/clients) and deliberately do not appear here —
 * see src/features/team/queries.ts.
 */
export function TeamRosterTable({ members }: { members: TeamMember[] }) {
  if (members.length === 0) {
    return (
      <EmptyState
        icon={UsersRound}
        title="No admins or pending staff"
        description="Practice admins, and staff accounts waiting for a role, show up here."
      />
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead>Role</TableHead>
          <TableHead className="w-11" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {members.map((member) => (
          <TeamMemberRow key={member.userId} member={member} />
        ))}
      </TableBody>
    </Table>
  );
}
