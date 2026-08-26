"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { DndContext, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, LayoutTemplate } from "lucide-react";

import { AddBlockBar } from "@/components/site-pages/block-editor/add-block-bar";
import { BlockControls } from "@/components/site-pages/block-editor/block-controls";
import { CardsBlockEditor } from "@/components/site-pages/block-editor/cards-block-editor";
import { ColumnsBlockEditor } from "@/components/site-pages/block-editor/columns-block-editor";
import { ImageBlockEditor } from "@/components/site-pages/block-editor/image-block-editor";
import { SectionBlockEditor } from "@/components/site-pages/block-editor/section-block-editor";
import { TextBlockEditor } from "@/components/site-pages/block-editor/text-block-editor";
import { EmptyState } from "@/components/states/empty-state";
import { Card, CardContent } from "@/components/ui/card";
import { FormAlert } from "@/components/form/form-alert";
import { reorderBlocksAction } from "@/features/site-pages/actions";
import type { SitePageBlock } from "@/features/site-pages/queries";
import { idleState, type FormState } from "@/lib/forms";

const BLOCK_LABELS: Record<SitePageBlock["blockType"], string> = {
  text: "Text",
  image: "Image",
  section: "Section heading",
  columns: "Columns",
  cards: "Cards",
};

function BlockEditor({ pageId, block }: { pageId: string; block: SitePageBlock }) {
  switch (block.blockType) {
    case "text":
      return <TextBlockEditor pageId={pageId} blockId={block.id} content={block.content} />;
    case "image":
      return <ImageBlockEditor pageId={pageId} blockId={block.id} content={block.content} />;
    case "section":
      return <SectionBlockEditor pageId={pageId} blockId={block.id} content={block.content} />;
    case "columns":
      return <ColumnsBlockEditor pageId={pageId} blockId={block.id} content={block.content} />;
    case "cards":
      return <CardsBlockEditor pageId={pageId} blockId={block.id} content={block.content} />;
  }
}

function SortableBlockCard({ pageId, block }: { pageId: string; block: SitePageBlock }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: block.id });

  return (
    <Card
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={isDragging ? "opacity-40" : undefined}
    >
      <CardContent className="grid gap-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="text-muted-foreground hover:text-foreground shrink-0 cursor-grab touch-none active:cursor-grabbing"
              aria-label={`Drag to reorder ${BLOCK_LABELS[block.blockType]} block`}
              {...attributes}
              {...listeners}
            >
              <GripVertical className="size-4" aria-hidden />
            </button>
            <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">{BLOCK_LABELS[block.blockType]}</p>
          </div>
          <BlockControls pageId={pageId} blockId={block.id} />
        </div>
        <BlockEditor pageId={pageId} block={block} />
      </CardContent>
    </Card>
  );
}

/** The page builder: an ordered stack of typed blocks, drag-to-reorder, plus the bar to add more. */
export function SitePageBlocksEditor({ pageId, blocks }: { pageId: string; blocks: SitePageBlock[] }) {
  const router = useRouter();
  const [order, setOrder] = useState(() => blocks.map((block) => block.id));
  const byId = new Map(blocks.map((block) => [block.id, block]));
  const [saveState, setSaveState] = useState<FormState>(idleState);

  const [lastBlocks, setLastBlocks] = useState(blocks);
  if (blocks !== lastBlocks) {
    setLastBlocks(blocks);
    setOrder(blocks.map((block) => block.id));
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
    formData.set("pageId", pageId);
    formData.set("order", JSON.stringify(nextOrder));
    const result = await reorderBlocksAction(idleState, formData);
    setSaveState(result);
    if (result.status === "success") router.refresh();
  }

  return (
    <div className="grid gap-4">
      <FormAlert state={saveState} />

      {blocks.length === 0 ? (
        <Card>
          <CardContent>
            <EmptyState
              icon={LayoutTemplate}
              title="This page is empty"
              description="Add a block below to start building it — text, an image, a section heading, a columned list, or a grid of cards."
            />
          </CardContent>
        </Card>
      ) : (
        <DndContext id={`site-page-${pageId}`} sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={order} strategy={verticalListSortingStrategy}>
            <div className="grid gap-4">
              {order.map((id) => {
                const block = byId.get(id);
                if (!block) return null;
                return <SortableBlockCard key={id} pageId={pageId} block={block} />;
              })}
            </div>
          </SortableContext>
        </DndContext>
      )}

      <Card className="border-dashed">
        <CardContent className="grid gap-3">
          <p className="text-sm font-medium">Add a block</p>
          <AddBlockBar pageId={pageId} />
        </CardContent>
      </Card>
    </div>
  );
}
