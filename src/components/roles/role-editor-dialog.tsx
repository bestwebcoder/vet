"use client";

import { Pencil, Plus } from "lucide-react";
import { useActionState, useState } from "react";

import { Field } from "@/components/form/field";
import { FormAlert } from "@/components/form/form-alert";
import { SubmitButton } from "@/components/form/submit-button";
import { TextAreaField } from "@/components/form/textarea-field";
import { PermissionMatrix } from "@/components/roles/permission-matrix";
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
import { createRoleAction, updateRoleAction } from "@/features/roles/actions";
import type { RoleSummary } from "@/features/roles/queries";
import { idleState } from "@/lib/forms";

/**
 * Creating a role, and editing one — the same form, because the two must agree
 * about what a role is.
 *
 * A system role opens here too, read-only — it is the same kind of object, and
 * hiding it would make the built-ins look like magic. The dialog says plainly
 * that the matrix does not describe them fully: what a receptionist or a lab
 * user may do is written into their own policies and does not decompose into
 * these modules, and pretending otherwise on screen is exactly the lie this
 * whole feature is trying not to tell.
 */
export function RoleEditorDialog({ role }: { role?: RoleSummary }) {
  const [open, setOpen] = useState(false);
  const isSystem = role?.isSystem ?? false;
  const [state, formAction] = useActionState(role ? updateRoleAction : createRoleAction, idleState);

  const [handledState, setHandledState] = useState(state);
  if (state !== handledState) {
    setHandledState(state);
    if (state.status === "success") setOpen(false);
  }

  const trigger = role ? (
    <Button type="button" variant="outline" size="sm">
      {isSystem ? "View" : <Pencil aria-hidden />}
      {isSystem ? null : "Edit"}
    </Button>
  ) : (
    <Button type="button" size="touch">
      <Plus aria-hidden />
      New role
    </Button>
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={trigger} />

      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{role ? role.name : "New role"}</DialogTitle>
          <DialogDescription>
            {isSystem
              ? "A built-in role. What it can do is written into the system and cannot be changed here — and for every one except Administrator, it does not decompose into these modules, so the matrix below will look emptier than the role is."
              : "Give the role a name, then tick what it may do. Managing something always includes viewing it."}
          </DialogDescription>
        </DialogHeader>

        <form action={formAction} className="grid gap-4" noValidate>
          <FormAlert state={state} />
          {role ? <input type="hidden" name="roleId" value={role.id} /> : null}

          <Field
            label="Name"
            name="name"
            defaultValue={role?.name}
            required
            disabled={isSystem}
            errors={state.status === "error" ? state.fieldErrors?.name : undefined}
          />

          <TextAreaField
            label="Description"
            name="description"
            rows={2}
            defaultValue={role?.description ?? ""}
            disabled={isSystem}
            hint="What this role is for, in the practice's own words."
          />

          <div className="grid gap-2">
            <span className="text-sm font-medium">Permissions</span>
            <div className="max-h-[45vh] overflow-y-auto pr-1">
              <PermissionMatrix defaultPermissions={role?.permissions ?? []} disabled={isSystem} />
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              size="touch"
              className="w-full sm:w-auto"
              onClick={() => setOpen(false)}
            >
              {isSystem ? "Close" : "Cancel"}
            </Button>
            {isSystem ? null : (
              <SubmitButton pendingLabel="Saving…" className="w-full sm:w-auto">
                {role ? "Save role" : "Create role"}
              </SubmitButton>
            )}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
