#!/usr/bin/env bash
# Fetch + process the two RECORDED ambiences (fan, street) for Zen Pomodoro.
#
# Unlike the synthesized ambiences (see gen-ambient-sounds.sh), these are real
# field recordings. Both are CC0 / public domain — no attribution required and
# free to redistribute, which keeps them compatible with this GPLv3 package.
# Source: BigSoundBank (Joseph Sardin), CC0:
#   fan    #0078  https://bigsoundbank.com/electric-fan-1-s0078.html
#   street #1080  https://bigsoundbank.com/sound-1080-parisian-ring-road.html
#
# Each is downmixed to mono 44.1 kHz and wrapped into a seamless loop with an
# equal-power crossfade (the end blends into the start) so it loops with no
# audible seam. Re-run to refresh sounds/fan.ogg and sounds/street.ogg.
#
# Requires: curl, ffmpeg + ffprobe.
set -euo pipefail

cd "$(dirname "$0")/../sounds"
UA="Mozilla/5.0 (X11; Linux x86_64)"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT

# Wrap a clip into a seamless loop: fold its last <xf> seconds over the first
# <xf> (equal-power crossfade), so the end flows into the start with no seam.
seamless() {  # in out xf
    local in="$1" out="$2" xf="$3" L Lmxf
    L=$(ffprobe -v error -show_entries format=duration -of default=nw=1:nk=1 "$in")
    Lmxf=$(awk "BEGIN{printf \"%.3f\", $L-$xf}")
    ffmpeg -hide_banner -loglevel error -y -i "$in" -filter_complex \
"[0:a]aresample=44100,aformat=channel_layouts=mono,asplit=3[s1][s2][s3];\
[s1]atrim=start=$Lmxf,asetpts=N/SR/TB,afade=t=out:st=0:d=$xf:curve=qsin[tail];\
[s2]atrim=0:$xf,asetpts=N/SR/TB,afade=t=in:st=0:d=$xf:curve=qsin[head];\
[tail][head]amix=inputs=2:normalize=0[seg1];\
[s3]atrim=$xf:$Lmxf,asetpts=N/SR/TB[seg2];\
[seg1][seg2]concat=n=2:v=0:a=1,alimiter=limit=0.95[out]" \
        -map "[out]" -ac 1 -ar 44100 -c:a libvorbis -b:a 64k "$out"
}

echo "==> fan (BigSoundBank #0078, CC0)"
curl -sSL --max-time 60 -A "$UA" -o "$TMP/fan.mp3" "https://bigsoundbank.com/UPLOAD/mp3/0078.mp3"
seamless "$TMP/fan.mp3" fan.ogg 1.0

echo "==> street (BigSoundBank #1080 Parisian ring road, CC0)"
curl -sSL --max-time 120 -A "$UA" -o "$TMP/street.mp3" "https://bigsoundbank.com/UPLOAD/mp3/1080.mp3"
# Take a steady 25 s segment (dense, continuous traffic), then loop it.
ffmpeg -hide_banner -loglevel error -y -ss 15 -t 25 -i "$TMP/street.mp3" -ac 1 -ar 44100 "$TMP/street_trim.wav"
seamless "$TMP/street_trim.wav" street.ogg 2.0

echo "Done:"
ls -la fan.ogg street.ogg
