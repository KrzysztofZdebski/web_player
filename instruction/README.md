# FFmpeg, HLS Playlists and Optional HLS Web Player

Andrzej Matiolanski, Mikolaj Leszczuk

## Introduction

The purpose of this exercise is to refresh selected FFmpeg workflows, generate HTTP Live Streaming (HLS) playlists, and optionally build a browser-based HLS player.

The required Moodle submission is the short report described in Parts 1-3. The browser player in Parts 4-7 is the supplemental micro-project and should be submitted only if you choose to do the optional assignment.

The optional player should use `hls.js` where Media Source Extensions are available and fall back to native HLS playback when the browser supports it directly.

## Learning Goals

After completing this exercise, the student should be able to:

- generate HLS media playlists and a master playlist from a local source,
- serve HLS assets over HTTP for browser playback,
- explain how an HLS master playlist points to multiple bitrate variants,
- explain how HLS playlist and segment requests appear in a browser,
- optionally use `hls.js` to load an HLS stream in a web player,
- optionally implement manual bitrate selection and player diagnostics.

## Prerequisites

### Required software

Install:

- `ffmpeg` and `ffprobe`,
- Python 3, used only for a local static HTTP server,
- a current desktop browser such as Chrome, Firefox, Edge or Safari.

Typical installation commands:

```bash
# Ubuntu
sudo apt update
sudo apt install ffmpeg python3

# macOS with Homebrew
brew install ffmpeg python
```

Check the tools:

```bash
ffmpeg -hide_banner -version
ffprobe -hide_banner -version
python3 --version
```

### Lab materials

Run commands from the exercise root directory:

```bash
cd "08 Micro-Project"
```

Useful files:

- `scripts/create-sample-source.sh`
- `scripts/generate-hls.sh`
- `scripts/serve-player.sh`
- `player/index.html`
- `player/app.js`
- `player/styles.css`

Generated files are written under `player/streams/`.

## Moodle Submission

### 08 Report Assignment

Submit the required short report to:

```text
08 Report Assignment
```

Use the due date shown in Moodle for your course.

Use the Moodle template and include:

1. `Activity 1.0 | Preliminary data` - identify codec type names, video size/dimensions in pixels, display dimensions and capture parameters,
2. `Activity 1.1 | Paste the complete command` - the command used to create `media/source.mp4`,
3. `Activity 1.2 | Paste output of the command` - `ffprobe` summary of the `.mp4` content,
4. `Activity 2.0 | Leading Video & Audio Codecs in the last year`,
5. `Activity 2.1 | Top 3 Cloud Storage Providers`,
6. `Activity 2.2 | Target Bandwidth Reduction in % (H.264 vs. H.265)`,
7. `Activity 2.3 | Bandwidth Reduction (in %) in Screen Capture files` - use your generated source file if you did not make a screen capture,
8. `Activity 3.0 | Sample HLS Playlist Created`.

Parts 1-3 below generate the material for this report.

### 08 Supplemental Exercise (Optional) Assignment

Submit the optional HLS.js micro-project only if you decide to do the supplemental exercise:

```text
08 Supplemental Exercise (Optional) Assignment
```

Submit:

1. link to your functional HLS.js-based web player or repository with all files,
2. additional comments, if needed.

Parts 4-7 below support this optional project. Do not submit the optional player link to `08 Report Assignment`; submit it to `08 Supplemental Exercise (Optional) Assignment`.

## Required Report Exercise

### Part 1. FFmpeg refresher

You can use your own short video file, a screen recording or the generated sample source from this exercise. The generated source is local and does not require downloading external media:

```bash
scripts/create-sample-source.sh media/source.mp4 60
```

Alternative Linux screen capture:

```bash
xdpyinfo | grep dimensions
ffmpeg -f x11grab -framerate 30 -video_size 1280x720 -i :0.0 \
  -c:v libx264 -preset ultrafast -pix_fmt yuv420p media/source.mp4
```

In the X11 example, `:0.0` is the display name. If your environment uses a different display, use the value from `echo "$DISPLAY"` or your desktop session tools.

Alternative macOS screen capture:

```bash
ffmpeg -f avfoundation -list_devices true -i ""
ffmpeg -f avfoundation -framerate 30 -i "<screen device index>:<audio device index>" \
  -c:v libx264 -preset ultrafast -pix_fmt yuv420p media/source.mp4
```

In the macOS example, replace the placeholders with device indexes printed by the first `avfoundation` command.

In FFmpeg commands, `-video_size` uses `WIDTHxHEIGHT` in pixels, for example `1280x720`.

Inspect the result:

```bash
ffprobe -hide_banner media/source.mp4
```

Answer:

1. What are the container format, video codec type and audio codec type?
2. What are the video dimensions in pixels, duration and average bitrate?
3. If you used screen capture, what display name and capture size did you use?
4. Why is a local source preferable to a public web video for a reproducible lab?

### Part 2. Leading codecs and H.264/H.265 comparison

Find available encoders for H.264, H.265 and VP9:

```bash
ffmpeg -hide_banner -encoders | grep -E 'libx264|libx265|libvpx-vp9'
```

Encoder names such as `libx264`, `libx265` and `libvpx-vp9` are FFmpeg encoder identifiers. Use the command above to check which identifiers are available in your local FFmpeg build before using them in a transcoding command.

Create an H.265 version of the source:

```bash
ffmpeg -hide_banner -y -i media/source.mp4 \
  -c:v libx265 -preset medium -tag:v hvc1 \
  -c:a copy media/source_h265.mp4
```

Compare file sizes:

```bash
ls -lh media/source.mp4 media/source_h265.mp4
```

Research checkpoint: open the Encoding.com resource library and identify the newest official Global Media Format Report available when you do the exercise. Record its title and year.

From that report, record:

- the leading video codec,
- the leading audio codec,
- the top cloud storage providers listed in the report.

If the report is unavailable, record that instead of guessing.

Use lecture material or a credible external source for the H.264/H.265 target bitrate comparison. Record the claimed target bitrate reduction and cite the source. Treat it as context, then compare it with your own local transcode result.

Answer:

1. Which H.264, H.265 and VP9 encoder names are available on your machine?
2. How much smaller or larger is `media/source_h265.mp4` compared with `media/source.mp4`?
3. Which report title and year did you use?
4. Which video codec, audio codec and cloud storage providers were leading in that report?
5. What target bitrate reduction does your H.264/H.265 comparison source claim, if you used one?
6. Why can a single local transcode differ from industry-wide codec trends?

### Part 3. Generate HLS playlists

Generate a small adaptive HLS package:

```bash
scripts/generate-hls.sh media/source.mp4 player/streams/sample
```

The script creates:

- `player/streams/sample/master.m3u8`
- `player/streams/sample/180p/playlist.m3u8`
- `player/streams/sample/360p/playlist.m3u8`
- `player/streams/sample/720p/playlist.m3u8`
- MPEG-TS media segments in each variant directory.

Open the master playlist:

```bash
cat player/streams/sample/master.m3u8
```

Answer:

1. Which tags point to available bitrate variants?
2. Which attributes describe bandwidth and resolution?
3. How are media playlists different from the master playlist?

## Optional Supplemental Micro-Project

### Part 4. Validate playback with VLC

Before testing the browser player, validate the generated HLS playlist with VLC:

```bash
# Ubuntu
vlc player/streams/sample/master.m3u8

# macOS
"/Applications/VLC.app/Contents/MacOS/VLC" player/streams/sample/master.m3u8
```

Answer:

1. Does playback start correctly?
2. Does VLC expose the available quality variants?
3. What failure do you see if segments are missing or paths are wrong?

### Part 5. Serve the player over HTTP

Do not open the player through `file://`. HLS playback in browsers should be tested through HTTP so playlist and segment requests behave like real web delivery.

Start the local server:

```bash
scripts/serve-player.sh 8008
```

Open:

```text
http://127.0.0.1:8008/
```

After generating local HLS assets, select "Local ABR sample". That predefined source points to:

```text
streams/sample/master.m3u8
```

Answer:

1. Does the player load the local HLS stream?
2. Which quality level is selected automatically after playback starts?
3. What happens when you switch quality manually?

### Part 6. Inspect browser requests

Open browser Developer Tools and switch to the Network tab. Start playback and filter requests by:

```text
m3u8
ts
```

The starter player also logs HLS requests observed through `hls.js` events.

Use `curl` to inspect the playlist through the same local HTTP server:

```bash
curl http://127.0.0.1:8008/streams/sample/master.m3u8
```

Answer:

1. Which request loads the master playlist?
2. Which requests load media playlists?
3. Which requests load media segments?
4. How does the request pattern change after a manual bitrate switch?

### Part 7. Customize the micro-project player

The starter player is intentionally small. Extend it into your submitted project.

Required features:

- successful HLS playback,
- a predefined list of at least 2-3 HLS playlists,
- a custom URL input,
- manual bitrate switching,
- automatic bitrate mode,
- display of bitrate, width, height and codec information when available,
- visible log of requested playlists and segments or equivalent evidence from browser Developer Tools.

Optional features:

- display of recent buffer and playback statistics,
- persistent custom playlist list,
- clearer error handling for missing playlists or CORS failures,
- access control mock-up for premium content,
- country/IP based access check using a documented API or a server-side implementation.

If you implement IP or geolocation based access control, document what is enforced on the server side and what is only a browser-side demonstration. Browser-only checks are easy to bypass and should not be described as secure content protection.

## Troubleshooting

### The player works in VLC but not in the browser

Check that you opened the player through `http://127.0.0.1:8008/`, not through `file://`.

If the stream is remote, check CORS headers. Browser playback requires cross-origin access when playlists or segments are loaded from a different origin.

### The browser reports that HLS is unsupported

Use a current desktop browser. `hls.js` requires Media Source Extensions in most browsers. Safari can use native HLS playback for many streams.

### The generated stream has no audio

Use `ffprobe` to check whether the source file has an audio stream. The sample source generated by `scripts/create-sample-source.sh` includes AAC audio.

### Copied commands do not work

Use plain ASCII hyphens in command-line options, for example `-hls_time`, not typographic dashes copied from rich-text documents.

## References

1. hls.js project and usage guide, <https://github.com/video-dev/hls.js/>
2. hls.js latest demo, <https://hlsjs.video-dev.org/demo/>
3. RFC 8216: HTTP Live Streaming, <https://www.rfc-editor.org/rfc/rfc8216>
4. FFmpeg Documentation, <https://ffmpeg.org/documentation.html>
5. FFmpeg HLS muxer documentation, <https://ffmpeg.org/ffmpeg-formats.html#hls-2>
6. VLC User Documentation, <https://docs.videolan.me/vlc-user/>
7. Encoding.com Resource Library, <https://www.encoding.com/resources/>
