export function DashboardHeader({
  title,
  subtitle,
}: {
  title: string;
  subtitle: string;
}) {
  return (
    <div className="grid gap-1">
      <h1>{title}</h1>
      <p className="text-muted-foreground">{subtitle}</p>
    </div>
  );
}
