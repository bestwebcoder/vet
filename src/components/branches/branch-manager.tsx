"use client";

import { useActionState, useState } from "react";

import { Field } from "@/components/form/field";
import { FormAlert } from "@/components/form/form-alert";
import { SubmitButton } from "@/components/form/submit-button";
import { TextAreaField } from "@/components/form/textarea-field";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  createBranchAction,
  deleteBranchAction,
  setPrimaryBranchAction,
  toggleBranchActiveAction,
  updateBranchAction,
} from "@/features/branches/actions";
import type { Branch } from "@/features/branches/queries";
import { idleState } from "@/lib/forms";

function BranchFields({
  defaults,
  errors,
}: {
  defaults?: Branch;
  errors?: Record<string, string[] | undefined>;
}) {
  // Settings already has a practice "name", "phone", "email", "address" and
  // "city" on the same page, so these need ids of their own or the labels
  // point at the wrong inputs.
  const prefix = defaults ? `branch-${defaults.id}` : "branch-new";

  return (
    <>
      <Field label="Branch name" id={`${prefix}-name`} name="name" required defaultValue={defaults?.name ?? ""} errors={errors?.name} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field
          label="Phone (optional)"
          id={`${prefix}-phone`}
          name="phone"
          type="tel"
          inputMode="tel"
          defaultValue={defaults?.phone ?? ""}
          hint="For example 01712345678"
          errors={errors?.phone}
        />
        <Field label="Email (optional)" id={`${prefix}-email`} name="email" type="email" defaultValue={defaults?.email ?? ""} errors={errors?.email} />
      </div>
      <TextAreaField label="Address (optional)" id={`${prefix}-address`} name="address" rows={2} defaultValue={defaults?.address ?? ""} errors={errors?.address} />
      <Field label="City (optional)" id={`${prefix}-city`} name="city" defaultValue={defaults?.city ?? ""} errors={errors?.city} />
    </>
  );
}

function EditBranchDialog({ branch }: { branch: Branch }) {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState(updateBranchAction, idleState);
  const fieldErrors = state.status === "error" ? state.fieldErrors : undefined;

  const [handled, setHandled] = useState(state);
  if (state !== handled) {
    setHandled(state);
    if (state.status === "success") setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button type="button" variant="ghost" size="sm" />}>Edit</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit {branch.name}</DialogTitle>
        </DialogHeader>
        <form action={formAction} className="grid gap-4" noValidate>
          <FormAlert state={state} />
          <input type="hidden" name="branchId" value={branch.id} />
          <BranchFields defaults={branch} errors={fieldErrors} />
          <DialogFooter>
            <Button type="button" variant="outline" size="touch" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <SubmitButton pendingLabel="Saving…" className="sm:w-auto">
              Save branch
            </SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DeleteBranchDialog({ branch }: { branch: Branch }) {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState(deleteBranchAction, idleState);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button type="button" variant="ghost" size="sm" />}>Delete</DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Delete {branch.name}?</DialogTitle>
          <DialogDescription>
            This removes it for good. A branch used by any appointment, availability window or doctor cannot be
            deleted — deactivate it instead, and it stays on those records while no longer being offered.
          </DialogDescription>
        </DialogHeader>
        <FormAlert state={state} />
        <form action={formAction}>
          <input type="hidden" name="branchId" value={branch.id} />
          <DialogFooter>
            <Button type="button" variant="outline" size="touch" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <SubmitButton variant="destructive" pendingLabel="Deleting…" className="sm:w-auto">
              Delete branch
            </SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function InlineAction({
  action,
  branchId,
  extra,
  children,
  variant = "ghost",
}: {
  action: typeof setPrimaryBranchAction;
  branchId: string;
  extra?: Record<string, string>;
  children: React.ReactNode;
  variant?: "ghost" | "outline";
}) {
  const [state, formAction] = useActionState(action, idleState);

  return (
    <form action={formAction} className="contents">
      <input type="hidden" name="branchId" value={branchId} />
      {Object.entries(extra ?? {}).map(([key, value]) => (
        <input key={key} type="hidden" name={key} value={value} />
      ))}
      <Button type="submit" variant={variant} size="sm">
        {children}
      </Button>
      {state.status === "error" ? (
        <span className="text-destructive w-full text-sm" role="alert">
          {state.message}
        </span>
      ) : null}
    </form>
  );
}

/**
 * The practice's clinics.
 *
 * Exactly one branch is primary — it is where the practice is reachable, and
 * what documents fall back to — so it can be moved but never simply switched
 * off, and the controls say which one it is rather than leaving it implied.
 */
export function BranchManager({ branches }: { branches: Branch[] }) {
  const [state, formAction] = useActionState(createBranchAction, idleState);
  const fieldErrors = state.status === "error" ? state.fieldErrors : undefined;
  const [adding, setAdding] = useState(false);

  const [handled, setHandled] = useState(state);
  if (state !== handled) {
    setHandled(state);
    if (state.status === "success") setAdding(false);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Branches</CardTitle>
        <CardDescription>
          The clinics this practice works from. Appointments, doctors and availability can each belong to one.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {branches.length === 0 ? (
          <p className="text-muted-foreground text-sm">No branches yet — the first one you add becomes the primary.</p>
        ) : (
          <ul className="grid gap-2">
            {branches.map((branch) => (
              <li key={branch.id} className="grid gap-2 rounded-lg border p-3 text-sm">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="grid gap-0.5">
                    <span className="flex flex-wrap items-center gap-2 font-medium">
                      {branch.name}
                      {branch.isPrimary ? <Badge>Primary</Badge> : null}
                      {!branch.isActive ? <Badge variant="outline">Inactive</Badge> : null}
                    </span>
                    <span className="text-muted-foreground text-xs">
                      {[branch.address, branch.city].filter(Boolean).join(", ") || "No address recorded"}
                      {branch.phone ? ` · ${branch.phone}` : ""}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-1">
                    {!branch.isPrimary && branch.isActive ? (
                      <InlineAction action={setPrimaryBranchAction} branchId={branch.id}>
                        Make primary
                      </InlineAction>
                    ) : null}
                    <EditBranchDialog branch={branch} />
                    {!branch.isPrimary ? (
                      <InlineAction
                        action={toggleBranchActiveAction}
                        branchId={branch.id}
                        extra={{ isActive: branch.isActive ? "false" : "true" }}
                      >
                        {branch.isActive ? "Deactivate" : "Reactivate"}
                      </InlineAction>
                    ) : null}
                    {!branch.inUse ? <DeleteBranchDialog branch={branch} /> : null}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}

        {adding ? (
          <form action={formAction} className="grid gap-4 border-t pt-4" noValidate>
            <FormAlert state={state} />
            <BranchFields errors={fieldErrors} />
            <div className="flex gap-2">
              <SubmitButton pendingLabel="Adding…" className="sm:w-auto">
                Add branch
              </SubmitButton>
              <Button type="button" variant="outline" size="touch" onClick={() => setAdding(false)}>
                Cancel
              </Button>
            </div>
          </form>
        ) : (
          <div>
            <Button type="button" variant="outline" size="sm" onClick={() => setAdding(true)}>
              Add branch
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
