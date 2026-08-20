import Link from "next/link";

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="bg-muted/40 flex min-h-svh flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <Link href="/" className="inline-block">
            <p className="text-2xl font-semibold tracking-tight">TV Care</p>
            <p className="text-muted-foreground mt-1 text-sm">The Traveling Vet</p>
          </Link>
        </div>
        {children}
      </div>
    </div>
  );
}
