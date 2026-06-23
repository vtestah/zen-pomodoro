# Zen Pomodoro — Cinnamon applet

A calm, Zen‑style Pomodoro focus timer for the Cinnamon panel: gentle on‑screen
cues instead of anxious alarms — a soft glow frame that traces your progress, a
quiet start ritual, a calm ending, an optional full‑screen Zen mode and a
breathing guide on breaks.

This repository is the **single source of truth** and the **personal build**. It
contains everything in the public applet **plus** personal extras that never ship
to Cinnamon Spices: site blocking (`/etc/hosts` via an admin prompt), Pushover
push notifications, and optional custom scripts under `~/.local/bin/pomodoro/`.
The public package is a **sanitized export** built on demand — see
[Publishing to Cinnamon Spices](#publishing-to-cinnamon-spices).

Based on **Pomodoro Timer** by *gfreeau* (GPL).

## Features
- **Calm focus cues** — soft edge‑glow progress frame (bottom kept clear for the
  panel), calm ending (no last‑minute blinking), start ritual, optional Zen
  full‑screen overlay, breathing guide on breaks, panel progress ring.
- **Smart onboarding** — a short wizard tailors a setup from a few questions.
- **Tasks** — list with pomodoro estimates and per‑task progress, templates, a
  focus‑task picker, and quick *Current task* / *Task list* menu access.
- **Statistics dashboard** — today / week / streak / all‑time, hourly pattern,
  14‑day bars, 12‑week heatmap, by‑task breakdown, milestones, finish‑time
  estimate, and a reset action.
- **Meaningful breaks** — rotating rest tips, with *+5 min* and *Skip break*
  actions right in the notification.
- **Goals & flow** — daily goal + streak with a local celebration, flow‑extend,
  idle auto‑pause, *Focus until…*, optional **strict focus** mode.
- **Sounds** — ticking, alerts, interval chime, ambient brown noise;
  Do‑Not‑Disturb while focusing.
- **Quick control** — panel mouse wheel (start/pause or adjust focus length),
  middle‑click to skip, start‑on‑click, keyboard shortcuts.
- **Appearance** — theme presets + custom accent colours, frame style, glow
  intensity, font scale, breathing pattern, reduce‑motion — with live preview.
- **Localized** into 20 languages.

## Layout
- `6.4/` — applet code for Cinnamon 6.x: `applet.js`, `menu.js`, `features.js`,
  `visual.js`, `timer.js`, `sound.js`, `soundfx.js`, `dialogs.js`,
  `constants.js`, `settings-schema.json`, `stylesheet.css`. Personal‑only regions
  are wrapped in `// @PUBLIC_STRIP_BEGIN … @PUBLIC_STRIP_END` markers.
- `po/` — translation sources (`.po`, `.pot`). Compiled `.mo` files go to
  `~/.local/share/locale/…` and are **not** committed.
- `metadata.json` — the single source of truth for the version.
- `build-public.sh` — builds the sanitized Spices package into `dist/`.
- `release.sh`, `cliff.toml`, `CHANGELOG.md`, `RELEASING.md` — release tooling.
- `.githooks/commit-msg` — Conventional Commits check.
- `*.svg`, `*.png`, `sounds/` — assets; `screenshot.png` — Spices store image.

## Development
Edit here — it's the live applet, so reload to test:
```
dbus-send --session --dest=org.Cinnamon /org/Cinnamon \
  org.Cinnamon.ReloadXlet string:'zen-pomodoro@vtestah' string:'APPLET'
```
(or reload from Looking Glass). New translation strings only take effect after a
full Cinnamon restart, since `.mo` files are cached per process.

Commits follow [Conventional Commits], enforced by a dependency‑free hook.
Enable it once per clone:
```
git config core.hooksPath .githooks
```

Back up to your own remote:
```
git remote add origin git@github.com:vtestah/focus-pomodoro.git
git push -u origin main
```

## Releasing
`metadata.json` is the only place the version lives. `./release.sh` computes the
next version from your commits (via [git‑cliff]), bumps `metadata.json`,
regenerates `CHANGELOG.md`, makes a `chore(release): vX.Y.Z` commit and tag, and
offers to build the public package. Full steps in **[RELEASING.md](RELEASING.md)**.

## Translations
All catalogs in `po/` are complete (20 languages). To pick up new strings:
regenerate the `.pot` (`cinnamon-xlet-makepot` run from `6.4/`), `msgmerge` the
`.po` files, fill the gaps, and `msgfmt --check`. `ru` is hand‑maintained; the
others are machine translations — native review welcome.

## Publishing to Cinnamon Spices
The public applet must not contain the personal bits. `./build-public.sh`
produces a sanitized package in `dist/zen-pomodoro@vtestah/`: it strips the
`@PUBLIC_STRIP` regions (site blocking / scripts / personal paths), moves state
to `GLib.get_user_state_dir()`, writes a clean `metadata.json` (no
`last-edited` / `icon` / `dangerous`), ships only `.po`, and lays the package out
as `UUID/files/UUID/`. A validator fails the build if any private remnant leaks.

That export goes into a fork of `linuxmint/cinnamon-spices-applets` as a PR
titled `Zen Pomodoro vX.Y.Z: <summary>` (their convention; PRs are squash‑merged).

## Credits & License
Based on **Pomodoro Timer** by *gfreeau*. Licensed under the **GPL**.

[Conventional Commits]: https://www.conventionalcommits.org
[git‑cliff]: https://git-cliff.org
