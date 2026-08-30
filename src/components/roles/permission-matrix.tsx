"use client";

import { useState } from "react";

import { PERMISSION_MODULES, permissionKey } from "@/features/permissions/catalogue";
import { cn } from "@/lib/utils";

/**
 * The permission matrix: one row per module, one checkbox per action.
 *
 * A table on a desktop and a stack of cards on a phone — the same controls
 * either way, because a matrix that becomes a horizontally scrolling grid on a
 * phone is a matrix nobody sets correctly on a phone.
 *
 * Managing implies viewing, and the boxes say so as you tick them: ticking
 * Manage ticks View and holds it there. The server applies the same rule
 * (withImpliedViews) rather than trusting this, so a form that arrives without
 * it saves the same way.
 */
export function PermissionMatrix({
  defaultPermissions,
  disabled = false,
}: {
  defaultPermissions: string[];
  /** Renders every checkbox read-only, for a context that only wants to show a set. */
  disabled?: boolean;
}) {
  const [granted, setGranted] = useState<Set<string>>(new Set(defaultPermissions));

  function toggle(module: string, action: "view" | "manage", checked: boolean) {
    setGranted((current) => {
      const next = new Set(current);
      const key = permissionKey(module, action);

      if (checked) {
        next.add(key);
        if (action === "manage") next.add(permissionKey(module, "view"));
      } else {
        next.delete(key);
        // Taking away View takes Manage with it: editing what you cannot read
        // is not a state anybody means to configure.
        if (action === "view") next.delete(permissionKey(module, "manage"));
      }

      return next;
    });
  }

  return (
    <div className="grid gap-2">
      <div className="text-muted-foreground hidden grid-cols-[1fr_5rem_5rem] gap-2 px-3 text-xs font-medium sm:grid">
        <span>Area</span>
        <span className="text-center">View</span>
        <span className="text-center">Manage</span>
      </div>

      {PERMISSION_MODULES.map((module) => {
        const canView = granted.has(permissionKey(module.key, "view"));
        const canManage = granted.has(permissionKey(module.key, "manage"));

        return (
          <div
            key={module.key}
            className={cn(
              "grid gap-2 rounded-lg border px-3 py-3",
              "sm:grid-cols-[1fr_5rem_5rem] sm:items-center",
              canView && "border-primary/30 bg-primary/5",
            )}
          >
            <div className="grid gap-0.5">
              <span className="text-sm font-medium">{module.label}</span>
              <span className="text-muted-foreground text-xs">{module.description}</span>
            </div>

            <div className="flex gap-4 sm:contents">
              {(["view", "manage"] as const).map((action) => {
                const offered = module.actions.includes(action);
                const isChecked = action === "view" ? canView : canManage;

                return (
                  <label
                    key={action}
                    className={cn(
                      "flex min-h-11 items-center gap-2 text-sm sm:min-h-0 sm:justify-center",
                      !offered && "sm:opacity-0",
                      disabled && "cursor-not-allowed",
                    )}
                  >
                    {offered ? (
                      <>
                        <input
                          type="checkbox"
                          name="permissions"
                          value={permissionKey(module.key, action)}
                          checked={isChecked}
                          disabled={disabled}
                          onChange={(event) => toggle(module.key, action, event.target.checked)}
                          className="accent-primary size-4 disabled:opacity-60"
                        />
                        <span className="sm:sr-only">{action === "view" ? "View" : "Manage"}</span>
                      </>
                    ) : (
                      // Reports is read-only; an empty cell would read as a
                      // control that failed to render.
                      <span className="text-muted-foreground text-xs sm:text-center">
                        {action === "manage" ? "—" : null}
                      </span>
                    )}
                  </label>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
