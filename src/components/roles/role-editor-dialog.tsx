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
 * A system role opens here too, and is now fully editable: name, description
 * and the permission matrix all save. The one thing that never changes, for
 * any role, is its identity — slug, is_system and organization_id are fixed
 * by a database trigger (20261007000100), not by this form.
 *
 * Built-in roles are shared by every practice on the platform — there is one
 * Doctor row, not one per practice — so a change made here takes effect for
 * every practice's doctors, not only this one. The matrix also still will not
 * describe a narrower built-in role completely: some of what a receptionist
 * or a lab user does is written into their own policies rather than a module
 * here, so a short list on one of them is not the same as an empty job.
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
      <Pencil aria-hidden />
      Edit
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
              ? "A built-in role, shared by every practice on the platform. A change here takes effect for all of them, not only yours. Managing something always includes viewing it."
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
            errors={state.status === "error" ? state.fieldErrors?.name : undefined}
          />

          <TextAreaField
            label="Description"
            name="description"
            rows={2}
            defaultValue={role?.description ?? ""}
            hint="What this role is for, in the practice's own words."
          />

          <div className="grid gap-2">
            <span className="text-sm font-medium">Permissions</span>
            <div className="max-h-[45vh] overflow-y-auto pr-1">
              <PermissionMatrix defaultPermissions={role?.permissions ?? []} />
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
              Cancel
            </Button>
            <SubmitButton pendingLabel="Saving…" className="w-full sm:w-auto">
              {role ? "Save role" : "Create role"}
            </SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
