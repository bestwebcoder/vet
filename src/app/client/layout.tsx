import { AppShell } from "@/components/shell/app-shell";
import { AREAS } from "@/components/shell/navigation";
import { requireRole } from "@/features/auth/session";

export default async function ClientLayout({ children }: LayoutProps<"/client">) {
  const user = await requireRole(...AREAS.client.roles);

  return (
    <AppShell area={AREAS.client} user={user}>
      {children}
    </AppShell>
  );
}
