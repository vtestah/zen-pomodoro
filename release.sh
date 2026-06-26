#!/usr/bin/env bash
# Smart release for the Zen Pomodoro SOURCE repo.
#
# Uses Conventional Commits + git-cliff to compute the next version and
# regenerate CHANGELOG.md, bumps metadata.json (the single source of truth),
# then creates a local "chore(release): vX.Y.Z" commit and a vX.Y.Z tag.
#
# It does NOT push and does NOT build the public package — those are
# deliberate follow-up steps (see RELEASING.md).
#
# Usage:
#   ./release.sh            # git-cliff computes the next version from commits
#   ./release.sh 1.4.0      # force an explicit version
set -euo pipefail

cd "$(dirname "$0")"

# --- preflight ---------------------------------------------------------------
# Resolve git-cliff: prefer one on PATH, then the npm devDependency
# (node_modules/.bin after `npm install`), then npx as a last resort.
if command -v git-cliff >/dev/null 2>&1; then
    GIT_CLIFF="git-cliff"
elif [ -x "node_modules/.bin/git-cliff" ]; then
    GIT_CLIFF="node_modules/.bin/git-cliff"
elif command -v npx >/dev/null 2>&1; then
    GIT_CLIFF="npx --no-install git-cliff"
else
    echo "ERROR: git-cliff not found. Install it with:  npm install"
    echo "  (it is a devDependency) — or see https://git-cliff.org/docs/installation"
    exit 1
fi
command -v jq >/dev/null 2>&1 || { echo "ERROR: jq not found."; exit 1; }
[ -f metadata.json ] || { echo "ERROR: run from the repo root (metadata.json missing)."; exit 1; }

if [ -n "$(git status --porcelain)" ]; then
    echo "ERROR: working tree is dirty. Commit or stash first so the release"
    echo "       commit contains only the version bump + changelog."
    exit 1
fi

CURRENT="$(jq -r '.version' metadata.json)"

# Next version: explicit arg wins, otherwise let git-cliff compute it.
if [ "${1:-}" != "" ]; then
    NEXT="v${1#v}"
else
    NEXT="$($GIT_CLIFF --bumped-version)"
fi
VER="${NEXT#v}"

if [ "$VER" = "$CURRENT" ]; then
    echo "Nothing to release: next version ($VER) equals current ($CURRENT)."
    echo "Add conventional commits (feat:/fix:/...) since the last tag, or pass a version."
    exit 0
fi

echo "Release: $CURRENT -> $VER   (tag $NEXT)"
echo "------------------ changelog preview ------------------"
$GIT_CLIFF --unreleased --tag "$NEXT" || true
echo "-------------------------------------------------------"
read -r -p "Proceed with commit + tag $NEXT? [y/N] " ans
case "$ans" in
    y|Y) ;;
    *) echo "Aborted."; exit 1 ;;
esac

# Bump the single source of truth: version + last-edited date (the latter is
# what the "About" dialog shows next to the version). The public package drops
# last-edited in build-public.sh, since validate-spice forbids it there.
tmp="$(mktemp)"
jq --arg v "$VER" --argjson t "$(date +%s)" \
   '.version = $v | ."last-edited" = $t' metadata.json > "$tmp" && mv "$tmp" metadata.json

# Regenerate the changelog through the new tag.
$GIT_CLIFF --tag "$NEXT" -o CHANGELOG.md

git add metadata.json CHANGELOG.md
git commit -m "chore(release): $NEXT"
git tag -a "$NEXT" -m "$NEXT"
echo
echo "Created local commit + tag $NEXT (not pushed)."

# One-command convenience: optionally build the sanitized Spices package now.
if [ -x ./build-public.sh ]; then
    printf 'Build the public Spices package now (./build-public.sh)? [y/N] '
    read -r build_now
    case "$build_now" in
        y|Y) ./build-public.sh ;;
        *)   echo "Skipped — run ./build-public.sh when ready." ;;
    esac
fi

cat <<EOF

Release $NEXT is staged locally. Remaining (deliberate) manual steps:
  • git push --follow-tags
  • open the Cinnamon Spices PR titled:  Zen Pomodoro $NEXT: <one-line summary>
EOF
