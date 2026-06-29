#!/usr/bin/env bash
# Loudness-normalize the ambient loops to one calm, consistent level (EBU R128
# via ffmpeg loudnorm). Run this AFTER gen-ambient-sounds.sh and
# fetch-recordings.sh, so switching ambiences never jumps in volume and none is
# harsh (raw clips ranged from ~-50 dB to clipping before this).
#
# Target ~-23 LUFS with -2 dBTP headroom; the applet's own volume slider then
# scales the absolute level. Roughly idempotent (re-running barely changes
# already-normalized files). Requires ffmpeg.
set -euo pipefail

cd "$(dirname "$0")/../sounds"
TARGET="I=-23:TP=-2:LRA=11"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT

for f in white pink brown rain sea fan wind stream street; do
    [ -f "$f.ogg" ] || continue
    ffmpeg -hide_banner -loglevel error -y -i "$f.ogg" -af "loudnorm=$TARGET" \
        -ac 2 -ar 44100 -c:a libvorbis -b:a 64k "$TMP/$f.ogg" && mv "$TMP/$f.ogg" "$f.ogg"
    echo "normalized $f.ogg"
done
echo "Done. All ambient loops normalized to $TARGET."
