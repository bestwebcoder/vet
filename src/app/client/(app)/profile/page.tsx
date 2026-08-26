import type { Metadata } from "next";

import { AvatarUploadCard } from "@/components/profile/avatar-upload-card";
import { ChangePasswordCard } from "@/components/profile/change-password-card";
import { ErrorState } from "@/components/states/error-state";
import { Card, CardContent } from "@/components/ui/card";
import { requireRole } from "@/features/auth/session";
import { getOwnClientRecord, listBranches } from "@/features/clients/queries";

import { ProfileForm } from "./profile-form";

export const metadata: Metadata = { title: "My profile · TV Care" };

export default async function ClientProfilePage() {
  const user = await requireRole("client");
  const [record, branches] = await Promise.all([getOwnClientRecord(), listBranches()]);

  return (
    <div className="mx-auto grid w-full max-w-xl gap-6">
      <div className="grid gap-1">
        <h1>My profile</h1>
        <p className="text-muted-foreground">
          The contact details your clinic holds. Signed in as {user.email}.
        </p>
      </div>

      {record.status === "error" ? (
        <Card>
          <CardContent>
            <ErrorState title="Your details could not be loaded" />
          </CardContent>
        </Card>
      ) : !record.data ? (
        <Card>
          <CardContent>
            <ErrorState
              title="Your record is not set up yet"
              description="Your clinic has not finished setting up your record. Contact The Traveling Vet if this does not resolve."
            />
          </CardContent>
        </Card>
      ) : (
        <>
          <AvatarUploadCard avatarUrl={user.avatarUrl} />
          <ProfileForm client={record.data} branches={branches} />
          <ChangePasswordCard />
        </>
      )}
    </div>
  );
}
