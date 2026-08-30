import type { Metadata } from "next";

import { HealthPanel } from "@/components/data/health-panel";
import { ErrorState } from "@/components/states/error-state";
import { Card, CardContent } from "@/components/ui/card";
import { requireRole } from "@/features/auth/session";
import { getDatabaseHealth } from "@/features/data/queries";

export const metadata: Metadata = { title: "Database health · TV Care" };

export default async function AdminDataHealthPage() {
  const user = await requireRole("admin", "super_admin");
  const organizationId = user.organizationIds[0];

  if (!organizationId) {
    return (
      <Card>
        <CardContent>
          <ErrorState title="Your account is not linked to a practice yet" />
        </CardContent>
      </Card>
    );
  }

  const health = await getDatabaseHealth(organizationId);

  if (health.status === "error") {
    return (
      <Card>
        <CardContent>
          <ErrorState title="The database summary could not be loaded" />
        </CardContent>
      </Card>
    );
  }

  return <HealthPanel health={health.data} />;
}
