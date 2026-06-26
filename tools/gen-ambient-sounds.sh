#!/usr/bin/env bash
# Generate the built-in ambient loops for Zen Pomodoro.
#
# The noise ambiences (white/pink/brown noise, rain, wind) are SYNTHESIZED from
# noise with ffmpeg. Noise is not a work of authorship, so these generated
# files are public domain (CC0) — no third-party licensing. Re-run to
# regenerate, then run tools/normalize-sounds.sh to level the volume.
#
# (fan, street, sea and stream are real field recordings, also CC0 — fetched +
# looped by tools/fetch-recordings.sh, NOT generated here.)
#
# Requires: ffmpeg + ffprobe (with the anoisesrc source filter).
#
# Loop notes: white/pink/brown/rain rely on broadband noise masking the loop
# point; wind is additionally wrapped with a short equal-power crossfade
# (seamless(): the last <xf>s blends into the first <xf>s) so the seam is
# inaudible.
set -euo pipefail

cd "$(dirname "$0")/../sounds"

if ! command -v ffmpeg >/dev/null 2>&1; then
    echo "ffmpeg not found — cannot generate ambient sounds." >&2
    exit 1
fi

FF=(ffmpeg -hide_banner -loglevel error -y)
COMMON=(-ac 1 -ar 44100 -c:a libvorbis -b:a 56k)

# Wrap a clip into a seamless loop: fold its last <xf> seconds over the first
# <xf> (equal-power crossfade), so the end flows into the start with no seam.
seamless() {  # in out xf
    local in="$1" out="$2" xf="$3" L Lmxf
    L=$(ffprobe -v error -show_entries format=duration -of default=nw=1:nk=1 "$in")
    Lmxf=$(awk "BEGIN{printf \"%.3f\", $L-$xf}")
    "${FF[@]}" -i "$in" -filter_complex \
"[0:a]aresample=44100,aformat=channel_layouts=mono,asplit=3[s1][s2][s3];\
[s1]atrim=start=$Lmxf,asetpts=N/SR/TB,afade=t=out:st=0:d=$xf:curve=qsin[tail];\
[s2]atrim=0:$xf,asetpts=N/SR/TB,afade=t=in:st=0:d=$xf:curve=qsin[head];\
[tail][head]amix=inputs=2:normalize=0[seg1];\
[s3]atrim=$xf:$Lmxf,asetpts=N/SR/TB[seg2];\
[seg1][seg2]concat=n=2:v=0:a=1,alimiter=limit=0.95[out]" \
        -map "[out]" -ac 1 -ar 44100 -c:a libvorbis -b:a 64k "$out"
}

TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT

# Plain noises.
"${FF[@]}" -f lavfi -i "anoisesrc=color=white:a=0.40:d=8"  -af "lowpass=f=12000"        "${COMMON[@]}" white.ogg
"${FF[@]}" -f lavfi -i "anoisesrc=color=pink:a=0.62:d=8"                                  "${COMMON[@]}" pink.ogg
"${FF[@]}" -f lavfi -i "anoisesrc=color=brown:a=0.92:d=8"                                 "${COMMON[@]}" brown.ogg

# Rain: high-passed white noise with a faint, loop-aligned shimmer.
"${FF[@]}" -f lavfi -i "anoisesrc=color=white:a=0.52:d=10" \
    -af "highpass=f=620,lowpass=f=9000,tremolo=f=0.5:d=0.12,alimiter=limit=0.9" "${COMMON[@]}" rain.ogg

# Wind: band-passed pink noise with gentle gusts, then wrapped seamless (15 s).
"${FF[@]}" -f lavfi -i "anoisesrc=color=pink:a=0.80:d=15" \
    -af "highpass=f=180,lowpass=f=3200,tremolo=f=0.2:d=0.35,alimiter=limit=0.9" "${COMMON[@]}" "$TMP/wind.ogg"
seamless "$TMP/wind.ogg" wind.ogg 1.5

echo "Generated:"
ls -la white.ogg pink.ogg brown.ogg rain.ogg wind.ogg
echo "(fan/street/sea/stream are CC0 recordings — run tools/fetch-recordings.sh)"
echo "(then run tools/normalize-sounds.sh to level all the volumes)"
