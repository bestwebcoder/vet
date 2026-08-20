import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { DesignSystemShowcase } from "./showcase";

export const metadata: Metadata = { title: "Design system · TV Care" };

/**
 * Internal reference for the Phase 1 design system. Not part of the product:
 * it exists so the tokens, primitives and states can be reviewed in one place
 * and checked at 375px without hunting through screens.
 */
export default function DesignSystemPage() {
  if (process.env.NODE_ENV === "production") {
    notFound();
  }

  return <DesignSystemShowcase />;
}
