import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { ThemeProvider } from "@/lib/theme";
import { SimProvider } from "@/lib/sim/provider";
import { AppShell } from "@/components/AppShell";
import "./globals.css";

// Inter is a highly legible humanist sans (close to EG Group's web type) and
// JetBrains Mono gives clear tabular figures for prices/KPIs. Both expose the
// CSS variables the theme expects (--font-geist-sans / --font-geist-mono).
const sans = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-geist-sans",
});

const mono = JetBrains_Mono({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-geist-mono",
});

export const metadata: Metadata = {
  title: "EG Fuel Price Optimisation",
  description:
    "Multi-agent fuel price optimisation for EG Group forecourts — powered by Databricks.",
  icons: { icon: "/icon.svg" },
};

export const viewport: Viewport = {
  themeColor: "#005fab",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${sans.variable} ${mono.variable}`}
      suppressHydrationWarning
    >
      <body className="min-h-screen text-eg-ink antialiased">
        <ThemeProvider>
          <SimProvider>
            <AppShell>{children}</AppShell>
          </SimProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
