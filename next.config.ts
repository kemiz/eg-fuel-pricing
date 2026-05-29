import type { NextConfig } from "next";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));

function git(cmd: string): string {
  try {
    return execSync(`git ${cmd}`, { encoding: "utf8" }).trim();
  } catch {
    return "";
  }
}

const pkg = JSON.parse(readFileSync("./package.json", "utf8")) as {
  version?: string;
};
const appVersion = pkg.version ?? "0.0.0";
const gitSha = git("rev-parse --short HEAD") || "unknown";
const gitBranch = git("rev-parse --abbrev-ref HEAD") || "unknown";
const buildTime = new Date().toISOString();

const nextConfig: NextConfig = {
  // Emit a self-contained server bundle under `.next/standalone/` so
  // Databricks Apps can run the committed artifact directly.
  output: "standalone",

  // Keep native / CJS Databricks and Postgres dependencies out of the server
  // bundle so Next copies the full packages into standalone node_modules.
  serverExternalPackages: [
    "@databricks/sql",
    "@databricks/lakebase",
    "lz4",
    "thrift",
    "pg",
    "pg-native",
  ],

  turbopack: {
    root,
  },

  env: {
    NEXT_PUBLIC_APP_VERSION: appVersion,
    NEXT_PUBLIC_BUILD_ID: gitSha,
    NEXT_PUBLIC_BUILD_BRANCH: gitBranch,
    NEXT_PUBLIC_BUILD_TIME: buildTime,
  },

  generateBuildId: () => gitSha,
  poweredByHeader: false,
  productionBrowserSourceMaps: false,
  compress: true,

  headers: async () => [
    {
      source: "/:path*",
      headers: [
        { key: "X-Frame-Options", value: "ALLOWALL" },
        { key: "Content-Security-Policy", value: "frame-ancestors *" },
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "X-XSS-Protection", value: "1; mode=block" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      ],
    },
  ],

  images: {
    formats: ["image/avif", "image/webp"],
  },
};

export default nextConfig;
