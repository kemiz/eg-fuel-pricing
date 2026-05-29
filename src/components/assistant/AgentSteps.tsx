"use client";

import { useState } from "react";
import {
  Brain,
  Search,
  Database,
  Zap,
  ChevronRight,
  Check,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";

export type StepType = "thinking" | "tool-call" | "synthesizing" | "agent";
export type StepStatus = "active" | "done";

export interface AgentStep {
  id: string;
  type: StepType;
  label: string;
  detail?: string;
  status: StepStatus;
}

const ICONS: Record<StepType, typeof Brain> = {
  thinking: Brain,
  "tool-call": Search,
  synthesizing: Zap,
  agent: Database,
};

export function AgentStepsInline({
  steps,
  isActive,
}: {
  steps: AgentStep[];
  isActive: boolean;
}) {
  const [open, setOpen] = useState(true);
  if (!steps.length) return null;

  const activeCount = steps.filter((s) => s.status === "active").length;
  const summary = isActive
    ? steps[steps.length - 1]?.label ?? "Working…"
    : `${steps.length} step${steps.length === 1 ? "" : "s"}`;

  return (
    <div className="rounded-lg border border-eg-line bg-eg-surface-2/50">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-[11px] text-eg-ink-soft"
      >
        {isActive && activeCount > 0 ? (
          <Loader2 size={12} className="animate-spin text-eg-navy" />
        ) : (
          <Check size={12} className="text-[var(--delta-cheap-fg)]" />
        )}
        <span className="flex-1 truncate font-medium">{summary}</span>
        <ChevronRight
          size={13}
          className={cn("transition-transform", open && "rotate-90")}
        />
      </button>
      {open && (
        <div className="space-y-0.5 border-t border-eg-line px-2.5 py-1.5">
          {steps.map((s) => {
            const Icon = ICONS[s.type];
            return (
              <div key={s.id} className="flex items-start gap-2 py-0.5 text-[11px]">
                {s.status === "active" ? (
                  <Loader2 size={11} className="mt-0.5 animate-spin text-eg-navy" />
                ) : (
                  <Icon size={11} className="mt-0.5 text-eg-ink-soft" />
                )}
                <div className="min-w-0 flex-1">
                  <span className="text-eg-ink">{s.label}</span>
                  {s.detail && (
                    <div className="mt-0.5 truncate font-mono text-[10px] text-eg-ink-soft">
                      {s.detail}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
