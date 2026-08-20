import { AppShell } from "@/components/shell/app-shell";
import { AREAS } from "@/components/shell/navigation";
import { requireRole } from "@/features/auth/session";

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const user = await requireRole(...AREAS.admin.roles);

  return (
    <AppShell area={AREAS.admin} user={user}>
      {children}
    </AppShell>
  );
}
