"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCenter,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ExternalLink, GripVertical, Trash2 } from "lucide-react";

import { FormAlert } from "@/components/form/form-alert";
import { NavItemDialog } from "@/components/nav-menu/nav-item-form";
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
import { deleteNavMenuItemAction, reorderNavMenuTreeAction } from "@/features/nav-menu/actions";
import type { NavMenuItem, NavMenuTreeItem } from "@/features/nav-menu/queries";
import { idleState, type FormState } from "@/lib/forms";
import { cn } from "@/lib/utils";

const TOP_CONTAINER = "top";
const childContainer = (parentId: string) => `children:${parentId}`;

type Tree = { topLevel: string[]; childrenByParent: Record<string, string[]> };

function treeFromProps(items: NavMenuTreeItem[]): Tree {
  const childrenByParent: Record<string, string[]> = {};
  for (const item of items) childrenByParent[item.id] = item.children.map((child) => child.id);
  return { topLevel: items.map((item) => item.id), childrenByParent };
}

function byIdFromProps(items: NavMenuTreeItem[]): Map<string, NavMenuItem> {
  return new Map(items.flatMap((item) => [[item.id, item], ...item.children.map((child): [string, NavMenuItem] => [child.id, child])]));
}

function containerOf(tree: Tree, id: string): string {
  if (tree.topLevel.includes(id)) return TOP_CONTAINER;
  for (const [parentId, childIds] of Object.entries(tree.childrenByParent)) {
    if (childIds.includes(id)) return childContainer(parentId);
  }
  return TOP_CONTAINER;
}

function itemsOf(tree: Tree, container: string): string[] {
  if (container === TOP_CONTAINER) return tree.topLevel;
  const parentId = container.slice("children:".length);
  return tree.childrenByParent[parentId] ?? [];
}

function withItems(tree: Tree, container: string, items: string[]): Tree {
  if (container === TOP_CONTAINER) return { ...tree, topLevel: items };
  const parentId = container.slice("children:".length);
  return { ...tree, childrenByParent: { ...tree.childrenByParent, [parentId]: items } };
}

function DropZone({ id, children, className }: { id: string; children: React.ReactNode; className?: string }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div ref={setNodeRef} className={cn(className, isOver && "bg-primary/5 ring-primary/30 rounded-lg ring-2")}>
      {children}
    </div>
  );
}

function NavRow({
  item,
  hasChildren,
  hrefSuggestions,
  onDeleted,
}: {
  item: NavMenuItem;
  hasChildren: boolean;
  hrefSuggestions: { value: string; label: string }[];
  onDeleted: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id });

  async function handleDelete() {
    const formData = new FormData();
    formData.set("itemId", item.id);
    const result = await deleteNavMenuItemAction(idleState, formData);
    if (result.status === "success") onDeleted();
    return result;
  }

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "bg-card ring-foreground/10 flex items-center gap-2 rounded-lg p-2.5 ring-1",
        isDragging && "opacity-40",
      )}
    >
      <button
        type="button"
        className="text-muted-foreground hover:text-foreground shrink-0 cursor-grab touch-none active:cursor-grabbing"
        aria-label={`Drag to reorder ${item.label}`}
        {...attributes}
        {...listeners}
      >
        <GripVertical className="size-4" aria-hidden />
      </button>

      <div className="grid min-w-0 flex-1 gap-0.5">
        <p className="truncate font-medium">{item.label}</p>
        <p className="text-muted-foreground flex items-center gap-1 truncate text-sm">
          {item.href}
          {item.opensNewTab ? <ExternalLink className="size-3 shrink-0" aria-hidden /> : null}
        </p>
      </div>

      {!item.isVisible ? (
        <Badge variant="secondary" className="shrink-0">
          Hidden
        </Badge>
      ) : null}

      <div className="flex shrink-0 items-center gap-1">
        {/* Keyed by content so a successful save (which brings a new `item`
            down from the server) remounts the dialog with the saved values
            as its defaultValue, instead of Base UI warning about an
            uncontrolled field's initial value changing post-mount. */}
        <NavItemDialog
          key={`${item.id}:${item.label}:${item.href}:${item.isVisible}:${item.opensNewTab}`}
          mode="edit"
          item={item}
          hrefSuggestions={hrefSuggestions}
        />
        <DeleteNavItemDialog item={item} hasChildren={hasChildren} onDelete={handleDelete} />
      </div>
    </div>
  );
}

function DeleteNavItemDialog({
  item,
  hasChildren,
  onDelete,
}: {
  item: NavMenuItem;
  hasChildren: boolean;
  onDelete: () => Promise<FormState>;
}) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [state, setState] = useState<FormState>(idleState);

  async function submit() {
    setPending(true);
    const result = await onDelete();
    setPending(false);
    if (result.status === "success") setOpen(false);
    else setState(result);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={<Button type="button" variant="ghost" size="icon-sm" aria-label={`Remove ${item.label}`} />}
      >
        <Trash2 className="size-4" aria-hidden />
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Remove {item.label}?</DialogTitle>
          <DialogDescription>
            {hasChildren
              ? "This removes it from the menu along with everything in its dropdown."
              : "This removes it from the menu."}
          </DialogDescription>
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

export function NavMenuTreeEditor({
  items,
  hrefSuggestions,
}: {
  items: NavMenuTreeItem[];
  hrefSuggestions: { value: string; label: string }[];
}) {
  const router = useRouter();
  const [tree, setTree] = useState<Tree>(() => treeFromProps(items));
  const [byId, setById] = useState<Map<string, NavMenuItem>>(() => byIdFromProps(items));
  const [activeId, setActiveId] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<FormState>(idleState);

  // router.refresh() (after a delete, or after a reorder round-trips) brings
  // a new `items` prop down, but useState's initializer only runs on mount
  // — without this, the editor would keep showing stale local state after
  // every server-confirmed change. Adjust during render, not an effect, per
  // https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes.
  const [lastItems, setLastItems] = useState(items);
  if (items !== lastItems) {
    setLastItems(items);
    setTree(treeFromProps(items));
    setById(byIdFromProps(items));
  }

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  function handleDragStart(event: DragStartEvent) {
    setActiveId(String(event.active.id));
  }

  function handleDragOver(event: DragOverEvent) {
    const { active, over } = event;
    if (!over) return;

    const activeId = String(active.id);
    const overId = String(over.id);
    if (activeId === overId) return;

    const fromContainer = containerOf(tree, activeId);
    const overIsContainer = overId === TOP_CONTAINER || overId.startsWith("children:");
    const toContainer = overIsContainer ? overId : containerOf(tree, overId);

    // A dropdown item can never itself hold a dropdown — refuse to nest a
    // child two levels deep, matching the DB's own two-level cap.
    if (toContainer !== TOP_CONTAINER && fromContainer === TOP_CONTAINER) {
      const parentId = toContainer.slice("children:".length);
      if (parentId === activeId) return;
    }
    if (toContainer.startsWith("children:") && containerOf(tree, toContainer.slice("children:".length)) !== TOP_CONTAINER) {
      return;
    }

    if (fromContainer === toContainer) {
      const currentItems = itemsOf(tree, fromContainer);
      const oldIndex = currentItems.indexOf(activeId);
      const newIndex = overIsContainer ? currentItems.length : currentItems.indexOf(overId);
      if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) return;

      const reordered = [...currentItems];
      reordered.splice(oldIndex, 1);
      reordered.splice(newIndex, 0, activeId);
      setTree(withItems(tree, fromContainer, reordered));
      return;
    }

    const fromItems = itemsOf(tree, fromContainer).filter((id) => id !== activeId);
    const toItems = itemsOf(tree, toContainer);
    const insertAt = overIsContainer ? toItems.length : toItems.indexOf(overId);
    const nextToItems = [...toItems];
    nextToItems.splice(insertAt === -1 ? toItems.length : insertAt, 0, activeId);

    setTree(withItems(withItems(tree, fromContainer, fromItems), toContainer, nextToItems));
  }

  async function handleDragEnd(event: DragEndEvent) {
    setActiveId(null);
    if (!event.over) return;

    const payload = tree.topLevel.map((id) => ({
      id,
      children: (tree.childrenByParent[id] ?? []).map((childId) => ({ id: childId })),
    }));

    const formData = new FormData();
    formData.set("tree", JSON.stringify(payload));
    const result = await reorderNavMenuTreeAction(idleState, formData);
    setSaveState(result);
    if (result.status === "success") router.refresh();
  }

  function refreshFromServer() {
    router.refresh();
  }

  const activeItem = activeId ? byId.get(activeId) : null;

  return (
    <div className="grid gap-4">
      <FormAlert state={saveState} />

      <DndContext
        // A fixed id, not dnd-kit's own auto-incrementing default — that
        // counter keeps counting across client-side navigations within the
        // same session but always restarts at 0 on a fresh server render,
        // so its generated aria-describedby id drifted between server and
        // client and React flagged a hydration mismatch.
        id="nav-menu-tree"
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
      >
        <DropZone id={TOP_CONTAINER} className="grid gap-2">
          <SortableContext items={tree.topLevel} strategy={verticalListSortingStrategy}>
            {tree.topLevel.map((id) => {
              const item = byId.get(id);
              if (!item) return null;
              const childIds = tree.childrenByParent[id] ?? [];

              return (
                <div key={id} className="grid gap-2">
                  <NavRow
                    item={item}
                    hasChildren={childIds.length > 0}
                    hrefSuggestions={hrefSuggestions}
                    onDeleted={refreshFromServer}
                  />

                  <DropZone id={childContainer(id)} className="ml-6 grid min-h-11 gap-2 border-l pl-4">
                    <SortableContext items={childIds} strategy={verticalListSortingStrategy}>
                      {childIds.length === 0 ? (
                        <p className="text-muted-foreground py-2 text-xs">Drop an item here to add it to this dropdown</p>
                      ) : (
                        childIds.map((childId) => {
                          const child = byId.get(childId);
                          return child ? (
                            <NavRow
                              key={childId}
                              item={child}
                              hasChildren={false}
                              hrefSuggestions={hrefSuggestions}
                              onDeleted={refreshFromServer}
                            />
                          ) : null;
                        })
                      )}
                    </SortableContext>
                    <NavItemDialog
                      mode="create"
                      parentId={id}
                      hrefSuggestions={hrefSuggestions}
                      trigger={
                        <Button type="button" variant="ghost" size="sm" className="justify-self-start">
                          Add dropdown item
                        </Button>
                      }
                    />
                  </DropZone>
                </div>
              );
            })}
          </SortableContext>
        </DropZone>

        <DragOverlay>
          {activeItem ? (
            <div className="bg-card ring-primary flex items-center gap-2 rounded-lg p-2.5 shadow-lg ring-2">
              <GripVertical className="text-muted-foreground size-4" aria-hidden />
              <p className="font-medium">{activeItem.label}</p>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      <NavItemDialog mode="create" hrefSuggestions={hrefSuggestions} />
    </div>
  );
}
