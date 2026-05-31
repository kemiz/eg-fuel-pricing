"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

type FlashTone = "good" | "bad" | "neutral";

/**
 * Briefly highlights its children when `value` changes from the previously
 * rendered value — used to draw the eye to cells that moved as the simulation
 * advances a day. `numeric` (when provided) picks the colour automatically:
 * higher = good (green), lower = bad (red); `invert` flips that (e.g. a price
 * gap where lower is better). A non-numeric change flashes neutral (blue).
 */
export function ChangeFlash({
  value,
  numeric,
  invert = false,
  children,
  className,
  as: Tag = "span",
}: {
  /** Stable comparable key for the current value (e.g. formatted string). */
  value: string | number;
  /** Optional numeric value to infer up/down direction. */
  numeric?: number | null;
  invert?: boolean;
  children: React.ReactNode;
  className?: string;
  as?: "span" | "div" | "td";
}) {
  const prevValue = useRef<string | number | undefined>(undefined);
  const prevNumeric = useRef<number | null | undefined>(undefined);
  const [flash, setFlash] = useState<FlashTone | null>(null);
  // Bump key so re-triggering the same animation restarts it.
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const had = prevValue.current !== undefined;
    const changed = had && prevValue.current !== value;

    if (changed) {
      let tone: FlashTone = "neutral";
      if (
        numeric != null &&
        prevNumeric.current != null &&
        Number.isFinite(numeric) &&
        Number.isFinite(prevNumeric.current)
      ) {
        const up = numeric > (prevNumeric.current as number);
        tone = up ? (invert ? "bad" : "good") : invert ? "good" : "bad";
      }
      setFlash(tone);
      setTick((t) => t + 1);
    }

    prevValue.current = value;
    prevNumeric.current = numeric;
  }, [value, numeric, invert]);

  // Clear the class after the animation so it can re-fire next change.
  useEffect(() => {
    if (flash == null) return;
    const id = setTimeout(() => setFlash(null), 1500);
    return () => clearTimeout(id);
  }, [flash, tick]);

  return (
    <Tag
      key={tick}
      className={cn(
        flash === "good" && "eg-flash-good",
        flash === "bad" && "eg-flash-bad",
        flash === "neutral" && "eg-flash-neutral",
        className
      )}
    >
      {children}
    </Tag>
  );
}
