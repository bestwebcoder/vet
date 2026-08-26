import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { HomeSectionEditor } from "@/components/home-sections/home-section-editor";
import { ErrorState } from "@/components/states/error-state";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsIndicator, TabsList, TabsPanel, TabsTab } from "@/components/ui/tabs";
import { requireRole } from "@/features/auth/session";
import { listHomeSectionItemsForAdmin } from "@/features/home-sections/queries";

export const metadata: Metadata = { title: "Home page sections · TV Care" };

const SECTION_TABS = [
  { value: "services", label: "What we offer" },
  { value: "why", label: "Why choose us" },
  { value: "how_it_works", label: "How it works" },
] as const;

export default async function AdminHomeSectionsPage() {
  const user = await requireRole("admin", "super_admin");
  const organizationId = user.organizationIds[0];

  if (!organizationId) {
    return (
      <div className="grid gap-6">
        <h1>Home page sections</h1>
        <p className="text-muted-foreground">Your account is not linked to a practice yet.</p>
      </div>
    );
  }

  const itemsBySection = await listHomeSectionItemsForAdmin(organizationId);

  return (
    <div className="grid gap-6">
      <div className="grid gap-1">
        <Link href="/admin/website" className="text-muted-foreground hover:text-foreground flex items-center gap-1 text-sm">
          <ArrowLeft className="size-4" aria-hidden />
          Website
        </Link>
        <h1>Home page sections</h1>
        <p className="text-muted-foreground">
          The item lists in &ldquo;What we offer&rdquo;, &ldquo;Why pet owners choose&rdquo; and &ldquo;How it works&rdquo; on
          the home page. Drag to reorder.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Section items</CardTitle>
          <CardDescription>Each tab is its own list — items never move between sections.</CardDescription>
        </CardHeader>
        <CardContent>
          {itemsBySection.status === "error" ? (
            <ErrorState title="Home page sections could not be loaded" />
          ) : (
            <Tabs defaultValue={SECTION_TABS[0].value}>
              <TabsList>
                {SECTION_TABS.map((tab) => (
                  <TabsTab key={tab.value} value={tab.value}>
                    {tab.label}
                  </TabsTab>
                ))}
                <TabsIndicator />
              </TabsList>
              {SECTION_TABS.map((tab) => (
                <TabsPanel key={tab.value} value={tab.value} className="pt-4">
                  <HomeSectionEditor section={tab.value} items={itemsBySection.data[tab.value]} />
                </TabsPanel>
              ))}
            </Tabs>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
