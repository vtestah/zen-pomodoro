# Focus Pomodoro (Cinnamon applet)

Single source of truth for the Focus Pomodoro applet. This is the **personal**
build: it includes the on-screen focus cues (glow frame, ritual, breathing, Zen,
panel ring, etc.), localization, **and** the personal site‑blocking integration
that hooks into helper scripts in `~/.local/bin/pomodoro/`.

## Layout
- `6.4/` — applet code for Cinnamon 6.x (`applet.js`, `timer.js`, `sound.js`,
  `settings-schema.json`, `stylesheet.css`).
- `3.6/` — legacy variant.
- `po/` — translation sources (`.po`); `ru.po` is complete. Compiled `.mo` files
  are generated into `~/.local/share/locale/...` and are NOT committed.
- icons / `sounds/` / `bin/` — assets.

## This repo is the one place to work
Develop here. To back it up, push to your own GitHub remote:
```
git remote add origin git@github.com:vtestah/focus-pomodoro.git
git push -u origin main
```

## Publishing to Cinnamon Spices
The public Spices applet must NOT contain the personal bits (sudo, `/etc/hosts`
edits, external scripts, hard‑coded paths). So the published package is a
**sanitized export** generated from this source on demand (strip site‑blocking /
scripts / personal paths, move state to `GLib.get_user_state_dir()`, ship only
`.po`, restructure to `UUID/files/UUID/`). That export is what goes into a fork of
`linuxmint/cinnamon-spices-applets` as a Pull Request.
