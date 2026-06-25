#!/usr/bin/env bash
# Generate the built-in ambient loops for Zen Pomodoro.
#
# White / pink / brown noise and the rain / sea ambiences are SYNTHESIZED from
# noise with ffmpeg. Noise is not a work of authorship, so these generated files
# are public domain (CC0) — no third-party licensing. Re-run to regenerate.
#
# Requires: ffmpeg (with the anoisesrc source filter).
#
# Loop notes: pure noise loops without an audible seam (broadband). The rain and
# sea tremolo periods divide their file length evenly (rain 0.5 Hz x 10 s = 5;
# sea 0.1 Hz x 20 s = 2) so the amplitude matches at the loop point.
set -euo pipefail

cd "$(dirname "$0")/../sounds"

if ! command -v ffmpeg >/dev/null 2>&1; then
    echo "ffmpeg not found — cannot generate ambient sounds." >&2
    exit 1
fi

FF=(ffmpeg -hide_banner -loglevel error -y)
COMMON=(-ac 1 -ar 44100 -c:a libvorbis -b:a 56k)

# Plain noises.
"${FF[@]}" -f lavfi -i "anoisesrc=color=white:a=0.40:d=8"  -af "lowpass=f=12000"        "${COMMON[@]}" white.ogg
"${FF[@]}" -f lavfi -i "anoisesrc=color=pink:a=0.62:d=8"                                  "${COMMON[@]}" pink.ogg
"${FF[@]}" -f lavfi -i "anoisesrc=color=brown:a=0.92:d=8"                                 "${COMMON[@]}" brown.ogg

# Rain: high-passed white noise with a faint, loop-aligned shimmer.
"${FF[@]}" -f lavfi -i "anoisesrc=color=white:a=0.52:d=10" \
    -af "highpass=f=620,lowpass=f=9000,tremolo=f=0.5:d=0.12,alimiter=limit=0.9" "${COMMON[@]}" rain.ogg

# Sea: low-passed brown noise with a slow wave swell (0.1 Hz).
"${FF[@]}" -f lavfi -i "anoisesrc=color=brown:a=0.92:d=20" \
    -af "lowpass=f=1800,tremolo=f=0.1:d=0.6" "${COMMON[@]}" sea.ogg

echo "Generated:"
ls -la white.ogg pink.ogg brown.ogg rain.ogg sea.ogg
