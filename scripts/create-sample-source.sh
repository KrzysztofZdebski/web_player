#!/usr/bin/env sh
set -eu

OUTPUT=${1:-media/source.mp4}
DURATION=${2:-60}

mkdir -p "$(dirname "$OUTPUT")"

exec ffmpeg -hide_banner -y \
  -f lavfi -i "testsrc2=size=1280x720:rate=30" \
  -f lavfi -i "sine=frequency=440:sample_rate=48000" \
  -t "$DURATION" \
  -c:v libx264 -preset veryfast -pix_fmt yuv420p -g 60 \
  -c:a aac -b:a 128k \
  -shortest "$OUTPUT"
