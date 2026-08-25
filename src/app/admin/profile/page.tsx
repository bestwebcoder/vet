import type { Metadata } from "next";

import { AccountInfoCard } from "@/components/profile/account-info-card";
import { AvatarUploadCard } from "@/components/profile/avatar-upload-card";
import { ChangePasswordCard } from "@/components/profile/change-password-card";
import { requireRole } from "@/features/auth/session";

export const metadata: Metadata = { title: "My profile · TV Care" };

export default async function AdminProfilePage() {
  const user = await requireRole("admin", "super_admin");

  return (
    <div className="mx-auto grid w-full max-w-xl gap-6">
      <div className="grid gap-1">
        <h1>My profile</h1>
        <p className="text-muted-foreground">Signed in as {user.email}.</p>
      </div>

      <AccountInfoCard fullName={user.fullName} email={user.email} phone={user.phone} />
      <AvatarUploadCard avatarUrl={user.avatarUrl} />
      <ChangePasswordCard />
    </div>
  );
}
