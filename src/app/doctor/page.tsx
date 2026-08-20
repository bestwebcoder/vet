import { requireRole } from "@/features/auth/session";

export default async function DoctorHomePage() {
  const user = await requireRole("doctor");

  return (
    <div className="grid gap-6">
      <div className="grid gap-1">
        <h1>Today</h1>
        <p className="text-muted-foreground">Signed in as {user.fullName}.</p>
      </div>
    </div>
  );
}
