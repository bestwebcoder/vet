import { requireRole } from "@/features/auth/session";

export default async function ClientHomePage() {
  const user = await requireRole("client");

  return (
    <div className="grid gap-6">
      <div className="grid gap-1">
        <h1>Welcome, {user.fullName.split(" ")[0]}</h1>
        <p className="text-muted-foreground">Your pets, appointments and records.</p>
      </div>
    </div>
  );
}
