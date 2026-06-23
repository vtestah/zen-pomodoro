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
command -v git-cliff >/dev/null 2>&1 || {
    echo "ERROR: git-cliff not found."
    echo "Install it: https://git-cliff.org/docs/installation"
    echo "  e.g.  cargo install git-cliff   (or your distro's package)"
    exit 1
}
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
    NEXT="$(git-cliff --bumped-version)"
fi
VER="${NEXT#v}"

if [ "$VER" = "$CURRENT" ]; then
    echo "Nothing to release: next version ($VER) equals current ($CURRENT)."
    echo "Add conventional commits (feat:/fix:/...) since the last tag, or pass a version."
    exit 0
fi

echo "Release: $CURRENT -> $VER   (tag $NEXT)"
echo "------------------ changelog preview ------------------"
git-cliff --unreleased --tag "$NEXT" || true
echo "-------------------------------------------------------"
read -r -p "Proceed with commit + tag $NEXT? [y/N] " ans
case "$ans" in
    y|Y) ;;
    *) echo "Aborted."; exit 1 ;;
esac

# Bump the single source of truth.
tmp="$(mktemp)"
jq --arg v "$VER" '.version = $v' metadata.json > "$tmp" && mv "$tmp" metadata.json

# Regenerate the changelog through the new tag.
git-cliff --tag "$NEXT" -o CHANGELOG.md

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
