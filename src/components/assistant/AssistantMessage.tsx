"use client";

import { createContext, useContext } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { InlineArtifact } from "./ArtifactRenderer";

/* -------------------------------------------------------------------------- */
/*  Entity drill-down context                                                 */
/* -------------------------------------------------------------------------- */

export interface EntityHandlers {
  /** Open a site detail / focus the map on a site. */
  onSite?: (siteId: string) => void;
  /** Open a region drill-down. */
  onRegion?: (region: string) => void;
}

const EntityCtx = createContext<EntityHandlers>({});

export function EntityProvider({
  handlers,
  children,
}: {
  handlers: EntityHandlers;
  children: React.ReactNode;
}) {
  return <EntityCtx.Provider value={handlers}>{children}</EntityCtx.Provider>;
}

/* -------------------------------------------------------------------------- */
/*  Content sanitiser                                                         */
/* -------------------------------------------------------------------------- */

/**
 * Strip model scaffolding from the visible content:
 *   - <thinking>…</thinking> reasoning blocks
 *   - tool-call JSON fences (```json {"tool": …} ```)
 *   - bare tool-call objects
 *   - the hidden <!-- FOLLOWUPS: [...] --> metadata
 */
export function cleanContent(content: string): string {
  let c = content;
  c = c.replace(/<thinking>[\s\S]*?<\/thinking>/gi, "");
  c = c.replace(/<thinking>[\s\S]*$/gi, "");
  // Tool-call JSON fences.
  c = c.replace(/```(?:json)?\s*\{[\s\S]*?"tool"\s*:[\s\S]*?\}\s*```/gi, "");
  // Bare tool-call objects.
  c = c.replace(/\{[^{}]*"tool"\s*:\s*"[^"]+"[^{}]*\}/g, "");
  // Follow-up metadata (complete or still-streaming/partial).
  c = c.replace(/<!--\s*FOLLOWUPS:[\s\S]*?-->/gi, "");
  c = c.replace(/<!--\s*FOLLOWUPS:[\s\S]*$/gi, "");
  // Neutralise stray single tildes. The model uses "~" as shorthand for
  // "approximately" (e.g. "by ~3.9p ... (~£127k/day"), but remark-gfm reads a
  // pair of single tildes as a strikethrough span, so everything between two
  // such "~" got struck through. Escape lone tildes (those NOT part of a real
  // "~~…~~" pair) to "\~" so they render literally, while leaving genuine
  // double-tilde strikethrough intact.
  c = c.replace(/~~([\s\S]*?)~~/g, "\u0000\u0000$1\u0000\u0000"); // shield real ~~ pairs
  c = c.replace(/~/g, "\\~"); // escape remaining lone tildes
  c = c.replace(/\u0000\u0000/g, "~~"); // restore shielded pairs
  return c.trim();
}

/** Extract follow-up suggestions from the hidden FOLLOWUPS comment. */
export function parseFollowUps(content: string): string[] {
  const m = content.match(/<!--\s*FOLLOWUPS:\s*(\[[\s\S]*?\])\s*-->/i);
  if (!m) return [];
  try {
    const arr = JSON.parse(m[1]) as unknown;
    if (Array.isArray(arr)) {
      return arr
        .filter((x): x is string => typeof x === "string" && x.trim().length > 0)
        .slice(0, 4);
    }
  } catch {
    /* ignore malformed */
  }
  return [];
}

/* -------------------------------------------------------------------------- */
/*  Custom markdown components                                                */
/* -------------------------------------------------------------------------- */

const CHART_RE = /language-(chart:[\w-]+|card:[\w-]+)/;

function EntityLink({
  href,
  children,
}: {
  href?: string;
  children?: React.ReactNode;
}) {
  const handlers = useContext(EntityCtx);
  const scheme = (href ?? "").trim();
  const siteMatch = scheme.match(/^site:(.+)$/i);
  const regionMatch = scheme.match(/^region:(.+)$/i);

  if (siteMatch && handlers.onSite) {
    const id = siteMatch[1];
    return (
      <button
        type="button"
        className="eg-entity"
        onClick={(e) => {
          e.preventDefault();
          handlers.onSite?.(id);
        }}
      >
        {children}
      </button>
    );
  }
  if (regionMatch && handlers.onRegion) {
    const region = decodeURIComponent(regionMatch[1]);
    return (
      <button
        type="button"
        className="eg-entity"
        onClick={(e) => {
          e.preventDefault();
          handlers.onRegion?.(region);
        }}
      >
        {children}
      </button>
    );
  }

  // Regular link.
  return (
    <a href={href} target="_blank" rel="noreferrer">
      {children}
    </a>
  );
}

const COMPONENTS: Components = {
  a: EntityLink,
  code({ className, children }) {
    const match = className?.match(CHART_RE);
    if (match) {
      const body = String(children ?? "").replace(/\n$/, "");
      return <InlineArtifact type={match[1]} body={body} />;
    }
    return <code className={className}>{children}</code>;
  },
  pre({ children }) {
    // If the only child is an inline artifact, drop the <pre> wrapper.
    const child = Array.isArray(children) ? children[0] : children;
    const props = (child as { props?: { className?: string } } | undefined)?.props;
    if (props?.className && CHART_RE.test(props.className)) {
      return <>{children}</>;
    }
    return <pre>{children}</pre>;
  },
};

/* -------------------------------------------------------------------------- */
/*  Public renderer                                                           */
/* -------------------------------------------------------------------------- */

export function AssistantMarkdown({ content }: { content: string }) {
  const cleaned = cleanContent(content);
  if (!cleaned) return null;
  return (
    <div className="eg-md">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={COMPONENTS}>
        {cleaned}
      </ReactMarkdown>
    </div>
  );
}
