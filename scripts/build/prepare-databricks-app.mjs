// Prepare a compact `.next/standalone/` bundle for Databricks Apps git deploys.
//
// The Apps platform's egress proxy blocks the npm registry, so runtime deps
// have to ship with the committed source. Instead of committing tens of
// thousands of files under `.next/standalone/node_modules/`, we:
//
//   1. Copy `public/` and `.next/static` into `.next/standalone/` (the
//      standalone bundler doesn't include them).
//   2. Archive `.next/standalone/node_modules/` to `node_modules.tgz` and
//      remove the directory (huge git diff -> single binary blob).
//   3. Delete `.next/standalone/package.json` so the Apps runtime does NOT
//      try to npm install in a proxy-blocked workspace.
//   4. Generate `.next/standalone/app.yaml` whose `command:` copies the
//      bundle to $TMPDIR, untars node_modules, and runs `node server.js`.
//      The `env:` block is sliced verbatim from the repo-root `app.yaml`,
//      which stays the single source of truth for runtime env.
//
// Used by `scripts/deploy.sh` and `scripts/release.sh`.

import { execFileSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readlinkSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const nextDir = join(repoRoot, ".next");
const standaloneDir = join(nextDir, "standalone");
const standaloneNextDir = join(standaloneDir, ".next");
const nodeModulesDir = join(standaloneDir, "node_modules");
const nodeModulesArchive = join(standaloneDir, "node_modules.tgz");
const standalonePackageJson = join(standaloneDir, "package.json");

function run(command, args, options = {}) {
  execFileSync(command, args, {
    cwd: repoRoot,
    env: { ...process.env, ...options.env },
    stdio: "inherit",
  });
}

function copyIfExists(from, to) {
  if (!existsSync(from)) {
    return;
  }
  rmSync(to, { force: true, recursive: true });
  cpSync(from, to, { recursive: true });
}

if (!existsSync(standaloneDir)) {
  throw new Error(
    "Missing .next/standalone. Run `next build` before preparing the app bundle.",
  );
}

mkdirSync(standaloneNextDir, { recursive: true });
copyIfExists(join(repoRoot, "public"), join(standaloneDir, "public"));
copyIfExists(join(nextDir, "static"), join(standaloneNextDir, "static"));

// Dereference every symlink under `.next/standalone/` so the committed tree
// is plain directories only. Turbopack's `serverExternalPackages` mechanism
// emits hashed-name symlinks that the Databricks Apps git-source sync would
// otherwise flatten into plain text files, breaking module resolution.
function dereferenceSymlinks(root) {
  const links = execFileSync("/usr/bin/find", [root, "-type", "l"], {
    encoding: "utf8",
  })
    .split("\n")
    .filter(Boolean);
  let resolved = 0;
  for (const sym of links) {
    const target = readlinkSync(sym);
    const absTarget = resolve(dirname(sym), target);
    if (!existsSync(absTarget)) {
      console.warn(`  WARN: ${sym} -> ${target} (target missing, skipping)`);
      continue;
    }
    const isDir = statSync(absTarget).isDirectory();
    rmSync(sym, { force: true });
    cpSync(absTarget, sym, { recursive: isDir, dereference: true });
    resolved += 1;
  }
  if (resolved > 0) {
    console.log(`  Dereferenced ${resolved} symlink(s) under ${root}.`);
  }
}
dereferenceSymlinks(standaloneDir);

// Strip mac-only binaries that next bundles on a Darwin build host. The
// Databricks Apps runtime is Linux, so they're dead weight (and bloat the
// tarball).
const darwinBinaries = [
  "@img/sharp-libvips-darwin-arm64",
  "@img/sharp-libvips-darwin-x64",
  "@img/sharp-darwin-arm64",
  "@img/sharp-darwin-x64",
  "@next/swc-darwin-arm64",
  "@next/swc-darwin-x64",
  "@rolldown/binding-darwin-arm64",
  "@rolldown/binding-darwin-x64",
  "lightningcss-darwin-arm64",
  "lightningcss-darwin-x64",
  "@tailwindcss/oxide-darwin-arm64",
  "@tailwindcss/oxide-darwin-x64",
  "@unrs/resolver-binding-darwin-arm64",
  "@unrs/resolver-binding-darwin-x64",
  "fsevents",
];
for (const pkg of darwinBinaries) {
  rmSync(join(nodeModulesDir, pkg), { force: true, recursive: true });
}

if (existsSync(nodeModulesDir)) {
  rmSync(nodeModulesArchive, { force: true });
  run(
    "tar",
    [
      "--no-xattrs",
      "--no-mac-metadata",
      "-czf",
      nodeModulesArchive,
      "-C",
      standaloneDir,
      "node_modules",
    ],
    { env: { COPYFILE_DISABLE: "1" } },
  );
  rmSync(nodeModulesDir, { force: true, recursive: true });
} else if (!existsSync(nodeModulesArchive)) {
  throw new Error("Missing standalone node_modules and node_modules.tgz.");
}

// Databricks Apps will run `npm install` if it sees a package.json. With the
// platform proxy blocking the registry, that would always fail. The
// committed `node_modules.tgz` already has everything the runtime needs.
rmSync(standalonePackageJson, { force: true });

const rootAppYaml = readFileSync(join(repoRoot, "app.yaml"), "utf8");
const envStart = rootAppYaml.search(/^env:/m);

if (envStart === -1) {
  throw new Error("app.yaml must contain a top-level env: block.");
}

const envAndAfter = rootAppYaml.slice(envStart).trimEnd();
const standaloneAppYaml = `# Generated by scripts/build/prepare-databricks-app.mjs from root app.yaml.
# Edit env / resources in the repo-root app.yaml; this file is regenerated on every deploy.
command:
  - "sh"
  - "-c"
  - "RUNTIME_DIR=\${TMPDIR:-/tmp}/eg-app-runtime; rm -rf $RUNTIME_DIR; mkdir -p $RUNTIME_DIR; cp -R . $RUNTIME_DIR; cd $RUNTIME_DIR; tar --warning=no-unknown-keyword -xzf node_modules.tgz 2>/dev/null || tar -xzf node_modules.tgz; node server.js"

${envAndAfter}
`;

writeFileSync(join(standaloneDir, "app.yaml"), standaloneAppYaml);

const sizeBytes = Number(
  execFileSync("du", ["-sk", standaloneDir]).toString().split(/\s+/)[0],
);
const sizeMb = (sizeBytes / 1024).toFixed(1);
console.log(`Prepared compact Databricks Apps bundle in .next/standalone (${sizeMb} MiB).`);
