"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { DndContext, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Trash2 } from "lucide-react";

import { FormAlert } from "@/components/form/form-alert";
import { HomeSectionItemForm } from "@/components/home-sections/home-section-item-form";
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
import { deleteHomeSectionItemAction, reorderHomeSectionItemsAction } from "@/features/home-sections/actions";
import type { HomeSectionItem } from "@/features/home-sections/queries";
import { iconByKey } from "@/lib/icons";
import { idleState, type FormState } from "@/lib/forms";
import type { HomeSection } from "@/lib/validation/home-sections";

function DeleteItemDialog({ item, onDeleted }: { item: HomeSectionItem; onDeleted: () => void }) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [state, setState] = useState<FormState>(idleState);

  async function submit() {
    setPending(true);
    const formData = new FormData();
    formData.set("itemId", item.id);
    const result = await deleteHomeSectionItemAction(idleState, formData);
    setPending(false);
    if (result.status === "success") {
      setOpen(false);
      onDeleted();
    } else {
      setState(result);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button type="button" variant="ghost" size="icon-sm" aria-label={`Remove ${item.title}`} />}>
        <Trash2 className="size-4" aria-hidden />
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Remove {item.title}?</DialogTitle>
          <DialogDescription>This removes it from the home page.</DialogDescription>
        </DialogHeader>
        <FormAlert state={state} />
        <DialogFooter>
          <Button type="button" variant="outline" size="touch" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button type="button" variant="destructive" size="touch" onClick={submit} disabled={pending} aria-busy={pending}>
            {pending ? "Removing…" : "Remove"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SortableItemRow({
  item,
  section,
  iconNode,
  stepNumber,
  onDeleted,
}: {
  item: HomeSectionItem;
  section: HomeSection;
  /** Already-rendered, not a component reference — resolved in the parent's .map(), which (unlike this component's own body) React's lint rules don't treat as a "components created during render" risk. */
  iconNode: React.ReactNode;
  stepNumber: number | null;
  onDeleted: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={isDragging ? "bg-card ring-foreground/10 flex items-center gap-3 rounded-lg p-3 opacity-40 ring-1" : "bg-card ring-foreground/10 flex items-center gap-3 rounded-lg p-3 ring-1"}
    >
      <button
        type="button"
        className="text-muted-foreground hover:text-foreground shrink-0 cursor-grab touch-none active:cursor-grabbing"
        aria-label={`Drag to reorder ${item.title}`}
        {...attributes}
        {...listeners}
      >
        <GripVertical className="size-4" aria-hidden />
      </button>

      <span className="bg-primary/10 text-primary flex size-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold">
        {iconNode ?? stepNumber}
      </span>

      <div className="grid min-w-0 flex-1 gap-0.5">
        <p className="truncate font-medium">{item.title}</p>
        <p className="text-muted-foreground truncate text-sm">{item.description}</p>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        {/* Keyed by content so a successful save (which brings a new `item`
            down from the server) remounts the dialog with the saved values
            as its defaultValue, instead of Base UI warning about an
            uncontrolled field's initial value changing post-mount. */}
        <HomeSectionItemForm
          key={`${item.id}:${item.title}:${item.description}:${item.icon}`}
          mode="edit"
          section={section}
          item={item}
        />
        <DeleteItemDialog item={item} onDeleted={onDeleted} />
      </div>
    </div>
  );
}

export function HomeSectionEditor({ section, items }: { section: HomeSection; items: HomeSectionItem[] }) {
  const router = useRouter();
  const [order, setOrder] = useState(() => items.map((item) => item.id));
  const byId = new Map(items.map((item) => [item.id, item]));
  const [saveState, setSaveState] = useState<FormState>(idleState);

  const [lastItems, setLastItems] = useState(items);
  if (items !== lastItems) {
    setLastItems(items);
    setOrder(items.map((item) => item.id));
  }

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = order.indexOf(String(active.id));
    const newIndex = order.indexOf(String(over.id));
    if (oldIndex === -1 || newIndex === -1) return;

    const nextOrder = arrayMove(order, oldIndex, newIndex);
    setOrder(nextOrder);

    const formData = new FormData();
    formData.set("section", section);
    formData.set("order", JSON.stringify(nextOrder));
    const result = await reorderHomeSectionItemsAction(idleState, formData);
    setSaveState(result);
    if (result.status === "success") router.refresh();
  }

  function refreshFromServer() {
    router.refresh();
  }

  return (
    <div className="grid gap-4">
      <FormAlert state={saveState} />

      <DndContext id={`home-section-${section}`} sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={order} strategy={verticalListSortingStrategy}>
          <div className="grid gap-2">
            {order.map((id, index) => {
              const item = byId.get(id);
              if (!item) return null;
              const Icon = iconByKey(item.icon);
              return (
                <SortableItemRow
                  key={id}
                  item={item}
                  section={section}
                  iconNode={Icon ? <Icon className="size-4" aria-hidden /> : null}
                  stepNumber={section === "how_it_works" ? index + 1 : null}
                  onDeleted={refreshFromServer}
                />
              );
            })}
          </div>
        </SortableContext>
      </DndContext>

      {items.length === 0 ? <p className="text-muted-foreground text-sm">Nothing here yet — add the first item below.</p> : null}

      <HomeSectionItemForm mode="create" section={section} />
    </div>
  );
}
