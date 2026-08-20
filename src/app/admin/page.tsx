import { requireRole } from "@/features/auth/session";

export default async function AdminHomePage() {
  const user = await requireRole("admin", "super_admin");

  return (
    <div className="grid gap-6">
      <div className="grid gap-1">
        <h1>Practice overview</h1>
        <p className="text-muted-foreground">Signed in as {user.fullName}.</p>
      </div>
    </div>
  );
}
