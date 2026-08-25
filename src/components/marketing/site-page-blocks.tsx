import type { SitePageBlock } from "@/features/site-pages/queries";

/** Renders an admin-built custom page's blocks in order — the public counterpart to the /admin/website block editor. */
export function SitePageBlocks({ blocks }: { blocks: SitePageBlock[] }) {
  return (
    <>
      {blocks.map((block) => (
        <Block key={block.id} block={block} />
      ))}
    </>
  );
}

function Block({ block }: { block: SitePageBlock }) {
  switch (block.blockType) {
    case "text":
      return (
        <section className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6">
          {block.content.heading ? <h2 className="text-2xl font-semibold tracking-tight">{block.content.heading}</h2> : null}
          <div className="text-muted-foreground mt-4 grid gap-4">
            {block.content.body.split("\n\n").map((paragraph, index) => (
              <p key={index}>{paragraph}</p>
            ))}
          </div>
        </section>
      );

    case "section":
      return (
        <section className="border-border/60 border-t bg-muted/40">
          <div className="mx-auto w-full max-w-3xl px-4 py-16 text-center sm:px-6">
            <h2 className="text-2xl font-semibold tracking-tight text-balance sm:text-3xl">{block.content.heading}</h2>
            {block.content.body ? <p className="text-muted-foreground mt-4 text-balance">{block.content.body}</p> : null}
          </div>
        </section>
      );

    case "image":
      if (!block.content.url) return null;
      return (
        <section className="mx-auto w-full max-w-4xl px-4 py-10 sm:px-6">
          {/* eslint-disable-next-line @next/next/no-img-element -- admin-uploaded, arbitrary dimensions; no build-time optimization to gain here. */}
          <img src={block.content.url} alt={block.content.caption ?? ""} className="w-full rounded-2xl object-cover" />
          {block.content.caption ? <p className="text-muted-foreground mt-2 text-center text-sm">{block.content.caption}</p> : null}
        </section>
      );

    case "columns": {
      const columnClass =
        block.content.items.length >= 4 ? "sm:grid-cols-2 lg:grid-cols-4" : block.content.items.length === 3 ? "sm:grid-cols-3" : "sm:grid-cols-2";
      return (
        <section className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6">
          <div className={`grid gap-6 ${columnClass}`}>
            {block.content.items.map((item, index) => (
              <div key={index} className="grid gap-2">
                {item.heading ? <p className="font-medium">{item.heading}</p> : null}
                {item.body ? <p className="text-muted-foreground text-sm">{item.body}</p> : null}
              </div>
            ))}
          </div>
        </section>
      );
    }
  }
}
