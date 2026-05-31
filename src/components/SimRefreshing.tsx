"use client";

import { useSim } from "@/lib/sim/provider";
import { cn } from "@/lib/utils";

/**
 * Wraps a data surface and, while the simulation is applying an update
 * (`busy`), dims the live content and sweeps a shimmer across it — so the user
 * sees the surface is refreshing. The content stays in place (no layout
 * shift); the shimmer is a non-interactive overlay.
 */
export function SimRefreshing({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const { busy } = useSim();
  return (
    <div className={cn("relative", className)}>
      <div className={cn(busy && "eg-updating")}>{children}</div>
      {busy && <div className="eg-shimmer-overlay" aria-hidden />}
    </div>
  );
}
