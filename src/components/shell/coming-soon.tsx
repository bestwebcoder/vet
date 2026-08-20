import { Hammer } from "lucide-react";

import type { NavItem } from "@/components/shell/navigation";
import { EmptyState } from "@/components/states/empty-state";
import { Card, CardContent } from "@/components/ui/card";

/**
 * Stands in for a screen a later phase delivers. A navigation item that leads
 * nowhere is worse than one that explains itself, so unbuilt items say what
 * they will do rather than 404.
 */
export function ComingSoon({ item }: { item: NavItem }) {
  return (
    <div className="grid gap-6">
      <h1>{item.label}</h1>
      <Card>
        <CardContent>
          <EmptyState
            icon={Hammer}
            title={`${item.label} is not available yet`}
            description="This part of TV Care is still being built. Everything you can reach today is fully working — nothing here is a placeholder for real records."
          />
        </CardContent>
      </Card>
    </div>
  );
}
