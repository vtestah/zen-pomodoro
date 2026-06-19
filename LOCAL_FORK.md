# Focus Pomodoro Local Fork

This is a personal local fork of the Cinnamon Spices applet
`pomodoro@gregfreeman.org`.

Canonical local UUID:

```text
focus-pomodoro@vladimir.local
```

The original applet directory may still exist as a fallback:

```text
~/.local/share/cinnamon/applets/pomodoro@gregfreeman.org
```

Do not make new production changes there. The maintained local applet is:

```text
~/.local/share/cinnamon/applets/focus-pomodoro@vladimir.local
```

The local fork keeps upstream attribution in `metadata.json`. The goal of the
new UUID is to avoid Cinnamon Spices updates overwriting local productivity
customizations.

Main local integration points:

- `6.4/applet.js`: Cinnamon applet UI, timer flow, presets, panel cue, frame cue.
- `~/.config/cinnamon/spices/focus-pomodoro@vladimir.local/focus-pomodoro@vladimir.local.json`: Cinnamon settings.
- `~/.local/bin/pomodoro`: external scripts for site blocking, DND, Pushover, break flow, diagnostics.
- `~/.local/bin/pomodoro/AI_CONTEXT.md`: detailed maintenance notes for future AI agents.

After changes, run:

```bash
/home/vladimir/.local/bin/pomodoro/pomodoroctl doctor
```
