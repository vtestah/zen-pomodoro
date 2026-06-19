#!/usr/bin/env bash
# Build the sanitized, Cinnamon-Spices-ready PUBLIC package from the LIVE applet.
# Source of truth = this repo. Output = dist/<UUID>/ (gitignored).
# Sanitization is driven by // @PUBLIC_STRIP_BEGIN [..ELSE..] @PUBLIC_STRIP_END
# markers in the source plus the path rewrites below. The build FAILS if any
# private remnant is detected, so the package can never silently leak.
set -euo pipefail

UUID="zen-pomodoro@vtestah"
NAME="Zen Pomodoro"
VERSION="1.0.0"

REPO="$(cd "$(dirname "$0")" && pwd)"
SRC="$REPO/6.4"
OUT="$REPO/dist/$UUID"
FILES="$OUT/files/$UUID"

echo "==> clean output"
rm -rf "$OUT"
mkdir -p "$FILES/po"

echo "==> copy code + assets (no .mo)"
cp "$SRC/applet.js" "$SRC/timer.js" "$SRC/sound.js" "$SRC/stylesheet.css" "$SRC/settings-schema.json" "$FILES/"
cp "$REPO"/*.png "$REPO"/*.svg "$FILES/" 2>/dev/null || true
[ -d "$REPO/sounds" ] && cp -r "$REPO/sounds" "$FILES/"
[ -d "$REPO/bin" ] && cp -r "$REPO/bin" "$FILES/"
cp "$REPO/po/"*.po "$FILES/po/"

echo "==> process applet.js (strip markers + rewrite paths)"
python3 - "$FILES/applet.js" <<'PY'
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
# Ensure the state dir exists before writing either file.
s=re.sub(r'(\n(\s*)GLib\.file_set_contents\((POMODORO_STATE_FILE|POMODORO_STATS_FILE),)',
         r'\n\2GLib.mkdir_with_parents(GLib.path_get_dirname(\3), 0o700);\1', s)

open(f,'w',encoding='utf-8').write(s)
print("   applet.js processed")
PY

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
json.dump(d,open(f,'w',encoding='utf-8'),ensure_ascii=False,indent=4); open(f,'a').write('\n')
print("   settings-schema.json cleaned")
PY

echo "==> clean obsolete references from po"
for po in "$FILES/po/"*.po; do
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

A calm, Zen-style Pomodoro timer for the Cinnamon panel. Gentle on-screen cues
instead of anxious alarms. Based on **Pomodoro Timer** by *gfreeau*.

![screenshot](screenshot.png)

## Features
- Context-aware menu: compact while running, expanded when idle.
- Soft focus frame: an unobtrusive edge glow with progress drawn around the
  screen; the bottom edge stays open so it never covers a panel.
- Calm by design: no anxious blinking near the end; a single gentle breath in
  the last minute and a brief completion flourish.
- Optional Zen full-screen mode, breathing guide on breaks, ambient sound.
- Daily goal + streak, flow extend, idle auto-pause, "Focus until…",
  panel progress ring.
- Appearance: theme presets + custom accent colors, frame style, glow
  intensity, font scale, with a live preview button.
- Full localization (gettext). Persistent data under `$XDG_STATE_HOME/zen-pomodoro/`.

This applet only draws on the panel, its own menu and its own transparent focus
overlays. It does not modify the system, block websites, or run external scripts.

## Credits & License
Original applet: **Pomodoro Timer** by gfreeau. Licensed under the **GPL**.
EOF

echo "==> VALIDATE"
fail=0
cjs -c "const G=imports.gi.GLib;let[o,c]=G.file_get_contents('$FILES/applet.js');try{Reflect.parse(imports.byteArray.toString(c));print('   applet.js: parse OK');}catch(e){print('   applet.js: PARSE FAIL '+e.message);}" | tee /tmp/zen_parse.txt
grep -q "PARSE FAIL" /tmp/zen_parse.txt && fail=1
for j in "$FILES/metadata.json" "$FILES/settings-schema.json" "$OUT/info.json"; do
  python3 -m json.tool "$j" >/dev/null && echo "   JSON OK: ${j##*/}" || { echo "   JSON FAIL: $j"; fail=1; }
done
echo "   forbidden-pattern scan:"
if grep -rInE "/home/vladimir|[^a-zA-Z]sudo[^a-zA-Z]|focus-start|focus-stop|/etc/hosts|domains\.txt|PUSHOVER|Pushover|_startFocusBlockIfNeeded|_stopFocusBlockIfNeeded|_runFocusPreflight|_runFocusStartScript|_runFocusStopScript|_runPomodoroScript|_checkAndExecuteCustomScript|_getBlockedSitesCount|_focusBlockActive|enable_scripts|_opt_enableScripts|_opt_customShortBreakScript|_opt_customLongBreakScript|sitesText|_sitesLabel|focus-pomodoro|PUBLIC_STRIP|\.config.*pomodoro" "$OUT" 2>/dev/null | grep -v Binary; then
  echo "   !! FORBIDDEN REMNANTS FOUND"; fail=1
else
  echo "   clean"
fi
if ls "$FILES/po/"*.mo >/dev/null 2>&1 || ls "$FILES/po/"*.pot >/dev/null 2>&1; then echo "   !! po has .mo/.pot"; fail=1; else echo "   po: only .po"; fi
rm -f /tmp/zen_parse.txt
if [ "$fail" -ne 0 ]; then echo "==> BUILD FAILED (see above)"; exit 1; fi
echo "==> BUILD OK -> $OUT"
