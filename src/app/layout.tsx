import type { Metadata, Viewport } from "next";
import { Brand } from "@/components/Brand";
import "./globals.css";

export const metadata: Metadata = {
  title: "EG Fuel Price Optimisation",
  description:
    "Multi-agent fuel price optimisation for EG Group forecourts — powered by Databricks.",
  icons: { icon: "/icon.svg" },
};

export const viewport: Viewport = {
  themeColor: "#0a1f44",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-eg-paper text-eg-ink antialiased">
        <header className="eg-gradient sticky top-0 z-30 border-b border-black/20">
          <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
            <Brand />
            <nav className="flex items-center gap-4 text-sm text-white/80">
              <a
                className="hover:text-white transition-colors"
                href="https://www.eg.group/about-us/"
                target="_blank"
                rel="noreferrer"
              >
                About EG Group
              </a>
            </nav>
          </div>
        </header>
        <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>
        <footer className="mx-auto max-w-7xl px-4 py-8 text-xs text-eg-ink-soft">
          EG Fuel Price Optimisation — prototype. Synthetic data; not real EG or
          competitor pricing.
        </footer>
      </body>
    </html>
  );
}
