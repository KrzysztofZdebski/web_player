#!/usr/bin/env sh
set -eu

INPUT=${1:-media/source.mp4}
OUTPUT_ROOT=${2:-docs/streams/sample}
SEGMENT_TIME=${3:-4}
DURATION_LIMIT=${4:-}

if [ ! -f "$INPUT" ]; then
  echo "Input file not found: $INPUT" >&2
  echo "Create one with: scripts/create-sample-source.sh media/source.mp4 60" >&2
  exit 1
fi

rm -rf "$OUTPUT_ROOT"
mkdir -p "$OUTPUT_ROOT/180p" "$OUTPUT_ROOT/360p" "$OUTPUT_ROOT/720p"

encode_variant() {
  label=$1
  size=$2
  video_bitrate=$3
  audio_bitrate=$4

  ffmpeg -hide_banner -y ${DURATION_LIMIT:+-t "$DURATION_LIMIT"} -i "$INPUT" \
    -map 0:v:0 -map 0:a:0? \
    -vf "scale=${size}:force_original_aspect_ratio=decrease,pad=${size}:(ow-iw)/2:(oh-ih)/2,setsar=1" \
    -c:v libx264 -preset veryfast -profile:v main -pix_fmt yuv420p \
    -b:v "$video_bitrate" -maxrate "$video_bitrate" -bufsize "$video_bitrate" \
    -g 60 -sc_threshold 0 -force_key_frames "expr:gte(t,n_forced*$SEGMENT_TIME)" \
    -c:a aac -b:a "$audio_bitrate" -ac 2 \
    -hls_time "$SEGMENT_TIME" \
    -hls_playlist_type vod \
    -hls_segment_filename "$OUTPUT_ROOT/$label/segment_%03d.ts" \
    "$OUTPUT_ROOT/$label/playlist.m3u8"
}

encode_variant 180p 320:180 350k 96k
encode_variant 360p 640:360 900k 128k
encode_variant 720p 1280:720 2400k 128k

cat > "$OUTPUT_ROOT/master.m3u8" <<'EOF'
#EXTM3U
#EXT-X-VERSION:3
#EXT-X-STREAM-INF:BANDWIDTH=500000,RESOLUTION=320x180,CODECS="avc1.4d401f,mp4a.40.2"
180p/playlist.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=1100000,RESOLUTION=640x360,CODECS="avc1.4d401f,mp4a.40.2"
360p/playlist.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=2600000,RESOLUTION=1280x720,CODECS="avc1.4d401f,mp4a.40.2"
720p/playlist.m3u8
EOF

echo "Generated HLS package:"
echo "  $OUTPUT_ROOT/master.m3u8"
