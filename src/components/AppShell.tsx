"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Sparkles,
  Fuel,
  BarChart3,
  Moon,
  Sun,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Brand } from "@/components/Brand";
import { SimBar } from "@/components/SimBar";
import { useTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

const NAV: NavItem[] = [
  { href: "/", label: "Ask EG", icon: Sparkles },
  { href: "/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/sites", label: "Sites", icon: Fuel },
];

function isActive(href: string, pathname: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(href + "/");
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      {/* Aurora backdrop the frosted glass panels blur over. */}
      <div className="eg-aurora" aria-hidden />
      <header className="eg-glass-header z-30 shrink-0">
        <div className="mx-auto flex max-w-[90rem] items-center justify-between px-4 py-3">
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
        <div className="mx-auto max-w-[90rem] px-2">
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
                    <span className="absolute inset-x-2 bottom-0 h-0.5 rounded-t-full bg-eg-green" />
                  )}
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Global simulation control bar. */}
        <SimBar />
      </header>

      <main className="eg-scroll min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto h-full max-w-[90rem] px-4 py-7">{children}</div>
      </main>
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
