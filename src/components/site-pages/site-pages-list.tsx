"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { FileText, Pencil } from "lucide-react";
import Link from "next/link";

import { FormAlert } from "@/components/form/form-alert";
import { EmptyState } from "@/components/states/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { deleteSitePageAction } from "@/features/site-pages/actions";
import type { SitePageSummary } from "@/features/site-pages/queries";
import { idleState } from "@/lib/forms";

function DeleteButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="destructive" size="touch" disabled={pending} aria-busy={pending}>
      {pending ? "Deleting…" : "Delete page"}
    </Button>
  );
}

function DeleteSitePageDialog({ page }: { page: SitePageSummary }) {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState(deleteSitePageAction, idleState);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button type="button" variant="outline" size="sm" />}>Delete</DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Delete {page.title}?</DialogTitle>
          <DialogDescription>
            This removes the page and every block on it for good, and takes /{page.slug} offline immediately.
          </DialogDescription>
        </DialogHeader>
        <FormAlert state={state} />
        <form action={formAction}>
          <input type="hidden" name="pageId" value={page.id} />
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

export function SitePagesList({ pages }: { pages: SitePageSummary[] }) {
  if (pages.length === 0) {
    return (
      <EmptyState
        icon={FileText}
        title="No custom pages yet"
        description="Beyond Home, About, Services and Contact, add pages of your own — a Careers page, a policy page, anything the practice needs."
      />
    );
  }

  return (
    <ul className="divide-border grid divide-y">
      {pages.map((page) => (
        <li key={page.id} className="grid gap-3 py-3 sm:flex sm:items-center sm:justify-between">
          <div className="grid gap-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-medium">{page.title}</p>
              {!page.isPublished ? <Badge variant="outline">Draft</Badge> : null}
            </div>
            <p className="text-muted-foreground text-sm" data-numeric>
              /{page.slug} · {page.blockCount === 1 ? "1 block" : `${page.blockCount} blocks`}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Link href={`/admin/website/pages/${page.id}`} className="inline-flex">
              <Button type="button" variant="outline" size="sm">
                <Pencil aria-hidden />
                Edit
              </Button>
            </Link>
            <DeleteSitePageDialog page={page} />
          </div>
        </li>
      ))}
    </ul>
  );
}
