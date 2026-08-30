"use client";

import { ShieldCheck, Trash2 } from "lucide-react";
import { useActionState, useState } from "react";

import { FormAlert } from "@/components/form/form-alert";
import { SubmitButton } from "@/components/form/submit-button";
import { RoleEditorDialog } from "@/components/roles/role-editor-dialog";
import { Badge } from "@/components/ui/badge";
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
import { deleteRoleAction } from "@/features/roles/actions";
import type { RoleSummary } from "@/features/roles/queries";
import { idleState } from "@/lib/forms";

function DeleteRoleDialog({ role }: { role: RoleSummary }) {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState(deleteRoleAction, idleState);

  const [handledState, setHandledState] = useState(state);
  if (state !== handledState) {
    setHandledState(state);
    if (state.status === "success") setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={<Button type="button" variant="ghost" size="sm" className="text-destructive hover:text-destructive" />}
      >
        <Trash2 aria-hidden />
        <span className="sr-only">Delete {role.name}</span>
      </DialogTrigger>

      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete {role.name}?</DialogTitle>
          <DialogDescription>
            {role.isSystem
              ? "A built-in role, shared by every practice on the platform. This only works while nobody anywhere still holds it — the People count above is just your own practice's, so a role with none of your own people may still be refused if another practice's are still on it."
              : "The role stops being offered when assigning someone. Anyone who has held it keeps their history — a revoked grant still says which role it was."}
          </DialogDescription>
        </DialogHeader>

        <form action={formAction} className="grid gap-4" noValidate>
          <FormAlert state={state} />
          <input type="hidden" name="roleId" value={role.id} />

          <DialogFooter>
            <Button type="button" variant="outline" size="touch" className="w-full sm:w-auto" onClick={() => setOpen(false)}>
              Keep it
            </Button>
            <SubmitButton variant="destructive" pendingLabel="Deleting…" className="w-full sm:w-auto">
              Delete role
            </SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * The practice's roles, built-in and its own, with what each may do.
 *
 * Both kinds sit in one table on purpose: they are the same kind of object to
 * whoever is assigning somebody a job, and a separate "custom roles" section
 * would suggest the practice's own roles are second-class when they are
 * enforced by the same policies.
 */
export function RolesPanel({ roles }: { roles: RoleSummary[] }) {
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="text-muted-foreground text-sm">
          What each role may do. A change to a built-in role takes effect for every practice on the platform, not
          only yours — there is one Doctor, one Receptionist, shared by all of them. Roles this practice defines
          reach only your own practice, and either way, a change takes effect the next time that person loads a
          page.
        </p>
        <RoleEditorDialog />
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Role</TableHead>
            <TableHead className="text-right">Permissions</TableHead>
            <TableHead className="text-right">People</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {roles.map((role) => (
            <TableRow key={role.id}>
              <TableCell>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{role.name}</span>
                  {role.isSystem ? (
                    <Badge variant="secondary">
                      <ShieldCheck aria-hidden className="size-3" />
                      Built in
                    </Badge>
                  ) : null}
                </div>
                {role.description ? (
                  <p className="text-muted-foreground text-sm">{role.description}</p>
                ) : null}
              </TableCell>
              <TableCell className="text-right">
                {/* Every built-in role carries its own rows now
                    (20261006000100), so this is a real count for all of them.
                    A short list on a built-in role is not an omission: a lab
                    user may update a test result, and no key in the catalogue
                    says so without also unlocking the notes around it. */}
                <span data-numeric>{role.permissions.length}</span>
              </TableCell>
              <TableCell className="text-right" data-numeric>
                {role.holderCount}
              </TableCell>
              <TableCell>
                <div className="flex items-center justify-end gap-1">
                  <RoleEditorDialog role={role} />
                  <DeleteRoleDialog role={role} />
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
