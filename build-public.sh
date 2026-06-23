#!/usr/bin/env bash
# Build the sanitized, Cinnamon-Spices-ready PUBLIC package from the LIVE applet.
# Source of truth = this repo. Output = dist/<UUID>/ (gitignored).
# Sanitization is driven by // @PUBLIC_STRIP_BEGIN [..ELSE..] @PUBLIC_STRIP_END
# markers in the source plus the path rewrites below. The build FAILS if any
# private remnant is detected, so the package can never silently leak.
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

echo "==> copy code + assets (no .mo)"
cp "$SRC/applet.js" "$SRC/timer.js" "$SRC/sound.js" "$SRC/menu.js" "$SRC/dialogs.js" "$SRC/constants.js" "$SRC/visual.js" "$SRC/features.js" "$SRC/soundfx.js" "$SRC/hosts-helper.py" "$SRC/setup-passwordless.py" "$SRC/stylesheet.css" "$SRC/settings-schema.json" "$FILES/"
chmod +x "$FILES/hosts-helper.py" "$FILES/setup-passwordless.py"
cp "$REPO"/*.png "$REPO"/*.svg "$FILES/" 2>/dev/null || true
rm -f "$FILES/screenshot.png"  # screenshot belongs at the package root only
[ -d "$REPO/sounds" ] && cp -r "$REPO/sounds" "$FILES/"
cp "$REPO/po/"*.po "$FILES/po/"
cp "$REPO/po/"*.pot "$FILES/po/" 2>/dev/null || true

echo "==> process modules (strip markers + rewrite paths)"
for __jsf in "$FILES/applet.js" "$FILES/menu.js" "$FILES/dialogs.js" "$FILES/constants.js" "$FILES/visual.js" "$FILES/features.js" "$FILES/soundfx.js"; do
python3 - "$__jsf" <<'PY'
import sys, re
f=sys.argv[1]
lines=open(f,encoding='utf-8').read().split('\n')
out=[]; i=0; n=len(lines)
while i < n:
    if 'PUBLIC_STRIP_BEGIN' in lines[i]:
        j=i+1; else_idx=None
        while j < n and 'PUBLIC_STRIP_END' not in lines[j]:
            if 'PUBLIC_STRIP_ELSE' in lines[j]: else_idx=j
            j+=1
        if else_idx is not None:
            for k in range(else_idx+1, j):
                out.append(lines[k].replace('// ','',1))  # uncomment public alt
        i=j+1; continue
    out.append(lines[i]); i+=1

# Drop single-line private statements (calls/inits/bindings/fields that may
# appear multiple times and reference stripped methods/options).
DROP=[
  'this._startFocusBlockIfNeeded(',
  'this._stopFocusBlockIfNeeded(',
  'this._focusBlockActive = false;',
  'this._opt_enableScripts = null;',
  'this._opt_customShortBreakScript = null;',
  'this._opt_customLongBreakScript = null;',
  '"enable_scripts", "_opt_enableScripts"',
  '"custom_short_break_script", "_opt_customShortBreakScript"',
  '"custom_long_break_script", "_opt_customLongBreakScript"',
  'focusBlockActive: this._focusBlockActive,',
  'blockedSitesCount: this._getBlockedSitesCount(),',
  'this._reloadPresetTasks();',
  'this._hideTaskRequiredHint();',
  'this._sitesLabel = null;',
]
out=[ln for ln in out if not any(tok in ln for tok in DROP)]
s='\n'.join(out)

# Path rewrites: private state location -> XDG user state dir / zen-pomodoro
s=s.replace('GLib.build_filenamev([GLib.get_home_dir(), ".config", "pomodoro", "applet-state.json"])',
            'GLib.build_filenamev([GLib.get_user_state_dir(), "zen-pomodoro", "session.json"])')
s=s.replace('GLib.build_filenamev([GLib.get_home_dir(), ".config", "pomodoro", "daily-stats.json"])',
            'GLib.build_filenamev([GLib.get_user_state_dir(), "zen-pomodoro", "daily-stats.json"])')
s=s.replace('GLib.build_filenamev([GLib.get_home_dir(), ".config", "pomodoro", "tasks-data.json"])',
            'GLib.build_filenamev([GLib.get_user_state_dir(), "zen-pomodoro", "tasks-data.json"])')
# Ensure the state dir exists before writing either file.
s=re.sub(r'(\n(\s*)GLib\.file_set_contents\((POMODORO_STATE_FILE|POMODORO_STATS_FILE|POMODORO_TASKS_DATA_FILE),)',
         r'\n\2GLib.mkdir_with_parents(GLib.path_get_dirname(\3), 0o700);\1', s)

open(f,'w',encoding='utf-8').write(s)
print("   processed: "+f.split('/')[-1])
PY
done

echo "==> process settings-schema.json (drop Scripts page/keys)"
python3 - "$FILES/settings-schema.json" <<'PY'
import sys, json, collections
f=sys.argv[1]
d=json.load(open(f,encoding='utf-8'),object_pairs_hook=collections.OrderedDict)
drop={"enable_scripts","custom_short_break_script","custom_long_break_script"}
for k in list(d.keys()):
    if k in drop: del d[k]
# Generic, non-personal default preset tasks for the public package.
if "preset_tasks" in d:
    d["preset_tasks"]["default"]=[{"task":t} for t in
        ["Deep work","Writing","Study","Email","Planning"]]
lay=d.get("layout")
if lay:
    lay["pages"]=[p for p in lay.get("pages",[]) if p!="scripts"]
    lay.pop("scripts",None); lay.pop("sec_scripts",None)
    for _pk,_pv in list(lay.items()):
        if isinstance(_pv,dict) and _pv.get("type")=="page":
            _pv["sections"]=[_s for _s in _pv.get("sections",[]) if _s!="sec_scripts"]
json.dump(d,open(f,'w',encoding='utf-8'),ensure_ascii=False,indent=4); open(f,'a').write('\n')
print("   settings-schema.json cleaned")
PY

echo "==> clean obsolete references from po"
for po in "$FILES/po/"*.po "$FILES/po/"*.pot; do
  [ -e "$po" ] || continue
  sed -i '/enable_scripts\|custom_short_break_script\|custom_long_break_script/d' "$po"
done

echo "==> generate metadata.json / info.json / README.md"
cat > "$FILES/metadata.json" <<EOF
{
    "uuid": "$UUID",
    "name": "$NAME",
    "description": "A calm, Zen-style Pomodoro timer for focused work. Gentle on-screen cues instead of anxious alarms: a soft glow frame that traces your progress, a quiet start ritual, a calm ending with no last-minute blinking, an optional full-screen Zen mode, a breathing guide on breaks, ambient sound, daily goal and streak, a panel progress ring, customizable theme colors with live preview, and full localization. Based on Pomodoro Timer by gfreeau.",
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
instead of anxious alarms. Based on **Pomodoro Timer** by *gfreeau*.

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
- **Quick control:** scroll on the applet to start/pause or change the focus
  length, middle‑click to skip, plus keyboard shortcuts.
- **Your look:** theme presets and custom accent colours, frame style, glow
  intensity, breathing pattern and menu font scale — with a live preview.
- **Localized** into 20 languages.

This applet only draws on the panel, its own menu and its own transparent focus
overlays. It does **not** modify the system, block websites, or run external
scripts. Your stats and tasks live under `$XDG_STATE_HOME/zen-pomodoro/`.

## Credits & License
Based on **Pomodoro Timer** by *gfreeau*. Licensed under the **GPL**.
EOF

echo "==> copy screenshot.png (mandatory for Spices)"
cp "$REPO/screenshot.png" "$OUT/screenshot.png" 2>/dev/null || true

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
echo "   forbidden-pattern scan:"
if grep -rInE "/home/vladimir|[^a-zA-Z]sudo[^a-zA-Z]|focus-start|focus-stop|domains\.txt|_startFocusBlockIfNeeded|_stopFocusBlockIfNeeded|_runFocusPreflight|_runFocusStartScript|_runFocusStopScript|_runPomodoroScript|_checkAndExecuteCustomScript|_getBlockedSitesCount|_focusBlockActive|enable_scripts|_opt_enableScripts|_opt_customShortBreakScript|_opt_customLongBreakScript|sitesText|_sitesLabel|focus-pomodoro|PUBLIC_STRIP|\.config.*pomodoro" "$OUT" 2>/dev/null | grep -v Binary; then
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
