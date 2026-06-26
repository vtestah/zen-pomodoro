#!/usr/bin/env bash
# Fetch + process the RECORDED ambiences (fan, street, sea, stream) for Zen
# Pomodoro.
#
# Unlike the synthesized ambiences (see gen-ambient-sounds.sh), these are real
# field recordings. All are CC0 / public domain — no attribution required and
# free to redistribute, which keeps them compatible with this GPLv3 package.
# Source: BigSoundBank (Joseph Sardin), CC0:
#   fan    #0078  https://bigsoundbank.com/electric-fan-1-s0078.html
#   street #1080  https://bigsoundbank.com/sound-1080-parisian-ring-road.html
#   sea    #1047  https://bigsoundbank.com/sound-1047-petites-vagues-dos-ocean.html
#   stream #3222  https://bigsoundbank.com/mountain-stream-7-s3222.html
#
# Each is downmixed to mono 44.1 kHz and wrapped into a seamless loop with an
# equal-power crossfade (the end blends into the start) so it loops with no
# audible seam. Re-run to refresh the clips, then run tools/normalize-sounds.sh
# to level the volume against the other ambiences.
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

echo "==> sea (BigSoundBank #1047 small ocean waves, CC0)"
curl -sSL --max-time 120 -A "$UA" -o "$TMP/sea.mp3" "https://bigsoundbank.com/UPLOAD/mp3/1047.mp3"
# Take a steady 30 s segment of gentle waves, then loop it.
ffmpeg -hide_banner -loglevel error -y -ss 20 -t 30 -i "$TMP/sea.mp3" -ac 1 -ar 44100 "$TMP/sea_trim.wav"
seamless "$TMP/sea_trim.wav" sea.ogg 3.0

echo "==> stream (BigSoundBank #3222 mountain stream, CC0)"
curl -sSL --max-time 120 -A "$UA" -o "$TMP/stream.mp3" "https://bigsoundbank.com/UPLOAD/mp3/3222.mp3"
# Take a steady 25 s segment of continuous flowing water, then loop it.
ffmpeg -hide_banner -loglevel error -y -ss 30 -t 25 -i "$TMP/stream.mp3" -ac 1 -ar 44100 "$TMP/stream_trim.wav"
seamless "$TMP/stream_trim.wav" stream.ogg 2.0

echo "Done:"
ls -la fan.ogg street.ogg sea.ogg stream.ogg
