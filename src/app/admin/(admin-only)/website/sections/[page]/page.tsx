import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink } from "lucide-react";

import { PageContentForm, type PageContentFieldView } from "@/components/page-sections/page-content-form";
import { PageSectionEditor } from "@/components/page-sections/page-section-editor";
import { ServiceSectionManager, type ServiceSection } from "@/components/services/service-section-manager";
import { ErrorState } from "@/components/states/error-state";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsIndicator, TabsList, TabsPanel, TabsTab } from "@/components/ui/tabs";
import { requireRole } from "@/features/auth/session";
import { getOwnOrganization } from "@/features/organizations/queries";
import { listPageSectionItemsForAdmin } from "@/features/page-sections/queries";
import { listAllCategories } from "@/features/service-categories/queries";
import { listAllServices } from "@/features/services/queries";
import { siteContentFieldsFor } from "@/features/site-content/fields";
import { getSiteContentForAdmin } from "@/features/site-content/queries";
import { PAGE_SECTIONS, isEditorPageKey, isPageKey, pageDefinition } from "@/lib/page-sections";
import { categoriesFor, categoriesForCatalogue, intoCategories } from "@/lib/service-pages";

/** Every page's editor is this one route — one entry per page in the registry. */
export function generateStaticParams() {
  return PAGE_SECTIONS.map((definition) => ({ page: definition.key }));
}

export async function generateMetadata({ params }: PageProps<"/admin/website/sections/[page]">): Promise<Metadata> {
  const { page } = await params;
  const definition = pageDefinition(page);
  return { title: definition ? `${definition.label} · TV Care` : "Not found" };
}

/**
 * One page, one screen: its text and its card lists together.
 *
 * These used to be two separate places — "Public website content" held every
 * page's copy behind its own sub-menu, while the card lists lived here — so
 * editing one page meant working in two screens that each showed a different
 * slice of every page.
 */
export default async function AdminWebsitePageEditor({ params }: PageProps<"/admin/website/sections/[page]">) {
  const { page } = await params;
  if (!isEditorPageKey(page)) notFound();

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

  const contentFields = siteContentFieldsFor(page);

  // Each read is skipped on a page that cannot have that thing: the footer has
  // no card list, so it never queries a table no row of it could be in (see
  // EDITOR_PAGE_KEYS), and only a page that renders service blocks reads the
  // catalogue.
  const [organization, siteContent, itemsBySection, categories, services] = await Promise.all([
    getOwnOrganization(organizationId),
    getSiteContentForAdmin(organizationId),
    isPageKey(page) ? listPageSectionItemsForAdmin(organizationId, page) : Promise.resolve(null),
    definition.serviceSections ? listAllCategories() : Promise.resolve(null),
    definition.serviceSections ? listAllServices() : Promise.resolve(null),
  ]);

  /**
   * The page's blocks, in the order it renders them, each paired with the
   * category record behind its heading so the heading is editable too.
   *
   * Grouped by the same function the public page uses, so the editor cannot
   * drift out of step with what a visitor sees — including which categories
   * have left this page for one of their own.
   */
  const serviceSections: ServiceSection[] | null =
    categories === null || services === null || categories.status === "error" || services.status === "error"
      ? null
      : (() => {
          const grouped = intoCategories(services.data);
          const forThisPage =
            definition.serviceSections === "catalogue"
              ? categoriesForCatalogue(grouped)
              : categoriesFor(grouped, definition.href);

          return forThisPage.map((group) => ({
            category: categories.data.find((candidate) => candidate.id === group.key) ?? null,
            heading: group.name,
            description: group.description,
            icon: group.icon,
            services: group.services,
          }));
        })();

  const practiceName = organization.status === "ok" ? (organization.data?.name ?? "The Traveling Vet") : "The Traveling Vet";

  // Resolved here rather than in the form: each field's default is a function
  // of the practice name, and a function cannot cross into a client component.
  const fieldViews = (content: Record<string, string>): PageContentFieldView[] =>
    contentFields.map((field) => ({
      key: field.key,
      label: field.label,
      multiline: Boolean(field.multiline),
      value: content[field.key] ?? "",
      defaultText: field.defaultValue(practiceName),
    }));

  return (
    <div className="grid gap-6">
      <div className="grid gap-1">
        <Link href="/admin/website" className="text-muted-foreground hover:text-foreground flex items-center gap-1 text-sm">
          <ArrowLeft className="size-4" aria-hidden />
          Website
        </Link>
        <h1>{definition.label}</h1>
        <p className="text-muted-foreground">{definition.blurb}</p>
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

      {contentFields.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Text</CardTitle>
            <CardDescription>Headings and body copy. Leave a field blank to use its default text.</CardDescription>
          </CardHeader>
          <CardContent>
            {siteContent.status === "ok" ? (
              <PageContentForm page={page} fields={fieldViews(siteContent.data)} />
            ) : (
              <ErrorState title="Page text could not be loaded" />
            )}
          </CardContent>
        </Card>
      ) : null}

      {definition.sections.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Card lists</CardTitle>
            <CardDescription>
              {definition.sections.length > 1
                ? "Each tab is its own list — items never move between sections. Drag to reorder."
                : "Drag to reorder. Each card can carry a picture, an icon, or both."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {itemsBySection === null || itemsBySection.status === "error" ? (
              <ErrorState title="Card lists could not be loaded" />
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
      ) : null}

      {definition.serviceSections ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Service blocks</CardTitle>
            <CardDescription>
              How each service reads on this page — its title, tagline, list of points and fee lines. Price, duration
              and booking settings live in Services; nothing saved here touches them.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {serviceSections === null ? (
              <ErrorState title="Service blocks could not be loaded" />
            ) : (
              <ServiceSectionManager sections={serviceSections} />
            )}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
