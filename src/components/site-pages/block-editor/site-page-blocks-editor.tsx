import { LayoutTemplate } from "lucide-react";

import { AddBlockBar } from "@/components/site-pages/block-editor/add-block-bar";
import { BlockControls } from "@/components/site-pages/block-editor/block-controls";
import { ColumnsBlockEditor } from "@/components/site-pages/block-editor/columns-block-editor";
import { ImageBlockEditor } from "@/components/site-pages/block-editor/image-block-editor";
import { SectionBlockEditor } from "@/components/site-pages/block-editor/section-block-editor";
import { TextBlockEditor } from "@/components/site-pages/block-editor/text-block-editor";
import { EmptyState } from "@/components/states/empty-state";
import { Card, CardContent } from "@/components/ui/card";
import type { SitePageBlock } from "@/features/site-pages/queries";

const BLOCK_LABELS: Record<SitePageBlock["blockType"], string> = {
  text: "Text",
  image: "Image",
  section: "Section heading",
  columns: "Columns",
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
  }
}

/** The page builder: an ordered stack of typed blocks, each its own editor, plus the bar to add more. */
export function SitePageBlocksEditor({ pageId, blocks }: { pageId: string; blocks: SitePageBlock[] }) {
  return (
    <div className="grid gap-4">
      {blocks.length === 0 ? (
        <Card>
          <CardContent>
            <EmptyState
              icon={LayoutTemplate}
              title="This page is empty"
              description="Add a block below to start building it — text, an image, a section heading, or a columned feature list."
            />
          </CardContent>
        </Card>
      ) : (
        blocks.map((block, index) => (
          <Card key={block.id}>
            <CardContent className="grid gap-3">
              <div className="flex items-center justify-between gap-3">
                <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">{BLOCK_LABELS[block.blockType]}</p>
                <BlockControls pageId={pageId} blockId={block.id} isFirst={index === 0} isLast={index === blocks.length - 1} />
              </div>
              <BlockEditor pageId={pageId} block={block} />
            </CardContent>
          </Card>
        ))
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
