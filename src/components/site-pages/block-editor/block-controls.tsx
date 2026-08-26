"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { deleteBlockAction } from "@/features/site-pages/actions";
import { idleState } from "@/lib/forms";

function DeleteBlockButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="destructive" size="touch" disabled={pending} aria-busy={pending}>
      {pending ? "Removing…" : "Remove block"}
    </Button>
  );
}

/** Delete for one block — reordering is a drag on the card itself, handled by the editor's DndContext. */
export function BlockControls({ pageId, blockId }: { pageId: string; blockId: string }) {
  const [, deleteAction] = useActionState(deleteBlockAction, idleState);
  const [confirmOpen, setConfirmOpen] = useState(false);

  return (
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
  );
}
