#!/usr/bin/env bash
set -euo pipefail

# Build a compact `.next/standalone/` source path for Databricks Apps deploy.
#
# The committed bundle contains:
#   - server.js, .next/, public/        (Next standalone output)
#   - node_modules.tgz                  (deps tarball — Apps proxy blocks npm)
#   - app.yaml                          (generated; runtime that untars deps)
#
# The Apps runtime copies the bundle into $TMPDIR, untars node_modules, and
# runs `node server.js` (see scripts/build/prepare-databricks-app.mjs).
#
# Usage:
#   npm run deploy                # commit + push current branch
#   npm run deploy -- main        # push to `main` specifically
#   npm run deploy -- --no-push   # commit locally, skip push

BRANCH=""
PUSH=1
while [[ $# -gt 0 ]]; do
  case "$1" in
    --no-push) PUSH=0 ;;
    -h|--help)
      /usr/bin/sed -n '3,19p' "$0"
      exit 0
      ;;
    *)
      if [[ -z "$BRANCH" ]]; then
        BRANCH="$1"
      else
        echo "Unknown arg: $1" >&2
        exit 1
      fi
      ;;
  esac
  shift
done

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ -z "$BRANCH" ]]; then
  BRANCH="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo main)"
fi

echo "=== EG Fuel Pricing Deploy ==="
echo "Branch: $BRANCH"
echo ""

echo "[1/4] Building Next.js standalone bundle..."
npx next build
echo ""

echo "[2/4] Preparing compact Apps source path..."
node scripts/build/prepare-databricks-app.mjs
SIZE=$(du -sh .next/standalone | cut -f1)
echo "       Standalone size: $SIZE"
echo ""

echo "[3/4] Staging & committing standalone..."
git add -A .next/standalone/
CHANGED=$(git diff --cached --name-only | wc -l | tr -d ' ')
echo "       $CHANGED files staged"
if [[ "$CHANGED" -eq 0 ]]; then
  echo "       Nothing to commit - bundle is identical to HEAD"
else
  # --no-verify: minified JS / tarball trip gitleaks false positives.
  git commit --no-verify -m "deploy: standalone build $(date +%Y-%m-%d\ %H:%M)"
fi
echo ""

if [[ $PUSH -eq 1 ]]; then
  echo "[4/4] Pushing to origin/$BRANCH..."
  git push --no-verify origin "HEAD:$BRANCH"
else
  echo "[4/4] Skipping push (--no-push)"
  echo "       Push manually with: git push origin HEAD:$BRANCH"
fi
echo ""

echo "=== Done ==="
echo "Deploy from the Databricks Apps UI (it pulls origin/$BRANCH)."
