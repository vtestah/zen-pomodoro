<p align="center">
  <img src="icon.png" alt="Zen Pomodoro" width="96" height="96">
</p>

# Zen Pomodoro — Cinnamon applet

[![tests](https://github.com/vtestah/zen-pomodoro/actions/workflows/tests.yml/badge.svg)](https://github.com/vtestah/zen-pomodoro/actions/workflows/tests.yml) [![release](https://img.shields.io/github/v/tag/vtestah/zen-pomodoro?label=release)](https://github.com/vtestah/zen-pomodoro/releases) [![License: GPLv3](https://img.shields.io/badge/license-GPLv3-blue.svg)](LICENSE)

A calm, Zen‑style Pomodoro focus timer for the Cinnamon panel: gentle on‑screen
cues instead of anxious alarms — a soft glow frame that traces your progress, a
quiet start ritual, a calm ending, an optional full‑screen Zen mode and a
breathing guide on breaks.

This repository is the **single source of truth**, and the code in `6.4/` is the
public applet exactly as published — there is no personal/public split. Optional
**site blocking** (edits a clearly‑marked section of `/etc/hosts` via a
polkit/pkexec prompt) and **Pushover** push notifications (you supply your own
keys) are regular, off‑by‑default features. `build-public.sh` simply packages
this source for Cinnamon Spices — see
[Publishing to Cinnamon Spices](#publishing-to-cinnamon-spices).

Originally based on **Pomodoro Timer** by *gfreeau* (GPLv3); since substantially rewritten.

## Install

**From Cinnamon (once published on Spices):** right‑click the panel → *Applets*
→ *Download* tab → search **“Zen Pomodoro”** → install, then enable it on the
*Manage* tab.

**Manual install (works today):**
```bash
git clone https://github.com/vtestah/zen-pomodoro.git \
  ~/.local/share/cinnamon/applets/zen-pomodoro@vtestah
```
The folder **must** be named `zen-pomodoro@vtestah` (the applet UUID); Cinnamon
loads the matching version from `6.4/`. Then right‑click the panel → *Applets* →
*Manage* and enable **Zen Pomodoro**. To update later, `git pull` in that folder
and reload the applet (or restart Cinnamon with `Ctrl+Alt+Esc`). Requires
Cinnamon 6.x; the applet keeps its data under `~/.local/state/zen-pomodoro/`.

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
  **soft landing** (when focus ends while you're still working, hold the break
  until a natural pause — or quietly extend — instead of interrupting you; off
  by default), idle auto‑pause, *Focus until…*, optional **strict focus** mode.
- **Sounds** — ticking, alerts, interval chime, ambient brown noise;
  Do‑Not‑Disturb while focusing.
- **Optional distraction blocking** — block sites you choose during focus by
  editing `/etc/hosts` with your permission (polkit/pkexec); off by default.
- **Optional push notifications** — phase changes on your phone via Pushover,
  using your own user key and app token.
- **Quick control** — panel mouse wheel (start/pause or adjust focus length),
  middle‑click to skip, start‑on‑click, keyboard shortcuts.
- **Appearance** — theme presets + custom accent colours, frame style, glow
  intensity, font scale, breathing pattern, reduce‑motion — with live preview.
- **Localized** into 20 languages.

## Layout
- `6.4/` — applet code for Cinnamon 6.x: `applet.js`, `menu.js`, `features.js`,
  `visual.js`, `timer.js`, `sound.js`, `soundfx.js`, `dialogs.js`,
  `constants.js`, `settings-schema.json`, `stylesheet.css`, plus the root‑run
  blocking helpers `hosts-helper.py` and `setup-passwordless.py`.
- `po/` — translation sources (`.po`, `.pot`). Compiled `.mo` files go to
  `~/.local/share/locale/…` and are **not** committed.
- `metadata.json` — the single source of truth for the version.
- `build-public.sh` — packages this source into the Spices layout under `dist/`.
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
git remote add origin git@github.com:vtestah/zen-pomodoro.git
git push -u origin main
```

## Releasing
`metadata.json` is the only place the version lives. `./release.sh` computes the
next version from your commits (via [git‑cliff]), bumps `metadata.json`,
regenerates `CHANGELOG.md`, makes a `chore(release): vX.Y.Z` commit and tag, and
offers to build the public package. Full steps in **[RELEASING.md](RELEASING.md)**.

## Translations
Eight of the 20 catalogs are fully translated (`ru`, `de`, `es`, `fr`, `it`, `nl`, `pt`, `pt_BR`); the rest are partial and fall back to English for untranslated strings. To pick up new strings:
regenerate the `.pot` (`cinnamon-xlet-makepot` run from `6.4/`), `msgmerge` the
`.po` files, fill the gaps, and `msgfmt --check`. `ru` is hand‑maintained; the
remaining catalogs are machine translations — native review welcome.

## Publishing to Cinnamon Spices
`./build-public.sh` packages this source into `dist/zen-pomodoro@vtestah/`: it
lays the package out as `UUID/files/UUID/`, writes a clean `metadata.json` (no
`last-edited` / `icon` / `dangerous`), ships only `.po` (no compiled `.mo`), and
includes the blocking helpers. A validator fails the build if a personal path,
`sudo`, a leftover `@PUBLIC_STRIP` marker, or the removed custom‑scripts feature
ever reappears.

That export goes into a fork of `linuxmint/cinnamon-spices-applets` as a PR
titled `Zen Pomodoro vX.Y.Z: <summary>` (their convention; PRs are squash‑merged).

## Credits & License
Originally based on **Pomodoro Timer** by *gfreeau* — since substantially rewritten. Licensed under the **GPLv3** (see [LICENSE](LICENSE)).

[Conventional Commits]: https://www.conventionalcommits.org
[git‑cliff]: https://git-cliff.org
