import type { Metadata } from "next";

import { ArchivePanel } from "@/components/data/archive-panel";
import { ErrorState } from "@/components/states/error-state";
import { Card, CardContent } from "@/components/ui/card";
import { requireRole } from "@/features/auth/session";
import { getArchive } from "@/features/data/queries";

export const metadata: Metadata = { title: "Archive · TV Care" };

export default async function AdminDataArchivePage() {
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

  const archive = await getArchive(organizationId);

  if (archive.status === "error") {
    return (
      <Card>
        <CardContent>
          <ErrorState title="The archive could not be loaded" />
        </CardContent>
      </Card>
    );
  }

  return <ArchivePanel sections={archive.data} />;
}
