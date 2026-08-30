import type { Metadata } from "next";

import { BackupPanel } from "@/components/data/backup-panel";
import { ErrorState } from "@/components/states/error-state";
import { Card, CardContent } from "@/components/ui/card";
import { requireRole } from "@/features/auth/session";
import { getDataHistory } from "@/features/data/queries";

export const metadata: Metadata = { title: "Backup · TV Care" };

export default async function AdminDataBackupPage() {
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

  const history = await getDataHistory(organizationId);

  if (history.status === "error") {
    return (
      <Card>
        <CardContent>
          <ErrorState title="The backup history could not be loaded" />
        </CardContent>
      </Card>
    );
  }

  return <BackupPanel exports={history.data.exports} daysSinceExport={history.data.daysSinceExport} />;
}
