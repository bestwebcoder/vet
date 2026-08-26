import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink } from "lucide-react";

import { PageSectionEditor } from "@/components/page-sections/page-section-editor";
import { ErrorState } from "@/components/states/error-state";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsIndicator, TabsList, TabsPanel, TabsTab } from "@/components/ui/tabs";
import { requireRole } from "@/features/auth/session";
import { listPageSectionItemsForAdmin } from "@/features/page-sections/queries";
import { PAGE_SECTIONS, isPageKey, pageDefinition } from "@/lib/page-sections";

/** Every fixed page's editor is this one route — one entry per page in the registry. */
export function generateStaticParams() {
  return PAGE_SECTIONS.map((definition) => ({ page: definition.key }));
}

export async function generateMetadata({ params }: PageProps<"/admin/website/sections/[page]">): Promise<Metadata> {
  const { page } = await params;
  const definition = pageDefinition(page);
  return { title: definition ? `${definition.label} · TV Care` : "Not found" };
}

export default async function AdminPageSectionsPage({ params }: PageProps<"/admin/website/sections/[page]">) {
  const { page } = await params;
  if (!isPageKey(page)) notFound();

  const definition = pageDefinition(page);
  if (!definition) notFound();

  const user = await requireRole("admin", "super_admin");
  const organizationId = user.organizationIds[0];

  if (!organizationId) {
    return (
      <div className="grid gap-6">
        <h1>{definition.label}</h1>
        <p className="text-muted-foreground">Your account is not linked to a practice yet.</p>
      </div>
    );
  }

  const itemsBySection = await listPageSectionItemsForAdmin(organizationId, page);

  return (
    <div className="grid gap-6">
      <div className="grid gap-1">
        <Link href="/admin/website" className="text-muted-foreground hover:text-foreground flex items-center gap-1 text-sm">
          <ArrowLeft className="size-4" aria-hidden />
          Website
        </Link>
        <h1>{definition.label}</h1>
        <p className="text-muted-foreground">{definition.blurb} Drag to reorder.</p>
        <Link
          href={definition.href}
          target="_blank"
          rel="noreferrer"
          className="text-muted-foreground hover:text-foreground flex w-fit items-center gap-1 text-sm underline underline-offset-4"
        >
          View the live page
          <ExternalLink className="size-3.5" aria-hidden />
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Section items</CardTitle>
          <CardDescription>
            {definition.sections.length > 1
              ? "Each tab is its own list — items never move between sections."
              : "Each card can carry a picture, an icon, or both."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {itemsBySection.status === "error" ? (
            <ErrorState title={`${definition.label} could not be loaded`} />
          ) : definition.sections.length === 1 ? (
            <PageSectionEditor
              page={page}
              section={definition.sections[0]}
              items={itemsBySection.data[definition.sections[0].key] ?? []}
            />
          ) : (
            <Tabs defaultValue={definition.sections[0].key}>
              <TabsList>
                {definition.sections.map((section) => (
                  <TabsTab key={section.key} value={section.key}>
                    {section.label}
                  </TabsTab>
                ))}
                <TabsIndicator />
              </TabsList>
              {definition.sections.map((section) => (
                <TabsPanel key={section.key} value={section.key} className="pt-4">
                  <PageSectionEditor page={page} section={section} items={itemsBySection.data[section.key] ?? []} />
                </TabsPanel>
              ))}
            </Tabs>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
