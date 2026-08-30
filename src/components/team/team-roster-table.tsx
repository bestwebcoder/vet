"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { UsersRound } from "lucide-react";

import { FormAlert } from "@/components/form/form-alert";
import { SelectField } from "@/components/form/select-field";
import { AdminChangeEmailDialog } from "@/components/profile/admin-change-email-dialog";
import { AdminEditIdentityDialog } from "@/components/profile/admin-edit-identity-dialog";
import { AdminSetPasswordDialog } from "@/components/profile/admin-set-password-dialog";
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
import { NO_ROLE, roleOptions, type RoleOption } from "@/lib/validation/team";

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="outline" size="sm" disabled={pending} aria-busy={pending}>
      {pending ? "Saving…" : "Save"}
    </Button>
  );
}

function DeactivateButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="destructive" size="touch" disabled={pending} aria-busy={pending}>
      {pending ? "Deactivating…" : "Deactivate"}
    </Button>
  );
}

/**
 * Confirmed separately from Save/role changes — unlike those, this cannot be
 * undone from this page. Available for every roster row, not just ones with
 * a staff record: grantTeamRole (src/features/team/actions.ts) now ensures
 * every admin has one, since deactivating an admin with none would drop
 * them out of getTeamRoster entirely — neither an active admin nor a
 * pending staff record, unreachable from this page afterwards.
 */
function DeactivateTeamMemberDialog({ member }: { member: TeamMember }) {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState(deleteTeamMemberAction, idleState);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button type="button" variant="outline" size="sm" />}>Deactivate</DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Deactivate {member.fullName}?</DialogTitle>
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
            <DeactivateButton />
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function TeamMemberRow({ member, roles }: { member: TeamMember; roles: RoleOption[] }) {
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
            {/* Keyed on the value itself: an uncontrolled Select does not
                re-sync its defaultValue on its own, so after a save changes
                member.role and the page revalidates, the dropdown would
                otherwise keep showing whatever was last selected instead of
                what actually saved — reading as "the role didn't save" even
                though it did. */}
            <SelectField
              key={member.roleId ?? NO_ROLE}
              label="Role"
              name="role"
              options={roleOptions("No role", roles)}
              defaultValue={member.roleId ?? NO_ROLE}
            />
          </div>
          <SaveButton />
        </form>
        {state.status !== "idle" ? (
          <div className="mt-2">
            <FormAlert state={state} />
          </div>
        ) : null}
      </TableCell>
      <TableCell className="whitespace-normal">
        {/* Laid out in a row, matching the doctor cards at /admin/doctors.
            The column is deliberately not width-constrained: a `w-px` here
            collapses it to min-content, which wraps every button onto its
            own line. */}
        <div className="flex flex-wrap items-center justify-end gap-2">
          <AdminEditIdentityDialog targetUserId={member.userId} fullName={member.fullName} phone={member.phone} />
          <AdminChangeEmailDialog targetUserId={member.userId} targetName={member.fullName} email={member.email} />
          <AdminSetPasswordDialog targetUserId={member.userId} targetName={member.fullName} />
          <DeactivateTeamMemberDialog member={member} />
        </div>
      </TableCell>
    </TableRow>
  );
}

/**
 * The practice's admins, plus anyone registered as staff who has not been
 * granted a role yet. Doctors and clients are managed at their own pages
 * (/admin/doctors, /admin/clients) and deliberately do not appear here —
 * see src/features/team/queries.ts.
 */
export function TeamRosterTable({ members, roles }: { members: TeamMember[]; roles: RoleOption[] }) {
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
          <TableHead className="text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {members.map((member) => (
          <TeamMemberRow key={member.userId} member={member} roles={roles} />
        ))}
      </TableBody>
    </Table>
  );
}
