import { AppShell } from "@/components/shell/app-shell";
import { AREAS } from "@/components/shell/navigation";
import { requireRole } from "@/features/auth/session";

export default async function DoctorLayout({ children }: LayoutProps<"/doctor">) {
  const user = await requireRole(...AREAS.doctor.roles);

  return (
    <AppShell area={AREAS.doctor} user={user}>
      {children}
    </AppShell>
  );
}
