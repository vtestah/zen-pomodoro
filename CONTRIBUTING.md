# Contributing

Thanks for helping improve **Zen Pomodoro**! This repo is the single source of
truth — the code in `6.4/` is the live applet.

## Development setup

1. Place (or symlink) the repo at
   `~/.local/share/cinnamon/applets/zen-pomodoro@vtestah/`.
2. Edit files in `6.4/` and reload the applet to test:
   ```bash
   dbus-send --session --dest=org.Cinnamon /org/Cinnamon \
     org.Cinnamon.ReloadXlet string:'zen-pomodoro@vtestah' string:'APPLET'
   ```
   (or reload from Looking Glass). New translation strings only take effect after
   a full Cinnamon restart, since `.mo` files are cached per process.

## Commit style — Conventional Commits

Every commit must use a Conventional Commits prefix (`feat:`, `fix:`, `docs:`,
`chore:`, `ci:`, `refactor:`, `perf:`, `test:`, `build:`). This drives the
changelog and the version bump. A dependency-free hook enforces it — enable it
once per clone:
```bash
git config core.hooksPath .githooks
```

## Tests

- Python helpers (`hosts-helper.py`, `setup-passwordless.py`): `pytest`
- JS pure-logic: `node tests/js/*.test.js`

Please add or extend tests when you change behavior.

## Translations

User-facing strings go through `_()` (gettext, domain `zen-pomodoro@vtestah`).
After adding strings: regenerate the `.pot` (`cinnamon-xlet-makepot` run from
`6.4/`), `msgmerge` the `.po` files, fill in English, then `msgfmt --check`.
Do **not** commit compiled `.mo` files.

## Before opening a PR

- `pytest` and `node tests/js/*.test.js` pass.
- `./build-public.sh` succeeds (its validator must stay green).
- If you changed user-facing strings, the catalogs are updated.

The full release process lives in **[RELEASING.md](RELEASING.md)**.
