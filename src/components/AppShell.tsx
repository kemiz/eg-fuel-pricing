"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Map as MapIcon,
  Sparkles,
  Fuel,
  Moon,
  Sun,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Brand } from "@/components/Brand";
import { useTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

const NAV: NavItem[] = [
  { href: "/", label: "Overview", icon: LayoutDashboard },
  { href: "/network", label: "Network map", icon: MapIcon },
  { href: "/sites", label: "Sites", icon: Fuel },
  { href: "/ask", label: "Ask EG", icon: Sparkles },
];

function isActive(href: string, pathname: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(href + "/");
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen">
      <header className="eg-gradient sticky top-0 z-30 border-b border-black/20">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
          <Brand />
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <a
              className="hidden text-sm text-white/70 transition-colors hover:text-white sm:inline"
              href="https://www.eg.group/about-us/"
              target="_blank"
              rel="noreferrer"
            >
              About EG Group
            </a>
          </div>
        </div>

        {/* Tab nav row */}
        <div className="mx-auto max-w-7xl px-2">
          <nav className="flex items-center gap-1 overflow-x-auto">
            {NAV.map((item) => {
              const active = isActive(item.href, pathname);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "relative flex items-center gap-2 whitespace-nowrap px-3.5 py-2.5 text-sm transition-colors",
                    active
                      ? "font-semibold text-white"
                      : "text-white/65 hover:text-white"
                  )}
                >
                  <Icon size={15} />
                  {item.label}
                  {active && (
                    <span className="absolute inset-x-2 bottom-0 h-0.5 rounded-t-full bg-eg-red" />
                  )}
                </Link>
              );
            })}
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-7">{children}</main>

      <footer className="mx-auto max-w-7xl px-4 py-8 text-xs text-eg-ink-soft">
        EG Fuel Price Optimisation — prototype. Synthetic data; not real EG or
        competitor pricing. Powered by Databricks Lakebase + Model Serving.
      </footer>
    </div>
  );
}

function ThemeToggle() {
  const { resolved, toggle } = useTheme();
  return (
    <button
      onClick={toggle}
      className="rounded-full p-2 text-white/70 transition-colors hover:bg-white/10 hover:text-white"
      aria-label="Toggle theme"
    >
      {resolved === "dark" ? <Sun size={16} /> : <Moon size={16} />}
    </button>
  );
}
