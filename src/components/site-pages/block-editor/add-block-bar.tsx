"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Columns3, Heading, ImagePlus, LayoutGrid, Type } from "lucide-react";

import { Button } from "@/components/ui/button";
import { addBlockAction } from "@/features/site-pages/actions";
import type { BlockType } from "@/lib/validation/site-pages";
import { idleState } from "@/lib/forms";

const BLOCK_OPTIONS: { type: BlockType; label: string; icon: typeof Type }[] = [
  { type: "text", label: "Text", icon: Type },
  { type: "image", label: "Image", icon: ImagePlus },
  { type: "section", label: "Section heading", icon: Heading },
  { type: "columns", label: "Columns", icon: Columns3 },
  { type: "cards", label: "Cards", icon: LayoutGrid },
];

function AddButton({ label, icon: Icon }: { label: string; icon: typeof Type }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="outline" size="sm" disabled={pending}>
      <Icon aria-hidden />
      {label}
    </Button>
  );
}

/** The whole "add a block" UI — one button per block type, each its own tiny form so one pending state never blocks another. */
export function AddBlockBar({ pageId }: { pageId: string }) {
  return (
    <div className="flex flex-wrap gap-2">
      {BLOCK_OPTIONS.map((option) => (
        <AddBlockButtonForm key={option.type} pageId={pageId} type={option.type} label={option.label} icon={option.icon} />
      ))}
    </div>
  );
}

function AddBlockButtonForm({ pageId, type, label, icon }: { pageId: string; type: BlockType; label: string; icon: typeof Type }) {
  const [, formAction] = useActionState(addBlockAction, idleState);

  return (
    <form action={formAction}>
      <input type="hidden" name="pageId" value={pageId} />
      <input type="hidden" name="blockType" value={type} />
      <AddButton label={label} icon={icon} />
    </form>
  );
}
