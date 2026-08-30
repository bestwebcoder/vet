"use client";

import { format } from "date-fns";
import { ArchiveRestore, Trash2, Undo2 } from "lucide-react";
import { useActionState, useState } from "react";

import { Field } from "@/components/form/field";
import { FormAlert } from "@/components/form/form-alert";
import { SubmitButton } from "@/components/form/submit-button";
import { EmptyState } from "@/components/states/empty-state";
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
import { Button } from "@/components/ui/button";
import { emptyArchiveSectionAction, restoreRecordAction } from "@/features/data/actions";
import type { ArchiveSection } from "@/features/data/queries";
import { idleState } from "@/lib/forms";

/**
 * Deleted records, and putting one back.
 *
 * Nothing in this application hard-deletes a clinical record (CLAUDE.md §6) —
 * a delete sets `deleted_at`, and the row stays where it was. This is the
 * screen that admits it, and makes the last step reversible for the kinds of
 * record an administrator removes by hand.
 */

function RestoreDialog({ table, id, label }: { table: string; id: string; label: string }) {
  const [state, formAction] = useActionState(restoreRecordAction, idleState);

  return (
    <Dialog>
      <DialogTrigger render={<Button type="button" variant="ghost" size="sm" />}>
        <Undo2 className="size-4" aria-hidden />
        Restore
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Restore {label}?</DialogTitle>
          <DialogDescription>
            It goes back exactly as it was, with its history intact, and appears again everywhere it used to.
          </DialogDescription>
        </DialogHeader>
        <form action={formAction} className="grid gap-4" noValidate>
          <FormAlert state={state} />
          <input type="hidden" name="table" value={table} />
          <input type="hidden" name="recordId" value={id} />
          <DialogFooter>
            <SubmitButton pendingLabel="Restoring…">Restore</SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Empties one section for good.
 *
 * Per section rather than one button for the whole archive: the sections hold
 * different kinds of thing, and somebody clearing out obsolete service
 * categories should not be one click away from destroying deleted patients.
 *
 * The confirmation is typed rather than clicked. Everything else on this
 * screen is reversible — Restore is the button right beside it — and this one
 * is not, so it asks for something a hand cannot do by accident.
 */
function EmptySectionDialog({ table, label, count }: { table: string; label: string; count: number }) {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState(emptyArchiveSectionAction, idleState);

  // Closed only on a clean sweep. A partial one carries the sentence saying
  // what stayed behind and what is holding it, and closing would take that
  // away at the moment it matters most.
  const [handledState, setHandledState] = useState(state);
  if (state !== handledState) {
    setHandledState(state);
    if (state.status === "success" && !state.warning) setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={<Button type="button" variant="ghost" size="sm" className="text-destructive hover:text-destructive" />}
      >
        <Trash2 className="size-4" aria-hidden />
        Empty
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            Permanently delete {count} deleted {label.toLowerCase()}?
          </DialogTitle>
          <DialogDescription>
            This destroys the records. They cannot be restored afterwards, and only a backup taken before now
            will still hold them. Anything another record still points at — a patient with an appointment or an
            invoice, say — is kept, and named in the result.
          </DialogDescription>
        </DialogHeader>
        <form action={formAction} className="grid gap-4" noValidate>
          <FormAlert state={state} />
          <input type="hidden" name="table" value={table} />
          <Field
            label="Type DELETE to confirm"
            name="confirmation"
            // Every section renders this field, so the label needs an id of
            // its own to point at the right one.
            id={`confirmation-${table}`}
            autoComplete="off"
            placeholder="DELETE"
            errors={state.status === "error" ? state.fieldErrors?.confirmation : undefined}
          />
          <DialogFooter>
            <Button type="button" variant="outline" size="touch" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <SubmitButton variant="destructive" pendingLabel="Deleting…" className="sm:w-auto">
              Delete permanently
            </SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function ArchivePanel({ sections }: { sections: ArchiveSection[] }) {
  const populated = sections.filter((section) => section.records.length > 0);

  if (populated.length === 0) {
    return (
      <Card>
        <CardContent>
          <EmptyState
            icon={ArchiveRestore}
            title="Nothing has been deleted"
            description="When a client, patient, service or document is removed, it waits here rather than disappearing."
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Deleted records</CardTitle>
          <CardDescription>
            Deleting elsewhere in TV Care hides a record rather than destroying it, and everything here can be put
            back. Emptying a section is the exception: those records are gone for good, and only a backup taken
            beforehand will still hold them.
          </CardDescription>
        </CardHeader>
      </Card>

      {populated.map((section) => (
        <Card key={section.table}>
          <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0">
            <div className="grid gap-1.5">
              <CardTitle>{section.label}</CardTitle>
              <CardDescription>
                {section.records.length} deleted {section.records.length === 1 ? "record" : "records"}, most recent
                first.
              </CardDescription>
            </div>
            <EmptySectionDialog table={section.table} label={section.label} count={section.records.length} />
          </CardHeader>
          <CardContent>
            <ul className="divide-border grid divide-y">
              {section.records.map((record) => (
                <li key={record.id} className="flex min-h-11 items-center gap-4 py-2">
                  <div className="grid flex-1 gap-0.5">
                    <span className="text-sm font-medium">{record.label}</span>
                    <span className="text-muted-foreground text-sm">
                      Deleted {format(new Date(record.deletedAt), "d MMM yyyy, HH:mm")}
                    </span>
                  </div>
                  <RestoreDialog table={section.table} id={record.id} label={record.label} />
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
