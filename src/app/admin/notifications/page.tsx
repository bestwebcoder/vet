import type { Metadata } from "next";

import { FailedNotificationsList } from "@/components/notifications/failed-notifications-list";
import { ProcessNowButton } from "@/components/notifications/process-now-button";
import { QuietHoursForm } from "@/components/notifications/quiet-hours-form";
import { TemplateEditor } from "@/components/notifications/template-editor";
import { Pagination } from "@/components/search/pagination";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireRole } from "@/features/auth/session";
import { getFailedNotifications } from "@/features/notifications/queries";
import { getTemplates } from "@/features/notifications/templates";
import { getOwnOrganization } from "@/features/organizations/queries";

export const metadata: Metadata = { title: "Notifications · TV Care" };

export default async function AdminNotificationsPage({ searchParams }: PageProps<"/admin/notifications">) {
  const user = await requireRole("admin", "super_admin");
  const organizationId = user.organizationIds[0];
  const { page: pageParam } = await searchParams;
  const page = typeof pageParam === "string" ? Number(pageParam) || 1 : 1;

  if (!organizationId) {
    return (
      <div className="grid gap-6">
        <h1>Notifications</h1>
        <p className="text-muted-foreground">Your account is not linked to a practice yet.</p>
      </div>
    );
  }

  const [organizationResult, templatesResult, failedResult] = await Promise.all([
    getOwnOrganization(organizationId),
    getTemplates(organizationId),
    getFailedNotifications(organizationId, { page }),
  ]);

  return (
    <div className="grid gap-6">
      <div className="grid gap-1">
        <h1>Notifications</h1>
        <p className="text-muted-foreground">
          Delivery content, quiet hours, and anything that has not gone out.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Quiet hours</CardTitle>
        </CardHeader>
        <CardContent>
          <QuietHoursForm
            organizationId={organizationId}
            quietHoursStart={organizationResult.status === "ok" ? (organizationResult.data?.quietHoursStart ?? null) : null}
            quietHoursEnd={organizationResult.status === "ok" ? (organizationResult.data?.quietHoursEnd ?? null) : null}
          />
        </CardContent>
      </Card>

      <TemplateEditor organizationId={organizationId} templates={templatesResult.status === "ok" ? templatesResult.data : []} />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Dispatch</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground mb-3 text-sm">
            In production, due notifications are sent automatically by an external scheduler. Use this to send
            anything currently due right now, without waiting.
          </p>
          <ProcessNowButton />
        </CardContent>
      </Card>

      <FailedNotificationsList notifications={failedResult.status === "ok" ? failedResult.data : []} />
      {failedResult.status === "ok" ? (
        <Pagination
          basePath="/admin/notifications"
          searchParams={{}}
          page={failedResult.page}
          pageSize={failedResult.pageSize}
          totalCount={failedResult.totalCount}
        />
      ) : null}
    </div>
  );
}
