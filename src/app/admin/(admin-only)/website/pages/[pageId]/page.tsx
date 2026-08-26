import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { SitePageBlocksEditor } from "@/components/site-pages/block-editor/site-page-blocks-editor";
import { SitePageForm } from "@/components/site-pages/site-page-form";
import { ErrorState } from "@/components/states/error-state";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireRole } from "@/features/auth/session";
import { updateSitePageSettingsAction } from "@/features/site-pages/actions";
import { getSitePageForAdmin } from "@/features/site-pages/queries";

export const metadata: Metadata = { title: "Edit page · TV Care" };

export default async function EditSitePagePage({ params }: PageProps<"/admin/website/pages/[pageId]">) {
  await requireRole("admin", "super_admin");
  const { pageId } = await params;

  const result = await getSitePageForAdmin(pageId);

  if (result.status === "error") {
    return (
      <div className="grid gap-6">
        <ErrorState title="This page could not be loaded" />
      </div>
    );
  }

  if (!result.data) notFound();

  const page = result.data;

  return (
    <div className="mx-auto grid w-full max-w-2xl gap-6">
      <div className="grid gap-1">
        <h1>{page.title}</h1>
        <p className="text-muted-foreground">
          <Link href="/admin/website" className="underline underline-offset-4">
            Back to Website
          </Link>
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Page settings</CardTitle>
        </CardHeader>
        <CardContent>
          <SitePageForm action={updateSitePageSettingsAction} page={page} />
        </CardContent>
      </Card>

      <SitePageBlocksEditor pageId={page.id} blocks={page.blocks} />
    </div>
  );
}
