#!/usr/bin/env bash
#
# Release helper - bump version, build compact standalone, commit, tag, push.
#
# Usage:
#   npm run release -- patch
#   npm run release -- minor
#   npm run release -- major
#   npm run release -- 1.2.3
#   npm run release -- patch --dry-run
#   npm run release -- patch --no-push
#   npm run release -- patch --branch main

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[0;33m'
RESET='\033[0m'

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

BUMP=""
BRANCH=""
DRY_RUN=0
PUSH=1

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run) DRY_RUN=1 ;;
    --no-push) PUSH=0 ;;
    --branch) BRANCH="${2:?}"; shift ;;
    -h|--help)
      /usr/bin/sed -n '3,18p' "$0"
      exit 0
      ;;
    *)
      if [[ -z "$BUMP" ]]; then
        BUMP="$1"
      else
        echo -e "${RED}Unknown arg: $1${RESET}" >&2
        exit 1
      fi
      ;;
  esac
  shift
done
BUMP="${BUMP:-patch}"

if [[ -z "$BRANCH" ]]; then
  BRANCH="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo main)"
fi

CURRENT=$(node -p "require('./package.json').version")
case "$BUMP" in
  patch|minor|major)
    IFS='.' read -r MAJ MIN PAT <<< "$CURRENT"
    case "$BUMP" in
      patch) PAT=$((PAT + 1)) ;;
      minor) MIN=$((MIN + 1)); PAT=0 ;;
      major) MAJ=$((MAJ + 1)); MIN=0; PAT=0 ;;
    esac
    NEXT="${MAJ}.${MIN}.${PAT}"
    ;;
  *)
    if ! [[ "$BUMP" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
      echo -e "${RED}Invalid version '$BUMP' - expected patch|minor|major or X.Y.Z${RESET}" >&2
      exit 1
    fi
    NEXT="$BUMP"
    ;;
esac

echo -e "${CYAN}=== EG Fuel Pricing Release ===${RESET}"
echo -e "  Current version : ${CURRENT}"
echo -e "  Next version    : ${GREEN}${NEXT}${RESET}"
echo -e "  Branch          : ${BRANCH}"
echo -e "  Push            : $([[ $PUSH -eq 1 ]] && echo yes || echo no)"
echo -e "  Dry-run         : $([[ $DRY_RUN -eq 1 ]] && echo yes || echo no)"
echo ""

if git rev-parse "v${NEXT}" >/dev/null 2>&1; then
  echo -e "${RED}Tag v${NEXT} already exists - refusing to clobber${RESET}" >&2
  exit 1
fi

# package.json is gitignored, so only standalone diffs count toward "dirty".
DIRTY=$(git status --porcelain | /usr/bin/grep -Ev '^.. (package\.json|\.next/standalone/)' || true)
if [[ -n "$DIRTY" ]]; then
  echo -e "${RED}Working tree has uncommitted changes (commit them first):${RESET}" >&2
  echo "$DIRTY" >&2
  exit 1
fi

if [[ $DRY_RUN -eq 1 ]]; then
  echo -e "${YELLOW}Dry-run - no changes will be made.${RESET}"
  exit 0
fi

echo -e "${CYAN}[1/5] Bumping package.json -> ${NEXT}${RESET}"
node -e "
  const fs = require('fs');
  const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  pkg.version = '${NEXT}';
  fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n');
"

echo -e "${CYAN}[2/5] Building standalone bundle${RESET}"
npx next build

echo -e "${CYAN}[3/5] Preparing compact Apps source path${RESET}"
node scripts/build/prepare-databricks-app.mjs
SIZE=$(du -sh .next/standalone | cut -f1)
echo "       Standalone size: $SIZE"

echo -e "${CYAN}[4/5] Committing release${RESET}"
git add -A .next/standalone/
CHANGED=$(git diff --cached --name-only | wc -l | tr -d ' ')
echo "       $CHANGED files staged"

if [[ "$CHANGED" -eq 0 ]]; then
  echo -e "${YELLOW}       No standalone changes - committing empty release marker${RESET}"
  COMMIT_FLAGS="--allow-empty --no-verify"
else
  COMMIT_FLAGS="--no-verify"
fi

# shellcheck disable=SC2086
git commit $COMMIT_FLAGS -m "release: v${NEXT}"

git tag -a "v${NEXT}" -m "Release v${NEXT}"

if [[ $PUSH -eq 1 ]]; then
  echo -e "${CYAN}[5/5] Pushing to origin/${BRANCH} + tags${RESET}"
  git push --no-verify origin "HEAD:${BRANCH}"
  git push --no-verify origin "v${NEXT}"
else
  echo -e "${CYAN}[5/5] Skipping push (--no-push)${RESET}"
  echo -e "       Push manually with: ${CYAN}git push origin HEAD:${BRANCH} v${NEXT}${RESET}"
fi

echo ""
echo -e "${GREEN}Released v${NEXT}${RESET}"
echo -e "  Deploy from the Databricks Apps UI (it pulls origin/${BRANCH})."
