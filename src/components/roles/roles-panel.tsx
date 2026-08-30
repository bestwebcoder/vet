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
            The role stops being offered when assigning someone. Anyone who has held it keeps their history — a
            revoked grant still says which role it was.
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
          What each role may do. Built-in roles are shown as they are; roles this practice defines can be changed at
          any time, and take effect the next time that person loads a page.
        </p>
        <RoleEditorDialog />
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Role</TableHead>
            <TableHead className="text-right">Permissions</TableHead>
            <TableHead className="text-right">People</TableHead>
            <TableHead className="text-right">Edit</TableHead>
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
                {/* A built-in role other than Administrator holds no rows in
                    the matrix, because what it may do does not decompose into
                    these modules — a lab user may update a test result but not
                    order one. Showing "0" would read as "can do nothing". */}
                {role.isSystem && role.permissions.length === 0 ? (
                  <span className="text-muted-foreground text-sm">Defined in the system</span>
                ) : (
                  <span data-numeric>{role.permissions.length}</span>
                )}
              </TableCell>
              <TableCell className="text-right" data-numeric>
                {role.holderCount}
              </TableCell>
              <TableCell>
                <div className="flex items-center justify-end gap-1">
                  <RoleEditorDialog role={role} />
                  {role.isSystem ? null : <DeleteRoleDialog role={role} />}
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
