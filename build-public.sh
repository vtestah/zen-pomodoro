#!/usr/bin/env bash
# Package the Cinnamon-Spices-ready package from this repo.
#
# Since unification, the source in 6.4/ IS the public applet — there is no
# personal/public split and no @PUBLIC_STRIP processing. This script only:
#   - lays the package out as dist/<UUID>/files/<UUID>/,
#   - generates a clean metadata.json / info.json / README.md, and
#   - validates that no private remnant (personal paths, sudo, leftover markers,
#     or the removed custom-scripts feature) leaks into the package.
set -euo pipefail

UUID="zen-pomodoro@vtestah"
NAME="Zen Pomodoro"

REPO="$(cd "$(dirname "$0")" && pwd)"
SRC="$REPO/6.4"
# Single source of truth for the version is the live metadata.json (release.sh
# bumps it there). The public package must NOT carry last-edited/icon/dangerous,
# so below we read only the version and regenerate a clean metadata.json.
VERSION="$(jq -r '.version // empty' "$REPO/metadata.json")"
[ -n "$VERSION" ] || { echo "ERROR: could not read .version from $REPO/metadata.json (is jq installed?)"; exit 1; }
OUT="$REPO/dist/$UUID"
FILES="$OUT/files/$UUID"

echo "==> clean output"
rm -rf "$OUT"
mkdir -p "$FILES/po"

echo "==> copy code + assets + root helpers (no .mo)"
cp "$SRC/applet.js" "$SRC/timer.js" "$SRC/sound.js" "$SRC/menu.js" "$SRC/dialogs.js" "$SRC/constants.js" "$SRC/visual.js" "$SRC/features.js" "$SRC/soundfx.js" "$SRC/hosts-helper.py" "$SRC/setup-passwordless.py" "$SRC/stylesheet.css" "$SRC/settings-schema.json" "$FILES/"
chmod +x "$FILES/hosts-helper.py" "$FILES/setup-passwordless.py"
cp "$REPO"/*.png "$REPO"/*.svg "$FILES/" 2>/dev/null || true
rm -f "$FILES/screenshot.png"  # screenshot belongs at the package root only
[ -d "$REPO/sounds" ] && cp -r "$REPO/sounds" "$FILES/"
cp "$REPO/po/"*.po "$FILES/po/"
cp "$REPO/po/"*.pot "$FILES/po/" 2>/dev/null || true

echo "==> generate metadata.json / info.json / README.md"
cat > "$FILES/metadata.json" <<EOF
{
    "uuid": "$UUID",
    "name": "$NAME",
    "description": "A calm, Zen-style Pomodoro timer for focused work. Gentle on-screen cues instead of anxious alarms: a soft glow frame that traces your progress, a quiet start ritual, a calm ending with no last-minute blinking, an optional full-screen Zen mode, a breathing guide on breaks, ambient sound, daily goal and streak, a panel progress ring, a statistics dashboard, customizable theme colors with live preview, and full localization. Optional distraction blocking can block websites you choose during focus by editing /etc/hosts, only after you enable it and grant a one-time administrator authorization. Originally based on Pomodoro Timer by gfreeau, since substantially rewritten.",
    "version": "$VERSION",
    "max-instances": "1"
}
EOF
cat > "$OUT/info.json" <<EOF
{
    "author": "vtestah",
    "original_author": "gfreeau"
}
EOF
cat > "$OUT/README.md" <<'EOF'
# Zen Pomodoro

A calm, Zen‑style Pomodoro timer for the Cinnamon panel — gentle on‑screen cues
instead of anxious alarms. Originally based on **Pomodoro Timer** by *gfreeau*, since substantially rewritten.

![screenshot](screenshot.png)

## Highlights
- **Calm focus cues:** a soft edge‑glow frame traces your progress (the bottom
  edge stays clear for the panel), a quiet start ritual, and a calm ending with
  no last‑minute blinking. Optional full‑screen Zen mode and a breathing guide
  on breaks.
- **Smart start:** a short onboarding wizard tailors your rhythm, sounds and
  breaks — or just press Start.
- **Tasks & focus:** a task list with pomodoro estimates and progress,
  templates, and a current‑task picker.
- **Statistics dashboard:** today / week / streak / all‑time, when you focus by
  hour, a 14‑day chart and a 12‑week heatmap, a by‑task breakdown and milestones.
- **Meaningful breaks:** gentle rest reminders, with “+5 min” and “Skip break”
  actions right in the notification.
- **Goals & flow:** daily goal and streak, flow‑extend, idle auto‑pause,
  “Focus until…”, and an optional strict‑focus mode.
- **Sounds:** ticking, alerts, an interval chime and soft brown‑noise ambience;
  Do‑Not‑Disturb while focusing.
- **Optional distraction blocking:** block sites you choose while you focus.
- **Optional push notifications:** get phase changes on your phone via Pushover
  (you provide your own user key and app token).
- **Quick control:** scroll on the applet to start/pause or change the focus
  length, middle‑click to skip, plus keyboard shortcuts.
- **Your look:** theme presets and custom accent colours, frame style, glow
  intensity, breathing pattern and menu font scale — with a live preview.
- **Localized** into 20 languages.

## Distraction blocking & your system
The timer, menu and focus overlays never touch anything outside the applet, and
your stats and tasks live under `$XDG_STATE_HOME/zen-pomodoro/`.

**Distraction blocking is the one feature that changes a system file, and it is
fully optional and off by default.** When you enable it and pick domains, the
applet blocks them during focus by editing a clearly‑marked section of
`/etc/hosts` (it never touches the rest of the file and validates every
hostname). Because that file is root‑owned, the change runs through a small
bundled helper invoked with **pkexec** (the standard graphical admin prompt).
A one‑time “Set up passwordless blocking” installs a tightly‑scoped polkit
policy so later focus sessions don’t prompt every time; you can remove it again
at any time. Push notifications (Pushover) are also optional and require your
own credentials.

## Credits & License
Originally based on **Pomodoro Timer** by *gfreeau* — since substantially rewritten. Licensed under the **GPLv3**.
EOF

echo "==> copy screenshot.png (mandatory for Spices)"
cp "$REPO/screenshot.png" "$OUT/screenshot.png" 2>/dev/null || true

echo "==> copy LICENSE (GPLv3)"
cp "$REPO/LICENSE" "$OUT/LICENSE" 2>/dev/null || true

echo "==> VALIDATE"
fail=0
cjs -c "const G=imports.gi.GLib;let[o,c]=G.file_get_contents('$FILES/applet.js');try{Reflect.parse(imports.byteArray.toString(c));print('   applet.js: parse OK');}catch(e){print('   applet.js: PARSE FAIL '+e.message);}" | tee /tmp/zen_parse.txt
grep -q "PARSE FAIL" /tmp/zen_parse.txt && fail=1
for j in "$FILES/metadata.json" "$FILES/settings-schema.json" "$OUT/info.json"; do
  python3 -m json.tool "$j" >/dev/null && echo "   JSON OK: ${j##*/}" || { echo "   JSON FAIL: $j"; fail=1; }
done
echo "   metadata forbidden-field scan:"
__mbad=$(python3 -c "import json;d=json.load(open('$FILES/metadata.json'));print(','.join(k for k in ('last-edited','icon','dangerous') if k in d))")
if [ -n "$__mbad" ]; then echo "   !! metadata.json has Spices-forbidden fields: $__mbad"; fail=1; else echo "   metadata.json: no forbidden fields (last-edited/icon/dangerous)"; fi
echo "   forbidden-pattern scan (personal paths, sudo, removed scripts feature, leftover markers):"
if grep -rInE "/home/vladimir|[^a-zA-Z]sudo[^a-zA-Z]|focus-start|focus-stop|domains\.txt|bin/pomodoro|_runFocusPreflight|_runFocusStartScript|_runFocusStopScript|_runPomodoroScript|_checkAndExecuteCustomScript|enable_scripts|_opt_enableScripts|_opt_customShortBreakScript|_opt_customLongBreakScript|PUBLIC_STRIP|\.config[^\"]*pomodoro" "$OUT" 2>/dev/null | grep -v Binary; then
  echo "   !! FORBIDDEN REMNANTS FOUND"; fail=1
else
  echo "   clean"
fi
if [ -f "$OUT/screenshot.png" ]; then echo "   screenshot.png: present"; else echo "   !! screenshot.png MISSING (required by Spices)"; fail=1; fi
if ls "$FILES/po/"*.mo >/dev/null 2>&1; then echo "   !! po has compiled .mo"; fail=1; else echo "   po: no .mo"; fi
__potn=$(ls "$FILES/po/"*.pot 2>/dev/null | wc -l)
if [ "$__potn" -eq 1 ]; then echo "   po: exactly one .pot"; else echo "   !! po needs exactly one .pot (found $__potn)"; fail=1; fi
rm -f /tmp/zen_parse.txt
if [ "$fail" -ne 0 ]; then echo "==> BUILD FAILED (see above)"; exit 1; fi
echo "==> BUILD OK -> $OUT"
