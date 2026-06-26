# Releasing

This repo is the **source of truth**. There are two distinct audiences, with
two distinct conventions — don't mix them up:

1. **This repo's own history & changelog** — driven by *Conventional Commits* +
   `git-cliff`. Internal; Cinnamon Spices never sees it.
2. **The public Cinnamon Spices submission** — follows the Spices repo's own
   title rules (below).

---

## 1. Commit style (this repo) — Conventional Commits

Prefix every commit:

| Prefix | Meaning | Version effect |
|--------|---------|----------------|
| `feat:` | a new feature | minor (x.**Y**.0) |
| `fix:` | a bug fix | patch (x.y.**Z**) |
| `feat!:` / `BREAKING CHANGE:` | breaking change | major (**X**.0.0) |
| `docs:` `chore:` `ci:` | docs / chores / CI | no bump |
| `refactor:` `perf:` `style:` `test:` `build:` | other | patch |

The mapping lives in `cliff.toml` (`[bump]`). Old `Zen Pomodoro: …` commits are
kept in the changelog (grouped under *Other*).

**Enforced automatically.** A dependency-free hook at `.githooks/commit-msg`
rejects non-conventional messages (no Node/commitlint needed). It allows merge,
revert and `fixup!`/`squash!` commits. Enable it once per clone:

```bash
git config core.hooksPath .githooks
```

It runs for every commit, including from GUIs (VS Code, etc.). To bypass once
(not recommended): `git commit --no-verify`.

## 2. Cut a release (local)

One-time prerequisite — install git-cliff. It ships as an npm devDependency:

```bash
npm install          # installs git-cliff (and the other dev tools)
```

(or install it globally — see <https://git-cliff.org/docs/installation>). The
`./release.sh` flow finds it automatically (PATH → `node_modules/.bin` → npx).

With a **clean working tree**:

```bash
./release.sh          # git-cliff computes the next version from your commits
./release.sh 1.4.0    # …or force an explicit version
```

This bumps `metadata.json` `"version"`, regenerates `CHANGELOG.md`, makes a
local `chore(release): vX.Y.Z` commit + `vX.Y.Z` tag, and then **offers to build
the public package in the same run** (`./build-public.sh`) — so a release is one
command. It **does not push** (deliberate). Afterwards:

```bash
git push --follow-tags
```

## 3. Build the public package

```bash
./build-public.sh     # sanitized package -> dist/zen-pomodoro@vtestah/
```

The version is read straight from `metadata.json` (single source of truth). The
build's validator fails if the package leaks private bits **or** if the exported
`metadata.json` carries the Spices-forbidden fields `last-edited` / `icon` /
`dangerous`.

## 4. Submit to Cinnamon Spices

Repo: <https://github.com/linuxmint/cinnamon-spices-applets> (PRs are
**squash-merged** — the `(#1234)` suffix is added automatically).

Per their `.github/CONTRIBUTING.md`, the commit/PR **title** must be
`spice name: simple description`. For a versioned release, match how the
maintainers do it (version in the title):

```
Zen Pomodoro vX.Y.Z: <one-line summary of what changed>
```

Checklist:
- Package layout is `UUID/files/UUID/…` (`build-public.sh` already does this).
- `metadata.json` **has** `version`, and **must not** have `last-edited`,
  `icon`, or `dangerous` (`validate-spice` rejects them).
- Exactly one `.pot`, no compiled `.mo` in `po/`.
- A root `screenshot.png` is present.
- Close related issues from the PR body with `Fixes #NNNN`.

---

### One-time bootstrap

Enable the commit-message check (git hooks aren't shared automatically):

```bash
git config core.hooksPath .githooks
```

The `v1.0.0` tag marks the current released state as the baseline so `git-cliff`
knows what's "unreleased". If it isn't present yet:

```bash
git tag -a v1.0.0 -m v1.0.0   # on the 1.0.0 commit
```

After that, commit new work with Conventional Commits and use `./release.sh`.
