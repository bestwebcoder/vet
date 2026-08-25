"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { ChevronDown, ChevronUp, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { deleteBlockAction, moveBlockAction } from "@/features/site-pages/actions";
import { idleState } from "@/lib/forms";

function MoveButton({ direction, disabled }: { direction: "up" | "down"; disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      name="direction"
      value={direction}
      variant="ghost"
      size="icon"
      disabled={disabled || pending}
      aria-label={direction === "up" ? "Move block up" : "Move block down"}
    >
      {direction === "up" ? <ChevronUp aria-hidden /> : <ChevronDown aria-hidden />}
    </Button>
  );
}

function DeleteBlockButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="destructive" size="touch" disabled={pending} aria-busy={pending}>
      {pending ? "Removing…" : "Remove block"}
    </Button>
  );
}

/** Move up/down and delete for one block — reordering without a drag-and-drop library. */
export function BlockControls({
  pageId,
  blockId,
  isFirst,
  isLast,
}: {
  pageId: string;
  blockId: string;
  isFirst: boolean;
  isLast: boolean;
}) {
  const [, moveAction] = useActionState(moveBlockAction, idleState);
  const [, deleteAction] = useActionState(deleteBlockAction, idleState);
  const [confirmOpen, setConfirmOpen] = useState(false);

  return (
    <div className="flex items-center gap-1">
      <form action={moveAction} className="flex">
        <input type="hidden" name="pageId" value={pageId} />
        <input type="hidden" name="blockId" value={blockId} />
        <MoveButton direction="up" disabled={isFirst} />
        <MoveButton direction="down" disabled={isLast} />
      </form>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogTrigger render={<Button type="button" variant="ghost" size="icon" aria-label="Remove block" />}>
          <Trash2 aria-hidden />
        </DialogTrigger>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Remove this block?</DialogTitle>
            <DialogDescription>This can&rsquo;t be undone.</DialogDescription>
          </DialogHeader>
          <form action={deleteAction}>
            <input type="hidden" name="pageId" value={pageId} />
            <input type="hidden" name="blockId" value={blockId} />
            <DialogFooter>
              <Button type="button" variant="outline" size="touch" onClick={() => setConfirmOpen(false)}>
                Cancel
              </Button>
              <DeleteBlockButton />
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
